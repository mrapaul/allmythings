Now I have everything I need. Let me generate the section content for section-08-orchestration.

# Section 08 — Orchestration & Final Wiring

## Overview

This is the **final wiring section** that pulls every prior section together into a working evaluation harness. It implements the synchronous orchestrator (`gt_eval/run.py`), extends the existing `pipeline_service/eval/run_eval.py` with env-gated GT-eval and agreement-eval blocks, manages `eval/thresholds.json`, adds Makefile targets, documents the harness, and provides the integration tests that exercise the entire stack.

## Dependencies (must be complete before starting)

- **section-01-foundation** — package skeleton, dependencies in `pyproject.toml`, conftest fixtures, replay fixture corpus under `tests/replay/fixtures/eval/`.
- **section-02-datasets** — `LvisDataset` and the `EvalDataset` Protocol.
- **section-03-matchers** — `CosineLabelMatcher`, `match_boxes` IoU module.
- **section-04-judges** — `QwenLocalJudge` and `ReferenceModelJudge` Protocol.
- **section-05-metrics** — `coco_evaluate`, `label_f1`, hallucination metrics.
- **section-06-baseline** — `diff_and_check`, `maybe_commit_baseline`, `BaselineDiff`, `MetricFloor`, `MetricDelta`, stamps logic.
- **section-07-pipeline-shim** — `single_image_pipeline_runner` and the `EVAL_SKIP_SAHI` env-gated short-circuit in `sahi_recovery_op`.

## Background and context

The pipeline-service repository (`/Users/mrarindampaul/Develop/allmythings/pipeline-service`) already has an evaluation rig at `pipeline-service/pipeline_service/eval/` that measures **inter-detector agreement only**. This section adds the parallel **ground-truth-based path** by:

1. Building a synchronous orchestrator that performs preflight, warm-up, per-image pipeline runs, mAP/F1/hallucination computation, baseline diffing, and rounded persistence.
2. Editing `run_eval.py` so it now runs both the agreement path and the GT path, env-gated, writing two top-level keys (`metrics` and `gt_metrics`) into `last-metrics.json`.
3. Creating or extending `pipeline-service/eval/thresholds.json` to add new gating + warn keys without disturbing existing ones.
4. Adding `make test-eval` and `make test-eval-smoke` targets to the root `Makefile`.
5. Documenting the harness in `pipeline-service/README.md`.
6. Providing the default-on integration test (mocked pipeline + judge) and the opt-in real-pipeline integration test.

The orchestrator is **synchronous**. The judge's `verify()` is async because the underlying `OllamaClient` is async, but the orchestrator calls it via `asyncio.run(...)` inside the hallucination-metric module — that is the only place async actually matters.

## Files to create / modify

### Create

- `pipeline-service/pipeline_service/eval/gt_eval/run.py` — the synchronous orchestrator.
- `pipeline-service/eval/thresholds.json` — created on first run if absent (the `run_eval.py` ensures this); otherwise extended in place.
- `pipeline-service/tests/integration/test_gt_eval_e2e.py` — default integration test (committed, runs in CI).
- `pipeline-service/tests/integration/test_gt_eval_real_pipeline.py` — opt-in integration test (skipped unless `EVAL_TEST_REAL_PIPELINE=1`).
- `pipeline-service/tests/unit/eval/test_run_orchestration.py` — orchestrator unit tests.
- `pipeline-service/tests/unit/eval/test_run_eval_integration.py` — `run_eval.py` env gate + exit code unit tests.
- `pipeline-service/tests/unit/eval/test_failure_modes.py` — failure-mode coverage.
- `pipeline-service/tests/unit/eval/test_thresholds_extension.py` — thresholds-file behaviour.
- `pipeline-service/tests/unit/eval/test_dependencies.py` — import smoke checks.

### Modify

- `pipeline-service/pipeline_service/eval/run_eval.py` — add the two env-gated blocks (`EVAL_RUN_AGREEMENT`, `EVAL_RUN_GT`) and the new exit-code logic. Existing agreement path stays byte-identical when `EVAL_RUN_AGREEMENT=true` (default).
- `pipeline-service/pipeline_service/eval/__init__.py` — export the new orchestrator entry point alongside the existing names.
- `pipeline-service/eval/thresholds.json` — extend in place (preserve existing keys verbatim).
- `Makefile` (repository root) — append `test-eval` and `test-eval-smoke` targets. Do NOT modify `make test`.
- `pipeline-service/README.md` — add a "Running the eval harness" section: command, env vars, and what the numbers mean.

