"""Pipeline evaluation rig CLI entrypoint.

Run via:
  cd pipeline-service && uv run python -m pipeline_service.eval.run_eval

Behaviour:
  - Walks the corpus tree (corpora/).
  - For each scene, runs the Dagster pipeline against the 3 frames.
  - Computes per-corpus aggregate metrics via metrics module.
  - Loads thresholds.json with two buckets:
      * gating: violations cause non-zero exit (CI fails the build)
      * warn:   violations are logged + recorded but exit code stays 0
  - Writes last-metrics.json and exits non-zero only if a *gating* threshold
    is violated AND the corpus is non-empty.

Until corpora/ contains scenes, the runner reports without gating
(informational mode) and exits 0.

EVAL_MOCK_BACKENDS=1 also forces informational mode: synthetic detector
outputs lack the statistical properties that the precision/coverage
gates were calibrated against, so gating against them would either
require fragile tuning of synthetic outputs OR produce false negatives.
The mock-backend path exists to verify pipeline plumbing, not metric
quality.
"""
from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from pipeline_service.eval import metrics as M
from pipeline_service.types import SceneObservation


# Canonical eval/ dir is at the top of the pipeline-service repo (plan §6),
# not inside the python package. We resolve up two parents:
#   __file__ = pipeline-service/pipeline_service/eval/run_eval.py
#   parent.parent.parent = pipeline-service/
_EVAL_ROOT = Path(__file__).resolve().parent.parent.parent / "eval"
CORPORA = _EVAL_ROOT / "corpora"
THRESHOLDS = _EVAL_ROOT / "thresholds.json"
LAST_METRICS = _EVAL_ROOT / "last-metrics.json"
BASELINE = _EVAL_ROOT / "baseline.json"


_DEFAULT_THRESHOLDS_PAYLOAD = {
    "gating": {
        "agreement_coverage_min": 0.70,
        "dedup_precision_min": 0.88,
        "op_failure_rate_max": 0.05,
        "class_aware_map_50_95_min": 0.20,
        "class_agnostic_map_50_95_min": 0.30,
        "label_f1_min": 0.50,
        "hallucination_rate_max": 0.15,
    },
    "warn": {
        "agreement_precision_min": 0.40,
        "self_diagnosis_trigger_rate_max": 0.30,
        "single_source_run_rate_max": 0.05,
        "empty_detection_set_rate_max": 0.02,
        "class_aware_map_50_min": 0.30,
        "box_f1_50_min": 0.45,
        "novel_likely_correct_min": 0,
    },
}


_TRUTHY = {"1", "true", "yes", "on"}


def _env_bool(name: str, *, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in _TRUTHY


def _ensure_thresholds_file(path: Path) -> dict:
    """Read thresholds.json, creating/extending with defaults as needed.

    - Missing file: write the default payload and return it.
    - Malformed JSON: re-raise (no silent fallback) per §08 contract.
    - Present: deep-merge defaults; preserve every existing key/value verbatim.
    """
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(_DEFAULT_THRESHOLDS_PAYLOAD, indent=2, sort_keys=True))
        return json.loads(json.dumps(_DEFAULT_THRESHOLDS_PAYLOAD))
    raw_text = path.read_text()
    try:
        existing = json.loads(raw_text)
    except json.JSONDecodeError:
        raise
    # Deep merge: only add missing keys; preserve existing values verbatim.
    if not isinstance(existing, dict):
        return existing
    out = dict(existing)
    for bucket_name, bucket_values in _DEFAULT_THRESHOLDS_PAYLOAD.items():
        existing_bucket = out.get(bucket_name)
        if not isinstance(existing_bucket, dict):
            out[bucket_name] = dict(bucket_values)
            continue
        merged = dict(existing_bucket)
        for k, v in bucket_values.items():
            merged.setdefault(k, v)
        out[bucket_name] = merged
    if existing != out:
        path.write_text(json.dumps(out, indent=2, sort_keys=True))
    return out


