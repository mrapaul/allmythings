<!-- PROJECT_CONFIG
runtime: python-uv
test_command: uv run --project pipeline-service pytest tests/unit/eval tests/integration -q
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-foundation
section-02-datasets
section-03-matchers
section-04-judges
section-05-metrics
section-06-baseline
section-07-pipeline-shim
section-08-orchestration
END_MANIFEST -->

# Implementation Sections Index — Automated Detection Evaluation

This index splits `claude-plan.md` (and its TDD companion `claude-plan-tdd.md`)
into eight implementation sections with explicit dependencies and a
parallel execution plan.

The `test_command` runs only the new evaluation tests (under
`tests/unit/eval/` and `tests/integration/`) plus the integration tests.
The wider pipeline-service suite (~235 tests) is intentionally out of
scope for the per-section TDD loop — running it on every section would
be slow and most existing tests are unaffected by this PR. After section
8 lands, a final manual `cd pipeline-service && uv run pytest` validates
the full suite.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable with |
| --- | --- | --- | --- |
| section-01-foundation | — | all | — |
| section-02-datasets | 01 | 05, 08 | 03, 04, 07 |
| section-03-matchers | 01 | 05, 08 | 02, 04, 07 |
| section-04-judges | 01 | 05, 08 | 02, 03, 07 |
| section-05-metrics | 03, 04 | 06, 08 | (none in same batch) |
| section-06-baseline | 05 | 08 | (none in same batch) |
| section-07-pipeline-shim | 01 | 08 | 02, 03, 04 |
| section-08-orchestration | 02, 05, 06, 07 | — | (final batch) |

## Execution Order (5 batches)

1. **Batch 1**: `section-01-foundation` (no parallelism — deps go in
   here, every other section assumes them).
2. **Batch 2** (4-way parallel): `section-02-datasets`, `section-03-matchers`,
   `section-04-judges`, `section-07-pipeline-shim`.
3. **Batch 3**: `section-05-metrics` (consumes matchers + judges).
4. **Batch 4**: `section-06-baseline` (consumes the metrics schema).
5. **Batch 5**: `section-08-orchestration` (final wiring; the integration
   tests in here exercise the whole stack).

## Section Summaries

### section-01-foundation

Adds the new dependencies (`pycocotools`, `torchmetrics`, `scipy`,
`requests`, `tqdm`, optional `pycocotools-binary` fallback) to
`pipeline-service/pyproject.toml`. Creates the empty package skeleton
under `pipeline-service/pipeline_service/eval/gt_eval/` with empty
`__init__.py` files. Adds the gitignore line for
`pipeline-service/eval/datasets/`. Lays down the test fixture corpus
under `pipeline-service/tests/replay/fixtures/eval/` (5 small JPEGs,
`gt.json`, `synthetic_image_ids.json`, and a small synthetic LVIS-shaped
zip archive used by the LVIS loader unit tests). Adds shared conftest
fixtures (mock `OllamaClient`, mock `LabelEncoder`, etc.) under
`pipeline-service/tests/unit/eval/conftest.py`.

Verifies dependency installation succeeds before later sections rely on
it. No other code changes.

### section-02-datasets

Implements the `EvalDataset` Protocol and the LVIS-OV concrete loader.
Writes `gt_eval/datasets/protocol.py`, `gt_eval/datasets/lvis.py`, and
the two data files `gt_eval/datasets/lvis_supercats.json` and
`gt_eval/datasets/lvis_aliases.json`. Includes the LVIS download path
with sha256 verification, `LVIS_LOCAL_ZIP` escape hatch,
`numpy.random.default_rng(seed).choice` deterministic sampling, the
JSON-parse pickle cache, the `LICENSE-LVIS.md` write on first download,
and the `version_sha256` property used by §06 for baseline stamping.

Tests: `tests/unit/eval/test_protocol.py` (small),
`tests/unit/eval/test_lvis_loader.py` (cache hit, supercategory filter,
deterministic sampling, sha256 verification, license file write,
`LVIS_LOCAL_ZIP` short-circuit).

### section-03-matchers

Implements the `LabelMatcher` Protocol, the `CosineLabelMatcher` default
impl, and the IoU Hungarian-assignment `match_boxes` function. Writes
`gt_eval/matchers/protocol.py`, `gt_eval/matchers/label_cosine.py`, and
`gt_eval/matchers/iou.py`.

The cosine matcher reuses the existing
`pipeline_service.models.label_encoder.LabelEncoder` (the
sentence-transformers wrapper) — does not modify it. The IoU matcher
includes the box-clamping and zero-area-filtering hygiene plus the
xywh→xyxy conversion with exclusive max edges. The `lvis_aliases.json`
override path lives here.

Tests: `tests/unit/eval/test_label_matcher.py` (60 calibration sentinels
across 5 buckets, identical-string short-circuit, encoder-failure
degraded path, alias-map override, threshold parameter override),
`tests/unit/eval/test_iou_matcher.py` (synthetic IoU pairs, touching vs
identical, Hungarian optimality on ambiguous case, xywh→xyxy
conversion, image-bound clamping, zero-area filter).

### section-04-judges

Implements the `ReferenceModelJudge` Protocol and the `QwenLocalJudge`
concrete impl. Writes `gt_eval/judges/protocol.py` and
`gt_eval/judges/qwen_local.py`. The Qwen-local judge wraps the existing
`pipeline_service.models.ollama_client.OllamaClient` (does not modify
it) and uses the runtime-built JSON-shape prompt with 1.5× RoI crop
expansion. `keep_alive="60s"` plumbing for in-burst calls is included.