## Tests FIRST (red → green → refactor)

Write all tests below before any implementation in this section.

### `tests/unit/eval/test_run_orchestration.py`

Cover the orchestrator's contract:

- `run_gt_eval` is a synchronous function — assert `asyncio.iscoroutinefunction(run_gt_eval) is False`.
- The orchestrator iterates the dataset, calls the injected `pipeline_runner` once per image, and aggregates results — verify with a fixture dataset of 3 images and a mock runner.
- **Preflight** — `run_gt_eval` calls a `detection_service_health_check()` (or equivalent helper) once **before** any per-image work; if preflight raises or returns unhealthy, `run_gt_eval` raises a clearly-named exception (e.g. `PreflightFailed`).
- **Warm-up** — after preflight, the orchestrator runs `pipeline_runner` once on a small fixture image **before** the timed loop. Use a counter on the mock runner to verify warm-up + N image calls.
- **Rounding** — given known float metrics (mocked metric module return values), the returned `GtMetricsBlock` has every float rounded to 3 decimals (`map_50_95`, `map_50`, `map_75`, `label_f1`, `box_f1_50`, `hallucination_rate` if not None, every `per_category` value, every `CategoryAP.ap`).
- **Empty dataset** → exits cleanly with `n_images=0`, `n_predictions=0`, `n_ground_truths=0`, all headline metrics either `0.0` or `None`, and no judge calls.
- **`per_class_top10` / `per_class_bottom10`** — extracted from the **class-aware** `per_category` map; sorted by AP descending (top10) / ascending (bottom10); both lists are truncated at 10 entries even when the corpus has more categories; both lists shorten when fewer categories are present.
- **Pipeline failure handling** — when the injected runner returns a flagged `SceneObservation` with errors, the orchestrator counts it under `n_pipeline_failures` and continues; if `n_pipeline_failures / n_images >= 0.05`, the orchestrator raises a clearly-named `PipelineFailureRateExceeded` exception (caught at the `run_eval.py` layer for exit code 1).
- **Judge plumbing** — when a judge is configured, hallucination candidates flow into it; when `judge=None`, `hallucination_rate=None` and `judge_unsure=0`.
- **Synchronous async-judge call** — when the judge's `verify()` is async, the orchestrator uses `asyncio.run` (or equivalent) inside the hallucination metric. Verify by injecting an async mock and asserting it was awaited.

### `tests/unit/eval/test_run_eval_integration.py`

Cover the env-gating and exit-code logic of the modified `run_eval.py`:

- `EVAL_RUN_AGREEMENT=true, EVAL_RUN_GT=true` → both paths run; `last-metrics.json` contains both top-level `metrics` and `gt_metrics` blocks.
- `EVAL_RUN_AGREEMENT=false` → only `gt_metrics` written; existing `metrics` block absent or empty.
- `EVAL_RUN_GT=false` → only existing `metrics` block written; no `gt_metrics` block.
- **Exit codes**:
  - Gating violation in either path → exit 1.
  - Floor violation in `gt_metrics` → exit 1.
  - Regression in `gt_diff` AND no `version_mismatch` → exit 1.
  - `version_mismatch=True` alone → exit 0 (treated as "no baseline available, bootstrap-eligible").
  - All gates pass → exit 0.
  - Configuration / system error (e.g. preflight unhealthy, sha256 mismatch without `EVAL_LVIS_VERSION_BUMP`) → exit 2.
- **Schema** — both top-level keys (`metrics`, `gt_metrics`, plus `gt_diff` when a baseline existed) coexist in `last-metrics.json`.

### `tests/unit/eval/test_failure_modes.py`

Each failure-mode is in `claude-plan.md §7.3`. Pin them with mocks:

- LVIS download failure → exit 2; error message mentions `LVIS_LOCAL_ZIP`.
- LVIS archive sha256 mismatch → exit 2; error message mentions `EVAL_LVIS_VERSION_BUMP`.
- ≥ 5 % pipeline failures across the corpus → exit 1; error surfaces failure count.
- Ollama unreachable → all candidates bucket to `judge_failures`; `hallucination_rate=None`; gating for that single metric is skipped; **other** metrics are still gated.
- Detection-service preflight unhealthy → exit 2.
- `pycocotools` AND `torchmetrics` unavailable at module load → module load fails fast; exit 2 (covered indirectly — a single test that monkeypatches both imports to raise and asserts the orchestrator surfaces the error).
- Baseline file is malformed JSON → treated as missing; warning logged; bootstrap path taken (still respects floors).