@dataclass
class Report:
    observations: list[SceneObservation] = field(default_factory=list)
    pairs: list[tuple[SceneObservation, SceneObservation]] = field(default_factory=list)

    def to_metrics_dict(self) -> dict:
        cov = M.agreement_coverage_avg(self.observations)
        prec = M.agreement_precision_avg(self.observations)
        op_fail = M.op_failure_rate(self.observations)
        diag = M.self_diagnosis_trigger_rate(self.observations)
        single = M.single_source_run_rate(self.observations)
        empty = M.empty_detection_set_rate(self.observations)
        stab = (
            sum(M.multi_frame_stability(a, b) for a, b in self.pairs) / len(self.pairs)
            if self.pairs
            else 0.0
        )
        return {
            "agreement_coverage_avg": cov,
            "agreement_precision_avg": prec,
            "op_failure_rate": op_fail,
            "self_diagnosis_trigger_rate": diag,
            "single_source_run_rate": single,
            "empty_detection_set_rate": empty,
            "multi_frame_stability_avg": stab,
            "n_observations": len(self.observations),
            "n_pairs": len(self.pairs),
        }


# Map metric_key -> (threshold_key, comparison) for each bucket.
# dedup_precision_min is the canonical name in the gating bucket; it's
# compared against the agreement_precision_avg metric (per plan §6.3).
_GATING_RULES: list[tuple[str, str, str]] = [
    ("agreement_coverage_avg", "agreement_coverage_min", "min"),
    ("agreement_precision_avg", "dedup_precision_min", "min"),
    ("op_failure_rate", "op_failure_rate_max", "max"),
]

_WARN_RULES: list[tuple[str, str, str]] = [
    ("agreement_precision_avg", "agreement_precision_min", "min"),
    ("self_diagnosis_trigger_rate", "self_diagnosis_trigger_rate_max", "max"),
    ("single_source_run_rate", "single_source_run_rate_max", "max"),
    ("empty_detection_set_rate", "empty_detection_set_rate_max", "max"),
]


def _check_bucket(
    metrics_d: dict,
    bucket: dict,
    rules: list[tuple[str, str, str]],
) -> list[str]:
    """Return a list of human-readable violations for one threshold bucket."""
    violations: list[str] = []
    for metric_key, threshold_key, kind in rules:
        if threshold_key not in bucket:
            continue
        value = metrics_d[metric_key]
        limit = bucket[threshold_key]
        if kind == "min" and value < limit:
            violations.append(f"{metric_key}={value:.3f} < {limit:.3f}")
        elif kind == "max" and value > limit:
            violations.append(f"{metric_key}={value:.3f} > {limit:.3f}")
    return violations


def _corpus_is_empty(corpora_dir: Path) -> bool:
    if not corpora_dir.exists():
        return True
    return all(False for _ in corpora_dir.iterdir())