Tests: `tests/unit/eval/test_judge_protocol.py` (small),
`tests/unit/eval/test_qwen_local_judge.py` (prompt body, RoI
expansion, JSON-mode happy paths, malformed-verdict fallback to
unsure, JSON-parse failure fallback to unsure, keep_alive plumbing,
timeout propagation).

### section-05-metrics

Implements the COCO mAP wrapper (dual class-aware + class-agnostic
passes), label F1, and hallucination metrics. Writes
`gt_eval/metrics/coco.py`, `gt_eval/metrics/labels.py`, and
`gt_eval/metrics/hallucination.py`.

Key correctness contracts here: unmatched-label detections are
EXCLUDED from class-aware mAP and INCLUDED in class-agnostic mAP with
synthetic id 1; confidence sorting reads
`PipelineDetection.confidence` and falls back to `agreementScore` if
0; the conservative null-out for `hallucination_rate` when
`(judge_unsure + judge_failures) / candidates > 0.5`; the
`HALLUCINATION_JUDGE_MAX_CALLS = max(50, int(0.1 * total_predictions))`
budget cap; `rate = verified_hallucinations / total_predictions` (NOT
`/ candidates`).

Tests: `tests/unit/eval/test_coco_metrics.py` (dual-pass split, both
backends agree within tolerance, fallback path, confidence fallback,
empty inputs), `tests/unit/eval/test_label_metrics.py` (confusion-
matrix corners, label-only ignores IoU),
`tests/unit/eval/test_hallucination.py` (rate denominator, conservative
null-out, budget cap, novel-likely-correct accounting).

### section-06-baseline

Implements baseline read/write/diff. Writes `gt_eval/baseline.py`. Holds
the `MetricDelta`, `MetricFloor`, `BaselineDiff` dataclasses and the
`diff_and_check` + `maybe_commit_baseline` functions. Includes the
absolute-floor enforcement, the bootstrap-respects-floors policy, the
`stamps` sub-block (LVIS sha256, label-encoder model id, Python
version, ISO timestamp), the version-mismatch detection, and the
3-decimal rounding before persistence.

Tests: `tests/unit/eval/test_baseline.py` (round-trip I/O, diff
correctness, floor enforcement, first-run bootstrap respects floors,
version-mismatch detection, rounding, malformed-JSON handling,
autocommit-disabled v1 default).

### section-07-pipeline-shim

This section makes the small env-gated edit to existing pipeline code
AND introduces the single-image runner shim — both touch the
pipeline's invocation surface so they're packaged together.

Edits `pipeline_service/dagster_defs.py` (or `sahi_recovery_op`) to
add the `EVAL_SKIP_SAHI` env-gated short-circuit (no-op when the env
var is absent — preserves the default behaviour exactly). Writes
`gt_eval/runner.py` containing `single_image_pipeline_runner` which
builds a synthetic one-frame `CorpusItem`, calls
`pipeline_job.execute_in_process` with the appropriate run config, and
plumbs `apply_eval_skip_sahi` and `apply_eval_top_k` into the env.

Tests: `tests/unit/eval/test_skip_sahi.py` (env-var truthy → no-op,
absent → default behaviour preserved, falsy strings handled),
`tests/unit/eval/test_runner.py` (synthetic CorpusItem shape, run
config shape, env-var setting/unsetting, returns the SceneObservation
from assemble_result, error in any op surfaces as flagged not raised).

### section-08-orchestration

The final wiring section. Implements `gt_eval/run.py` (synchronous
orchestrator with preflight + warm-up + per-image loop +
metric aggregation + rounding); extends `pipeline_service/eval/run_eval.py`
with the `EVAL_RUN_GT` / `EVAL_RUN_AGREEMENT` env-gated blocks and the
new exit-code logic; creates or updates
`pipeline-service/eval/thresholds.json` with both existing and new
keys; adds the `test-eval` and `test-eval-smoke` Makefile targets;
documents the harness in `pipeline-service/README.md`.

Includes the integration tests:
- `tests/integration/test_gt_eval_e2e.py` (default, runs in CI; mocks
  pipeline + judge; verifies golden values + schema).
- `tests/integration/test_gt_eval_real_pipeline.py` (opt-in, gated on
  `EVAL_TEST_REAL_PIPELINE=1`).

Tests: `tests/unit/eval/test_run_orchestration.py` (synchronous,
preflight, warm-up, rounding, empty-dataset),
`tests/unit/eval/test_run_eval_integration.py` (env gates, exit codes,
schema), `tests/unit/eval/test_failure_modes.py` (download fails,
sha256 mismatch, ≥5% pipeline failures, Ollama unreachable, preflight
unhealthy), `tests/unit/eval/test_thresholds_extension.py` (existing
keys preserved, file-creation, malformed-JSON), `tests/unit/eval/test_dependencies.py`
(import smoke checks).

## Notes for the implementer

- The plan is in `../claude-plan.md`; the TDD companion is in
  `../claude-plan-tdd.md`. Each section file under this directory
  references the relevant subsections of both.
- `claude-integration-notes.md` documents which Opus-review items are
  integrated and why, in case context is needed for a contract decision.
- Follow the existing pipeline-service conventions exactly — no new test
  patterns, no new mocking libraries. Replay fixtures go in
  `tests/replay/fixtures/eval/`.
- All metric values that land in `last-metrics.json` and `baseline.json`
  must be rounded to 3 decimal places before persistence (defends
  against MPS non-determinism flipping borderline gates).
- The default value of `EVAL_BASELINE_AUTOCOMMIT` is `false` for v1.
  This is deliberate — a bake-in policy of 5+ stable runs precedes the
  flip to `true`. Do not flip it in v1.
- The default value of `EVAL_RUN_GT` is `true`; `EVAL_RUN_AGREEMENT` is
  also `true`. Both paths run by default.