### `tests/unit/eval/test_thresholds_extension.py`

- Existing thresholds (read from a fixture pre-PR `thresholds.json` placed under `tests/replay/fixtures/eval/`) are preserved **verbatim** when `run_eval.py` adds new keys (deep equality on the union of pre-existing keys).
- Missing `thresholds.json` → first run creates it with **both** existing-default and new-default values populated.
- Malformed `thresholds.json` JSON → clear error (raises with a named exception or exits with code 2); **no silent fallback** to defaults.

The thresholds.json content this PR ensures is present (already specified in `claude-plan.md §5.2`):

```jsonc
{
  "gating": {
    "agreement_coverage_min": 0.70,
    "dedup_precision_min": 0.88,
    "op_failure_rate_max": 0.05,
    "class_aware_map_50_95_min": 0.20,
    "class_agnostic_map_50_95_min": 0.30,
    "label_f1_min":  0.50,
    "hallucination_rate_max": 0.15
  },
  "warn": {
    "agreement_precision_min": 0.40,
    "self_diagnosis_trigger_rate_max": 0.30,
    "single_source_run_rate_max": 0.05,
    "empty_detection_set_rate_max": 0.02,
    "class_aware_map_50_min": 0.30,
    "box_f1_50_min": 0.45,
    "novel_likely_correct_min": 0
  }
}
```

The first three keys under `gating` and the first four keys under `warn` are pre-existing (cited in `run_eval.py` lines 82–93 of the existing implementation); the rest are new in this PR.

### `tests/unit/eval/test_dependencies.py`

Import smoke checks (cheap; runs in every CI invocation; catches uv-add slipups):

- `import pycocotools.cocoeval` succeeds (or the fallback warning is logged at module load — accept either).
- `import torchmetrics.detection` succeeds.
- `from scipy.optimize import linear_sum_assignment` succeeds.
- `from numpy.random import default_rng` succeeds.
- `import requests` succeeds.
- `import tqdm` succeeds.

### `tests/integration/test_gt_eval_e2e.py` (default — runs in CI, no model deps)

- End-to-end `run_eval()` with the 5-image fixture corpus + a fixture `pipeline_runner` (returns hand-built `SceneObservation` per image, skips Dagster + models entirely) + a mock judge with deterministic verdicts.
- Asserts a complete `last-metrics.json` containing both `metrics` and `gt_metrics`.
- **Golden values** — known fixture inputs produce known golden values for every headline metric within tolerance (`0.005` absolute on floats; exact on integer counts). Pin: `class_aware_map_50_95`, `class_aware_map_50`, `class_agnostic_map_50_95`, `class_agnostic_map_50`, `label_f1`, `box_f1_50`, `hallucination_rate`, `novel_likely_correct`, `judge_unsure`, `n_images`, `n_predictions`, `n_ground_truths`.
- `per_class_top10` / `per_class_bottom10` ordering: top10 sorted by AP descending; bottom10 sorted by AP ascending.
- **Inline JSON-schema spec** for the `gt_metrics` block — catches accidental field renames. Validate the produced JSON against it. Schema defines required keys: `headline.{class_aware_map_50_95, class_aware_map_50, class_agnostic_map_50_95, class_agnostic_map_50, label_f1, box_f1_50, hallucination_rate, novel_likely_correct, judge_unsure}`, `per_class_top10`, `per_class_bottom10`, `n_images`, `n_predictions`, `n_ground_truths`, `runtime_s`.

### `tests/integration/test_gt_eval_real_pipeline.py` (opt-in)

- Decorated `@pytest.mark.skipif(os.getenv("EVAL_TEST_REAL_PIPELINE") is None, reason="opt-in real-pipeline test")`.
- Runs the full Florence → GDino → SAHI → Qwen-VL pipeline on **one** fixture image.
- Asserts `gt_metrics` block is populated (key presence + non-null types only — no value assertions).
- Catches integration drift on developer machines that have the full model stack.

## Implementation details

### `pipeline_service/eval/gt_eval/run.py`

Module surface (signatures only — bodies in implementation):