def run(
    *,
    observations: list[SceneObservation] | None = None,
    pairs: list[tuple[SceneObservation, SceneObservation]] | None = None,
    corpora_dir: Path | None = None,
    thresholds_path: Path | None = None,
    output_path: Path | None = None,
    gating: bool | None = None,
    gt_metrics_block=None,
    gt_diff=None,
) -> tuple[int, dict]:
    """Programmatic entrypoint. Returns (exit_code, report_dict).

    ``observations`` + ``pairs``: caller-supplied data (used by tests).
    Otherwise the rig walks the corpus on disk. With no real corpus
    capture available, the rig falls back to "no observations" -
    informational mode.
    """
    corpora_dir = corpora_dir or CORPORA
    thresholds_path = thresholds_path or THRESHOLDS
    output_path = output_path or LAST_METRICS

    if observations is None and pairs is None:
        # Caller didn't supply data — walk the corpus on disk so a populated
        # corpora/ tree produces real observations rather than a vacuous
        # "0 observations vs gating threshold" failure.
        if not _corpus_is_empty(corpora_dir):
            from pipeline_service.eval import corpus_walker as cw
            obs_list, pair_list = cw.run_corpus(corpora_dir)
        else:
            obs_list, pair_list = [], []
    else:
        obs_list = observations if observations is not None else []
        pair_list = pairs if pairs is not None else []

    obs = obs_list
    corpus_empty = _corpus_is_empty(corpora_dir) and not obs and not pair_list
    mock_backends = os.environ.get("EVAL_MOCK_BACKENDS") == "1"

    if gating is None:
        # Gating is OFF when:
        #   - the corpus is empty (nothing to gate against), OR
        #   - mock backends are on (synthetic outputs aren't gate-able).
        gating = not corpus_empty and not mock_backends

    report_d = Report(observations=list(obs), pairs=list(pair_list)).to_metrics_dict()

    raw: dict = {}
    if thresholds_path.exists():
        raw = json.loads(thresholds_path.read_text())

    # Backwards compatibility: if the file is a flat dict (legacy), promote
    # it into a {"gating": ...} bucket so tests written against the old
    # shape still run.
    if raw and "gating" not in raw and "warn" not in raw:
        raw = {"gating": raw, "warn": {}}

    gating_bucket = raw.get("gating", {})
    warn_bucket = raw.get("warn", {})

    gating_violations: list[str] = []
    warn_violations: list[str] = []
    if gating:
        gating_violations = _check_bucket(report_d, gating_bucket, _GATING_RULES)
        warn_violations = _check_bucket(report_d, warn_bucket, _WARN_RULES)

    ok = not gating_violations  # warn does NOT affect exit code

    payload: dict = {
        "metrics": report_d,
        "thresholds": raw,
        "violations": gating_violations,
        "warnings": warn_violations,
        "corpus_empty": corpus_empty,
        "gating": gating,
        "ok": ok,
    }

    # GT-eval block (injected by callers; ``main`` and integration tests do
    # the heavy lifting). The shape mirrors the §08 schema.
    gt_block_failures: list[str] = []
    if gt_metrics_block is not None:
        from dataclasses import asdict

        gt_dict = _gt_metrics_block_to_dict(gt_metrics_block)
        payload["gt_metrics"] = gt_dict
        # Floor enforcement against thresholds bucket.
        gating_for_gt = raw.get("gating", {}) if isinstance(raw, dict) else {}
        gt_block_failures = _check_gt_floors(gt_dict["headline"], gating_for_gt)
        if gt_block_failures:
            payload["violations"] = list(payload["violations"]) + gt_block_failures
    if gt_diff is not None:
        payload["gt_diff"] = (
            asdict(gt_diff) if not isinstance(gt_diff, dict) else gt_diff
        )
        if (
            isinstance(payload["gt_diff"], dict)
            and payload["gt_diff"].get("regressions")
            and not payload["gt_diff"].get("version_mismatch", False)
        ):
            payload["violations"] = list(payload["violations"]) + [
                f"gt_regression:{r['metric']}" for r in payload["gt_diff"]["regressions"]
            ]

    final_ok = not payload["violations"]
    payload["ok"] = final_ok
    output_path.write_text(json.dumps(payload, indent=2, sort_keys=True, default=str))
    return (0 if final_ok else 1, payload)


def _gt_metrics_block_to_dict(block) -> dict:
    """Serialize a ``GtMetricsBlock`` (or already-dict) to JSON-friendly dict."""
    if isinstance(block, dict):
        return block
    return {
        "headline": {
            "class_aware_map_50_95": block.headline.class_aware_map_50_95,
            "class_aware_map_50": block.headline.class_aware_map_50,
            "class_agnostic_map_50_95": block.headline.class_agnostic_map_50_95,
            "class_agnostic_map_50": block.headline.class_agnostic_map_50,
            "label_f1": block.headline.label_f1,
            "box_f1_50": block.headline.box_f1_50,
            "hallucination_rate": block.headline.hallucination_rate,
            "novel_likely_correct": block.headline.novel_likely_correct,
            "judge_unsure": block.headline.judge_unsure,
        },
        "per_class_top10": [
            {"category": c.category, "ap": c.ap} for c in block.per_class_top10
        ],
        "per_class_bottom10": [
            {"category": c.category, "ap": c.ap} for c in block.per_class_bottom10
        ],
        "n_images": int(block.n_images),
        "n_predictions": int(block.n_predictions),
        "n_ground_truths": int(block.n_ground_truths),
        "runtime_s": float(block.runtime_s),
    }


