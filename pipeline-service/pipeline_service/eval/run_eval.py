"""Pipeline evaluation rig CLI entrypoint.

Run via:
  cd pipeline-service && uv run python -m pipeline_service.eval.run_eval

Behaviour:
  - Walks the corpus tree (corpora/).
  - For each scene, runs the Dagster pipeline against the 3 frames
    (currently mocked - the section's done-criteria includes capturing
    the real corpus; until then the runner emits a stub-mode report).
  - Computes per-corpus aggregate metrics via metrics module.
  - Writes last-metrics.json and exits non-zero if any gate in
    thresholds.json is violated AND the corpus is non-empty.

Until corpora/ contains scenes, the runner reports without gating
(informational mode) and exits 0.
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from pipeline_service.eval import metrics as M
from pipeline_service.types import SceneObservation


CORPORA = Path(__file__).resolve().parent / "corpora"
THRESHOLDS = Path(__file__).resolve().parent / "thresholds.json"
LAST_METRICS = Path(__file__).resolve().parent / "last-metrics.json"


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


def _check_gates(metrics_d: dict, thresholds: dict) -> tuple[bool, list[str]]:
    """Return (ok, list of human-readable violations)."""
    violations: list[str] = []

    def need_min(metric_key: str, threshold_key: str) -> None:
        if threshold_key in thresholds and metrics_d[metric_key] < thresholds[threshold_key]:
            violations.append(
                f"{metric_key}={metrics_d[metric_key]:.3f} < {thresholds[threshold_key]:.3f}"
            )

    def need_max(metric_key: str, threshold_key: str) -> None:
        if threshold_key in thresholds and metrics_d[metric_key] > thresholds[threshold_key]:
            violations.append(
                f"{metric_key}={metrics_d[metric_key]:.3f} > {thresholds[threshold_key]:.3f}"
            )

    need_min("agreement_coverage_avg", "agreement_coverage_min")
    need_min("agreement_precision_avg", "dedup_precision_min")
    need_max("op_failure_rate", "op_failure_rate_max")
    need_max("single_source_run_rate", "single_source_run_rate_max")
    need_max("empty_detection_set_rate", "empty_detection_set_rate_max")
    return (not violations, violations)


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

    obs = observations if observations is not None else []
    pair_list = pairs if pairs is not None else []
    corpus_empty = _corpus_is_empty(corpora_dir) and not obs and not pair_list

    if gating is None:
        gating = not corpus_empty

    report_d = Report(observations=list(obs), pairs=list(pair_list)).to_metrics_dict()
    thresholds_data: dict = {}
    if thresholds_path.exists():
        thresholds_data = json.loads(thresholds_path.read_text())

    ok, violations = (True, [])
    if gating:
        ok, violations = _check_gates(report_d, thresholds_data)

    payload = {
        "metrics": report_d,
        "thresholds": thresholds_data,
        "violations": violations,
        "corpus_empty": corpus_empty,
        "gating": gating,
        "ok": ok,
    }
    output_path.write_text(json.dumps(payload, indent=2, sort_keys=True))
    return (0 if ok else 1, payload)


def main(argv: Iterable[str] | None = None) -> int:
    code, payload = run()
    if payload["corpus_empty"]:
        print("[runner] corpus empty - informational mode (no gating).", file=sys.stderr)
    if payload["violations"]:
        for v in payload["violations"]:
            print(f"[runner] FAIL: {v}", file=sys.stderr)
    print(json.dumps(payload["metrics"], indent=2))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