```python
@dataclass(frozen=True)
class GtEvalConfig:
    sample_size: int
    label_match_threshold: float
    iou_threshold: float
    judge: ReferenceModelJudge | None
    judge_max_calls: int
    write_baseline: bool
    apply_eval_skip_sahi: bool
    apply_eval_top_k: int | None

@dataclass(frozen=True)
class HeadlineMetrics:
    class_aware_map_50_95: float
    class_aware_map_50: float
    class_agnostic_map_50_95: float
    class_agnostic_map_50: float
    label_f1: float
    box_f1_50: float
    hallucination_rate: float | None
    novel_likely_correct: int
    judge_unsure: int

@dataclass(frozen=True)
class CategoryAP:
    category: str
    ap: float

@dataclass(frozen=True)
class GtMetricsBlock:
    headline: HeadlineMetrics
    per_class_top10: list[CategoryAP]
    per_class_bottom10: list[CategoryAP]
    n_images: int
    n_predictions: int
    n_ground_truths: int
    runtime_s: float

class PreflightFailed(RuntimeError): ...
class PipelineFailureRateExceeded(RuntimeError): ...

def run_gt_eval(
    config: GtEvalConfig,
    dataset: EvalDataset,
    pipeline_runner: Callable[[Path], SceneObservation],
    *,
    detection_health_check: Callable[[], None],
    label_matcher: LabelMatcher,
) -> GtMetricsBlock: ...
```

Algorithm (per `claude-plan.md §3.3`):

1. **Preflight** — call `detection_health_check()` (default impl hits `detection-service /health`). If it raises or returns unhealthy, raise `PreflightFailed`.
2. **Warm-up** — pick the first fixture image (or the first image yielded by the dataset) and call `pipeline_runner(image)` once. Discard the result. This loads Florence + Grounding-DINO on MPS before the timed loop starts.
3. **Timed loop** — start a wall clock; iterate the dataset; for each `(image_path, gt_boxes)`:
   - Call `pipeline_runner(image_path)` → `SceneObservation`.
   - If the observation is flagged with errors, increment `n_pipeline_failures` and continue.
   - Clamp predicted boxes to image bounds and filter zero-area (delegated to the IoU matcher in section-03).
   - Accumulate predictions and GT for the corpus-level mAP passes.
4. **Failure-rate gate** — if `n_pipeline_failures / max(n_images, 1) >= 0.05`, raise `PipelineFailureRateExceeded`.
5. **Metric computation** — call `coco_evaluate(observations, ground_truths, label_matcher=...)` (returns dual-pass `CocoEvalResult`); call `label_f1(...)`; call the hallucination module (which internally invokes the judge via `asyncio.run`).
6. **Per-class top10/bottom10** — extract from the **class-aware** `PassResult.per_category` (class-agnostic has only one synthetic class so it cannot produce a per-class breakdown). Sort and truncate at 10.
7. **Round** every float in the block to 3 decimals before returning.
8. **Stop** the wall clock; populate `runtime_s`.

Notes:

- The orchestrator does **not** itself read or write `last-metrics.json` or `baseline.json`. That is the responsibility of `run_eval.py`. The orchestrator returns a `GtMetricsBlock`; the caller serialises it.
- `pipeline_runner` is injected so unit / integration tests can replace it with the fixture-replay function (no Dagster, no models loaded).
- `detection_health_check` is injected for the same reason.
- `label_matcher` is injected so tests can drop in a deterministic `lambda a, b: a == b` style matcher.

### `pipeline_service/eval/run_eval.py` modifications

Read the existing file before editing — preserve all current behaviour unchanged when env vars take their defaults.

Add (in the existing `main()` or equivalent entry):

```python
metrics_dict: dict = {}

if env_bool("EVAL_RUN_AGREEMENT", default=True):
    # existing agreement-metrics path runs here, populates metrics_dict["metrics"]
    ...

if env_bool("EVAL_RUN_GT", default=True):
    config = build_gt_eval_config_from_env()
    dataset = LvisDataset(...)
    runner = single_image_pipeline_runner  # from gt_eval.runner
    label_matcher = CosineLabelMatcher(threshold=config.label_match_threshold)
    judge = QwenLocalJudge(...) if config.judge is None else config.judge
    block = run_gt_eval(
        config,
        dataset,
        runner,
        detection_health_check=detection_service_health_check,
        label_matcher=label_matcher,
    )
    metrics_dict["gt_metrics"] = block.to_dict()  # rounded already

    diff = diff_and_check(
        current=block,
        baseline_path=BASELINE_PATH,
        thresholds_path=THRESHOLDS_PATH,
    )
    metrics_dict["gt_diff"] = diff.to_dict()

    committed = maybe_commit_baseline(
        diff, block, BASELINE_PATH, env_bool("EVAL_BASELINE_AUTOCOMMIT", default=False)
    )
    metrics_dict["gt_diff"]["baseline_committed"] = committed
```