def _check_gt_floors(headline: dict, gating_bucket: dict) -> list[str]:
    """Return a list of GT-block floor violations as human-readable strings."""
    floor_map = {
        "class_aware_map_50_95_min": ("class_aware_map_50_95", "min"),
        "class_agnostic_map_50_95_min": ("class_agnostic_map_50_95", "min"),
        "label_f1_min": ("label_f1", "min"),
        "hallucination_rate_max": ("hallucination_rate", "max"),
    }
    out: list[str] = []
    for floor_key, (metric, kind) in floor_map.items():
        if floor_key not in gating_bucket:
            continue
        try:
            limit = float(gating_bucket[floor_key])
        except (TypeError, ValueError):
            continue
        cur = headline.get(metric)
        if cur is None:
            continue
        try:
            cur_f = float(cur)
        except (TypeError, ValueError):
            continue
        if kind == "min" and cur_f < limit:
            out.append(f"gt_{metric}={cur_f:.3f} < {limit:.3f}")
        elif kind == "max" and cur_f > limit:
            out.append(f"gt_{metric}={cur_f:.3f} > {limit:.3f}")
    return out


def _build_gt_eval_inputs():
    """Construct the orchestrator collaborators from env config.

    Lazy-imports gt_eval modules so the legacy agreement-only path does
    not pay the cost of importing pycocotools, sentence-transformers,
    etc. when ``EVAL_RUN_GT=false``.
    """
    from pipeline_service.eval.gt_eval.datasets.lvis import LvisConfig, LvisDataset
    from pipeline_service.eval.gt_eval.judges.qwen_local import QwenLocalJudge
    from pipeline_service.eval.gt_eval.matchers.label_cosine import CosineLabelMatcher
    from pipeline_service.eval.gt_eval.run import GtEvalConfig
    from pipeline_service.eval.gt_eval.runner import single_image_pipeline_runner

    sample_size = int(os.environ.get("EVAL_SAMPLE_SIZE", "500"))
    seed = int(os.environ.get("EVAL_SEED", "0"))
    label_theta = float(os.environ.get("EVAL_LABEL_MATCH_THETA", "0.6"))
    iou_threshold = float(os.environ.get("EVAL_IOU_THRESHOLD", "0.5"))
    apply_skip_sahi = _env_bool("EVAL_SKIP_SAHI", default=False)
    top_k_raw = os.environ.get("CLASSIFICATION_TOP_K")
    top_k = int(top_k_raw) if top_k_raw else None
    judge_max_calls_raw = os.environ.get("HALLUCINATION_JUDGE_MAX_CALLS")
    judge_max_calls = int(judge_max_calls_raw) if judge_max_calls_raw else None

    use_judge = _env_bool("EVAL_USE_JUDGE", default=True)
    judge = QwenLocalJudge() if use_judge else None

    dataset = LvisDataset(
        LvisConfig(
            sample_size=sample_size,
            seed=seed,
            expected_archive_sha256=os.environ.get("EVAL_LVIS_SHA256") or None,
        )
    )
    label_matcher = CosineLabelMatcher(threshold=label_theta)
    config = GtEvalConfig(
        sample_size=sample_size,
        label_match_threshold=label_theta,
        iou_threshold=iou_threshold,
        judge=judge,
        judge_max_calls=judge_max_calls,
        write_baseline=_env_bool("EVAL_BASELINE_AUTOCOMMIT", default=False),
        apply_eval_skip_sahi=apply_skip_sahi,
        apply_eval_top_k=top_k,
    )

    def _runner(image_path):
        return single_image_pipeline_runner(
            image_path,
            apply_eval_skip_sahi=config.apply_eval_skip_sahi,
            apply_eval_top_k=config.apply_eval_top_k,
        )

    def _health_check() -> None:
        url = os.environ.get(
            "DETECTION_SERVICE_URL", "http://127.0.0.1:14001"
        )
        try:
            import httpx
        except ImportError:
            return None
        try:
            with httpx.Client(timeout=5.0) as client:
                resp = client.get(f"{url.rstrip('/')}/health")
                if resp.status_code >= 400:
                    from pipeline_service.eval.gt_eval.run import PreflightFailed

                    raise PreflightFailed(
                        f"detection-service /health returned {resp.status_code}"
                    )
        except httpx.RequestError as exc:
            from pipeline_service.eval.gt_eval.run import PreflightFailed

            raise PreflightFailed(
                f"detection-service /health unreachable at {url}: {exc}"
            ) from exc
        return None

    return config, dataset, _runner, _health_check, label_matcher