**Exit-code policy** (extend the existing logic):

- `exit 0` if every gate passes.
- `exit 1` on any of: existing-path gating violation, existing `corpus_empty`, GT floor violation, GT regression with `version_mismatch=False`, ≥ 5 % pipeline failures.
- `exit 2` on configuration / system errors: detection-service preflight unhealthy, LVIS download fails, sha256 mismatch without `EVAL_LVIS_VERSION_BUMP=1`, both metric backends unavailable.

`version_mismatch=True` alone is **not** a failure — it's treated as "no baseline available — bootstrap-eligible". Exit 0 in that case (assuming all other gates pass).

**Thresholds-file management** (`claude-plan.md §5.2`):

- On entry, attempt to read `pipeline-service/eval/thresholds.json`.
- If absent, create it populated with both existing and new default keys (see exact JSON above under `test_thresholds_extension.py`).
- If present, deep-merge: preserve every existing key and value verbatim; add only missing new keys.
- If malformed JSON, raise a clearly-named exception and exit 2. **No silent fallback to defaults.**

### `pipeline-service/eval/thresholds.json`

This file is created or extended by `run_eval.py` at runtime per the policy above. The PR may also commit a starting version under version control if the file does not yet exist — see the exact content in `test_thresholds_extension.py` above.

### Repository root `Makefile`

Append (do not modify any other targets, especially not `make test`):

```make
test-eval: ## Run GT-based evaluation harness on LVIS-OV indoor subset
	@cd pipeline-service && uv run python -m pipeline_service.eval.run_eval

test-eval-smoke: ## Faster smoke run, 100 images
	@cd pipeline-service && EVAL_SAMPLE_SIZE=100 uv run python -m pipeline_service.eval.run_eval
```

### `pipeline-service/README.md`

Add a "Running the eval harness" section. Cover:

- Commands: `make test-eval`, `make test-eval-smoke`.
- Env-var table (subset of `claude-plan.md §5.1` — at minimum `EVAL_RUN_GT`, `EVAL_RUN_AGREEMENT`, `EVAL_SAMPLE_SIZE`, `EVAL_SEED`, `LVIS_LOCAL_ZIP`, `EVAL_LABEL_MATCH_THETA`, `EVAL_IOU_THRESHOLD`, `HALLUCINATION_JUDGE_MAX_CALLS`, `EVAL_BASELINE_AUTOCOMMIT`, `EVAL_LVIS_VERSION_BUMP`, `EVAL_SKIP_SAHI`).
- What the headline numbers mean: `class_aware_map_50_95`, `class_agnostic_map_50_95`, `label_f1`, `box_f1_50`, `hallucination_rate` (and the conservative null-out semantics — `null` means "judge couldn't decide on enough candidates; this metric is skipped this run").
- LVIS license attribution: `LICENSE-LVIS.md` is written into `eval/datasets/lvis-ov/` on first download (CC-BY 4.0).
- The `EVAL_BASELINE_AUTOCOMMIT=false` v1 default and the bake-in policy of 5+ stable runs before flipping it to `true`.

User's global rule states: **"Never create README, documentation, or explanation files unless explicitly requested."** This README modification is explicitly requested by the section manifest ("documents the harness in `pipeline-service/README.md`") so it proceeds; the new content is appended, not a new file.

## Configuration reference (env vars consumed by this section)

All defaults match `claude-plan.md §5.1`:

| Var | Default | Effect |
| --- | --- | --- |
| `EVAL_RUN_GT` | `true` | Enable the new GT-eval path. |
| `EVAL_RUN_AGREEMENT` | `true` | Enable the existing agreement-eval path. |
| `EVAL_SAMPLE_SIZE` | `500` | LVIS images per run. |
| `EVAL_SEED` | `0` | Sampling seed (numpy.random.default_rng). |
| `EVAL_LABEL_MATCH_THETA` | `0.6` | Cosine threshold for label match. |
| `EVAL_IOU_THRESHOLD` | `0.5` | IoU threshold for F1 + hallucination match (NOT mAP — that uses the full COCO sweep). |
| `HALLUCINATION_JUDGE_MAX_CALLS` | `max(50, int(0.1 * total_predictions))` | Cap on Qwen-VL judge calls per run. |
| `EVAL_BASELINE_AUTOCOMMIT` | `false` | v1 default OFF. Flip to true after 5+ stable runs. |
| `EVAL_LVIS_VERSION_BUMP` | unset | Required to bootstrap a baseline under a new LVIS dataset sha256. |
| `EVAL_SKIP_SAHI` | unset | When truthy, the SAHI op is a no-op. |
| `CLASSIFICATION_TOP_K` | `8` (existing) → `3` (eval default) | GT-eval orchestrator overrides via env before invoking the pipeline. |
| `EVAL_TEST_REAL_PIPELINE` | unset | When set, the opt-in real-pipeline integration test runs (else skipped). |

## Schema reference (what `last-metrics.json` looks like after this section lands)

```jsonc
{
  /* existing top-level keys: metrics, thresholds, violations, warnings,
     corpus_empty, gating, ok */
  "gt_metrics": {
    "headline": {
      "class_aware_map_50_95": 0.247, "class_aware_map_50": 0.355,
      "class_agnostic_map_50_95": 0.318, "class_agnostic_map_50": 0.461,
      "label_f1": 0.612, "box_f1_50": 0.487,
      "hallucination_rate": 0.082,
      "novel_likely_correct": 14, "judge_unsure": 8
    },
    "per_class_top10":    [{"category": "couch", "ap": 0.71}, ...],
    "per_class_bottom10": [{"category": "spice_rack", "ap": 0.04}, ...],
    "n_images": 500, "n_predictions": 4321, "n_ground_truths": 5012,
    "runtime_s": 1842.3
  },
  "gt_diff": {
    "regressions":       [{"metric": "class_aware_map_50_95",
                           "current": 0.18, "baseline": 0.27, "delta": -0.09}],
    "improvements":      [],
    "floor_violations":  [{"metric": "class_aware_map_50_95",
                           "current": 0.18, "floor": 0.20}],
    "version_mismatch": false,
    "baseline_age_days": 12,
    "baseline_committed": false
  }
}
```

All `gt_metrics` floats are rounded to 3 decimal places before persistence (per `claude-plan.md §5.4` — defends against MPS non-determinism flipping borderline gates).

## Rounding policy reminder

Every float that lands in `last-metrics.json` or `baseline.json` is rounded to 3 decimal places **before** persistence and **before** comparison. Cardinal counts (`novel_likely_correct`, `judge_unsure`, `n_images`, `n_predictions`, `n_ground_truths`) are never rounded. `runtime_s` is rounded to 1 decimal.

## Definition of done

- All unit tests above pass: `cd pipeline-service && uv run pytest tests/unit/eval/test_run_orchestration.py tests/unit/eval/test_run_eval_integration.py tests/unit/eval/test_failure_modes.py tests/unit/eval/test_thresholds_extension.py tests/unit/eval/test_dependencies.py -q`.
- The default integration test passes: `uv run pytest tests/integration/test_gt_eval_e2e.py -q`.
- The opt-in integration test runs (and passes shape assertions) when `EVAL_TEST_REAL_PIPELINE=1` and the model stack is installed.
- The combined section-suite passes: `uv run --project pipeline-service pytest tests/unit/eval tests/integration -q`.
- `make test-eval-smoke` from the repository root completes without raising (subject to LVIS download / model availability — gated by env vars listed above).
- `make test` is unchanged and still passes (the existing pipeline-service suite is intentionally out of scope for the per-section TDD loop; a final manual `cd pipeline-service && uv run pytest` validates the full ~235-test suite after section 8 lands).
- `last-metrics.json` produced by a smoke run contains both top-level `metrics` and `gt_metrics` keys, plus `gt_diff` when a baseline existed.
- `pipeline-service/README.md` documents the harness.
- `EVAL_BASELINE_AUTOCOMMIT=false` is the v1 default — verified by a unit test in `test_baseline.py` (section-06) and respected here in `run_eval.py`. **Do not flip it in v1.**