def _build_current_stamps():
    """Build the ``Stamps`` for baseline diff/commit."""
    import sys as _sys
    from datetime import datetime, timezone

    from pipeline_service.eval.gt_eval.baseline import Stamps

    return Stamps(
        lvis_dataset_sha256=os.environ.get("EVAL_LVIS_SHA256", "unknown"),
        label_encoder_model_id=os.environ.get(
            "LABEL_ENCODER_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
        ),
        python_version=_sys.version.split()[0],
        created_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )


def main(argv: Iterable[str] | None = None) -> int:
    try:
        _ensure_thresholds_file(THRESHOLDS)
    except json.JSONDecodeError as exc:
        print(f"[runner] FATAL: malformed thresholds.json: {exc}", file=sys.stderr)
        return 2

    run_agreement = _env_bool("EVAL_RUN_AGREEMENT", default=True)
    run_gt = _env_bool("EVAL_RUN_GT", default=True)

    gt_block = None
    gt_diff_obj = None

    if run_gt:
        try:
            (
                config,
                dataset,
                runner_fn,
                health_check,
                label_matcher,
            ) = _build_gt_eval_inputs()
        except Exception as exc:
            print(
                f"[runner] FATAL: GT-eval setup failed: {type(exc).__name__}: {exc}",
                file=sys.stderr,
            )
            return 2

        from pipeline_service.eval.gt_eval.baseline import (
            diff_and_check,
            maybe_commit_baseline,
        )
        from pipeline_service.eval.gt_eval.run import (
            PipelineFailureRateExceeded,
            PreflightFailed,
            run_gt_eval,
        )

        try:
            gt_block = run_gt_eval(
                config,
                dataset,
                runner_fn,
                detection_health_check=health_check,
                label_matcher=label_matcher,
            )
        except PreflightFailed as exc:
            print(f"[runner] FATAL: preflight: {exc}", file=sys.stderr)
            return 2
        except PipelineFailureRateExceeded as exc:
            print(f"[runner] FAIL: {exc}", file=sys.stderr)
            return 1
        except Exception as exc:
            print(
                f"[runner] FATAL: GT-eval crashed: {type(exc).__name__}: {exc}",
                file=sys.stderr,
            )
            return 2

        stamps = _build_current_stamps()
        gt_diff_obj = diff_and_check(
            gt_block,
            BASELINE,
            THRESHOLDS,
            current_stamps=stamps,
        )
        committed = maybe_commit_baseline(
            gt_diff_obj,
            gt_block,
            BASELINE,
            autocommit_enabled=config.write_baseline,
            current_stamps=stamps,
        )
        from dataclasses import replace

        gt_diff_obj = replace(gt_diff_obj, baseline_committed=committed)

    if run_agreement:
        code, payload = run(
            gt_metrics_block=gt_block,
            gt_diff=gt_diff_obj,
        )
    else:
        code, payload = run(
            observations=[],
            pairs=[],
            gating=False,
            gt_metrics_block=gt_block,
            gt_diff=gt_diff_obj,
        )

    if payload.get("corpus_empty"):
        print("[runner] corpus empty - informational mode (no gating).", file=sys.stderr)
    if os.environ.get("EVAL_MOCK_BACKENDS") == "1":
        print(
            "[runner] EVAL_MOCK_BACKENDS=1 — synthetic detectors, gating disabled.",
            file=sys.stderr,
        )
    for w in payload.get("warnings", []):
        print(f"[runner] WARN: {w}", file=sys.stderr)
    for v in payload.get("violations", []):
        print(f"[runner] FAIL: {v}", file=sys.stderr)
    if gt_block is not None and "gt_metrics" in payload:
        print(json.dumps({"gt_metrics": payload["gt_metrics"]}, indent=2))
    else:
        print(json.dumps(payload.get("metrics", {}), indent=2))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
