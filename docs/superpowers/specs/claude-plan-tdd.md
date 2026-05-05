# TDD Plan — Automated Detection Evaluation

Companion to `claude-plan.md`. For each implementation section, this
document specifies the tests to write **before** the implementation —
red-green-refactor discipline applies.

Tests follow the existing `pipeline-service` conventions:
- pytest with `asyncio_mode=auto`.
- Fixtures live in `tests/conftest.py` and module-local `conftest.py`.
- Replay fixtures under `tests/replay/fixtures/`.
- New module tests live under `tests/unit/eval/`.
- Integration tests live under `tests/integration/`.
- Mocking uses `pytest-mock` and `unittest.mock` (existing patterns).

Test stubs are **prose descriptions or minimal signatures**, not full
implementations. The implementer writes the actual test code.

---

## §3 Architecture

(Architectural section — no direct tests. Verified through downstream
module tests and integration tests.)

## §4 Module-by-module — tests to write first

### §4.1 `gt_eval.datasets.protocol`

`tests/unit/eval/test_protocol.py`:

- Test: `GtBox` is a `NamedTuple` with the documented fields
  (`x1, y1, x2, y2, category_id, category_name`).
- Test: an instantiable mock class implementing `EvalDataset` Protocol
  type-checks (use `runtime_checkable`).
- Test: a class missing `name` or `category_names` properties is
  rejected by `isinstance(x, EvalDataset)`.

### §4.2 `gt_eval.datasets.lvis`

`tests/unit/eval/test_lvis_loader.py`:

- Test: with `LVIS_LOCAL_ZIP` pointing to a fixture archive
  (`tests/replay/fixtures/eval/synthetic_lvis_archive.zip` containing
  50 synthetic images and a tiny LVIS-shaped annotations JSON), iter
  yields exactly the seeded sample.
- Test: deterministic sampling — `seed=0` picks a known set of image
  ids; `seed=1` picks a different set; `seed=0` again picks the same
  set as the first run.
- Test: `numpy.random.default_rng(seed).choice` is the actual sampler
  (assert by mocking `numpy.random.default_rng`).
- Test: supercategory filter — images whose only GT boxes are
  excluded categories are dropped.
- Test: cache hit — second `__iter__` call does not re-download
  (assert HTTP mock was called only on the first iteration).
- Test: pickle cache — second invocation of the GT JSON load skips the
  expensive `json.load` (assert by file mtime or by mocking `json.load`).
- Test: sha256 verification — when `expected_archive_sha256` is set
  and the archive doesn't match, `LvisDataset()` raises a clearly-named
  exception before parsing.
- Test: `LICENSE-LVIS.md` is written to `cache_root` on first download.
- Test: `version_sha256` property returns the archive sha256.
- Test: `EVAL_LOCAL_ZIP` short-circuits network entirely — no HTTP
  calls observed under mock.

### §4.3 `gt_eval.matchers.protocol` and `label_cosine`

`tests/unit/eval/test_label_matcher.py`:

- Test: `LabelMatcher` Protocol — runtime-checkable; a callable with
  the right signature passes `isinstance`.
- Test: `CosineLabelMatcher` short-circuits identical normalised
  strings (case-insensitive trim).
- Test: 60 calibration sentinels across 5 buckets at threshold 0.6:
  - 15 obvious positives (cosine ≥ 0.85): `("couch", "sofa")`,
    `("tv", "television")`, `("refrigerator", "fridge")`, etc.
  - 15 borderline positives (0.55–0.7): `("marble side table", "side_table")`,
    `("sectional", "couch")`, etc.
  - 15 obvious negatives (cosine < 0.35): `("couch", "refrigerator")`.
  - 5 hard negatives near threshold (0.55–0.65): `("table", "chair")`,
    `("lamp", "lampshade")`.
  - 10 cross-language synonyms (e.g. EN↔NL household terms relevant to
    the user's mixed-language detection workload).
- Test: encoder failure (mock `LabelEncoder.encode` to raise) returns
  True (degraded — never block).
- Test: `lvis_aliases.json` override — when an explicit alias exists
  for `(predicted, gt_category)`, the encoder is NOT called and the
  match returns True.
- Test: threshold parameter override — passing `threshold=0.95` flips
  borderline-positive pairs to False.

### §4.4 `gt_eval.matchers.iou`

`tests/unit/eval/test_iou_matcher.py`:

- Test: synthetic xyxy pairs at IoU 0.0, 0.4, 0.5, 0.6, 1.0 — verify
  the IoU function returns the expected values.
- Test: touching boxes (`(0,0,10,10)` vs `(10,0,10,10)`) → IoU = 0.0
  (max-edge-exclusive convention).
- Test: identical boxes → IoU = 1.0.
- Test: a pred fully inside a gt → IoU = pred_area / gt_area.
- Test: 3×3 ambiguous case where greedy gives a sub-optimal pairing
  but Hungarian gives the optimal one (e.g. preds A,B,C with iou(A,1)=0.8,
  iou(A,2)=0.7, iou(B,1)=0.79, iou(B,2)=0.0).
- Test: xywh→xyxy conversion — input `BBox(x=10, y=20, width=30, height=40)`
  produces xyxy `(10, 20, 40, 60)`.
- Test: image-bound clamping — a pred at `BBox(x=-5, y=10, width=20,
  height=20)` with `image_width=100, image_height=100` is clamped to
  xyxy `(0, 10, 15, 30)` before IoU.
- Test: zero-area filter — predictions with width=0 or height=0 are
  excluded from matching (their indices appear in
  `unmatched_pred_idxs` but only if they survive the filter; spec
  says they are dropped entirely).

### §4.5 `gt_eval.metrics.coco`

`tests/unit/eval/test_coco_metrics.py`:

- Test: 3 hand-built images with known GT and predictions →
  pycocotools backend produces a known mAP@0.5:0.95.
- Test: same inputs → torchmetrics fallback backend produces the same
  mAP within tolerance (≤ 0.005).
- Test: backend selection — when `pycocotools` is monkeypatched to
  raise ImportError at module load, the torchmetrics path is selected
  and a warning is logged.
- Test: **dual-pass split** — given 5 predictions with 2 unmatched
  labels:
  - The class-aware pass receives only the 3 matched predictions with
    correct category ids.
  - The class-agnostic pass receives all 5 predictions with synthetic
    `category_id=1`, and all GT collapsed to `category_id=1`.
  - The two passes produce different per-class breakdowns;
    class-agnostic has exactly 1 class.
- Test: confidence sorting — when `PipelineDetection.confidence=0` for
  some detections, the function falls back to `agreementScore`.
  Verify by patching pycocotools to record the order it received the
  detections.
- Test: empty predictions → both passes report `map_50_95=0.0`,
  `n_predictions=0`.
- Test: empty ground truths → both passes report `map_50_95=NaN`
  (pycocotools convention) — function masks this to `0.0` to avoid
  baseline JSON corruption.

### §4.6 `gt_eval.metrics.labels`

`tests/unit/eval/test_label_metrics.py`:

- Test: all-correct case — every prediction has IoU ≥ 0.5 AND a label
  match → `label_f1 = 1.0`, `box_aware_f1_50 = 1.0`.
- Test: all-wrong case — no IoU matches OR all labels mismatch →
  `label_f1 = 0.0`, `box_aware_f1_50 = 0.0`.
- Test: partial match — 4 predictions, 2 IoU+label correct, 1 IoU
  correct but wrong label, 1 wrong IoU → expected precision/recall.
- Test: label-only metric ignores IoU — a prediction with bbox
  outside the image but correct label still contributes to `label_f1`
  if there's a GT with that label, regardless of overlap.

### §4.7 `gt_eval.metrics.hallucination`

`tests/unit/eval/test_hallucination.py`:

- Test: 10 candidates with judge verdicts `{6×no, 2×yes, 1×unsure,
  1×failure}`, `total_predictions=20` → `rate = 6/20 = 0.30`,
  `verified_hallucinations=6`, `novel_likely_correct=2`,
  `judge_unsure=1`, `judge_failures=1`.
- Test: denominator is `total_predictions`, not `candidates` —
  building on the previous test, swap to `total_predictions=100` →
  `rate = 6/100 = 0.06`.
- Test: conservative null-out — 10 candidates, 6 unsure + 1 failure
  (= 7/10 = 70% > 50% threshold) → `rate = None`.
- Test: budget cap — 200 candidates, `judge_max_calls = 50` → only 50
  judge calls happen, the remaining 150 are bucketed `judge_unsure`,
  the rate computation includes the conservative null-out check.
- Test: zero candidates → `rate = 0.0`, all counts zero, no judge
  calls.

### §4.8 `gt_eval.judges.protocol`

`tests/unit/eval/test_judge_protocol.py`:

- Test: `ReferenceModelJudge` Protocol is `runtime_checkable`.
- Test: `JudgeVerdict` Literal type accepts only `"yes"`, `"no"`,
  `"unsure"`.

### §4.9 `gt_eval.judges.qwen_local`

`tests/unit/eval/test_qwen_local_judge.py`:

- Test: prompt body — given `label="coffee table"`, the constructed
  prompt contains the literal substring `'{"verdict":'` and the label
  string. (Asserts the JSON-shape demand.)
- Test: 1.5× RoI expansion — given a crop, the bytes sent to Ollama
  represent an image expanded by 1.5× (verify by mock-decoding the
  uploaded bytes).
- Test: happy paths — Ollama returns `{"verdict": "yes"}` →
  `verify()` returns `"yes"`. Same for `"no"` and `"unsure"`.
- Test: JSON parse failure → `verify()` returns `"unsure"` (does NOT
  raise).
- Test: malformed verdict (`{"verdict": "maybe"}`) → returns
  `"unsure"`.
- Test: `keep_alive` plumbing — `ollama.generate` is called with
  `keep_alive="60s"` for non-final calls. (The "final call" semantics
  belong to the orchestrator, not the judge.)
- Test: `OllamaTimeout` propagates as a judge `failure` (raised
  exception OR return-value `"unsure"` per spec — pin which one in
  the contract).

### §4.10 `gt_eval.baseline`

`tests/unit/eval/test_baseline.py`:

- Test: round-trip — write a `BaselineDiff`, read it back, assert
  field-equal.
- Test: `diff_and_check` produces correct `regressions` /
  `improvements` deltas given baseline + current as known fixtures.
- Test: floor enforcement — current run below floor on any metric →
  `floor_violations` non-empty; `maybe_commit_baseline` returns False
  even when `autocommit_enabled=True`.
- Test: bootstrap respects floors — first run with `baseline_path`
  not existing AND current below floor → no baseline written; method
  returns False.
- Test: bootstrap below floor with autocommit OFF — same outcome (no
  write).
- Test: version-mismatch detection —
  `stamps.lvis_dataset_sha256 != current.lvis_dataset_sha256` →
  `version_mismatch=True`; `diff_and_check` reports no regressions
  (treated as "no comparable baseline available").
- Test: rounding to 3 decimals applies before persistence — write a
  baseline with `map_50_95=0.247912`; read back and assert the stored
  value is `0.248`.
- Test: malformed baseline JSON — `diff_and_check` treats it as
  missing; logs a warning; returns "no baseline available" diff.
- Test: `EVAL_BASELINE_AUTOCOMMIT=false` (the v1 default) — even on a
  perfect run, `maybe_commit_baseline` returns False.

### §4.11 `gt_eval.runner` — `single_image_pipeline_runner`

`tests/unit/eval/test_runner.py`:

- Test: shim builds a synthetic `CorpusItem` with one frame —
  `scene_id` matches `f"lvis-{image_path.stem}"`, `capture_id="0"`,
  `frame_paths=[image_path]`.
- Test: Dagster run config has the expected shape — mock
  `pipeline_job.execute_in_process` and assert the
  `frames` list has length 1 with `frame_id`, `sha256`, `mime_type`,
  `photo_bytes_hex` keys.
- Test: `apply_eval_skip_sahi=True` sets `os.environ['EVAL_SKIP_SAHI']`
  before calling `pipeline_job.execute_in_process` and unsets it after.
- Test: `apply_eval_top_k=3` sets `os.environ['CLASSIFICATION_TOP_K']
  ='3'` similarly.
- Test: returns the `SceneObservation` produced by the
  `assemble_result` op (mock the op result).
- Test: pipeline error in any op surfaces as a tagged failure
  (`ScenenObservation.errors` non-empty, `flagged=True`) without
  raising out of the shim.

### §4.12 `gt_eval.run` — synchronous orchestration

`tests/unit/eval/test_run_orchestration.py`:

- Test: `run_gt_eval` is a synchronous function (`asyncio.iscoroutinefunction`
  returns False).
- Test: orchestrator iterates the dataset, calls `pipeline_runner` once
  per image, and aggregates results — verify with a fixture dataset of
  3 images and a mock runner.
- Test: preflight — `run_gt_eval` calls
  `detection_service_health_check()` once before any per-image work; if
  it raises, `run_gt_eval` exits with a clearly-named exception.
- Test: warm-up forward pass — after preflight, the orchestrator runs
  `pipeline_runner` once on a small fixture image before the timed loop.
- Test: rounding — given known float metrics, the returned
  `GtMetricsBlock` has all floats rounded to 3 decimals.
- Test: empty dataset → exits cleanly with an empty report and
  `n_images=0`, all metrics zero or null.

### §4.13 `EVAL_SKIP_SAHI` (existing-code modification)

`tests/unit/eval/test_skip_sahi.py`:

- Test: `EVAL_SKIP_SAHI=1` → `sahi_recovery_op` invocation returns an
  empty `[FrameDetections]` list and does NOT call `sahi_recovery_impl`.
  Assert by mocking the impl.
- Test: env var absent → existing behaviour preserved (impl is called
  with the same args as before this PR).
- Test: env var set to `"0"` or `"false"` is treated as falsy
  (no skip).

### §4.14 `run_eval.py` integration with new path

`tests/unit/eval/test_run_eval_integration.py`:

- Test: `EVAL_RUN_AGREEMENT=true, EVAL_RUN_GT=true` → both paths run;
  `last-metrics.json` contains both `metrics` and `gt_metrics` blocks.
- Test: `EVAL_RUN_AGREEMENT=false` → only `gt_metrics` block written;
  the existing `metrics` block is empty or absent.
- Test: `EVAL_RUN_GT=false` → only existing `metrics` block written;
  no `gt_metrics` block.
- Test: exit code — gating violation in either path → exit 1.
  Floor violation in `gt_metrics` → exit 1. Regression in `gt_diff`
  AND no version_mismatch → exit 1. Version_mismatch alone → exit 0
  (treated as no-baseline).

## §5 Configuration

### §5.2 thresholds.json

`tests/unit/eval/test_thresholds_extension.py`:

- Test: existing thresholds (read from a fixture pre-PR
  `thresholds.json`) are preserved verbatim when this PR adds new
  keys.
- Test: missing `thresholds.json` is created by first run with both
  existing and new defaults populated.
- Test: malformed `thresholds.json` JSON → clear error, no silent
  fallback.

### §5.4 Rounding policy

(Covered by `test_run_orchestration.py` and `test_baseline.py` above.
No separate test file.)

### §5.5 `eval/baseline.json` schema

(Covered by `test_baseline.py` above. The `stamps` sub-block is
verified specifically in the version-mismatch test.)

## §6 Test strategy

### §6.2 Integration tests (committed / opt-in)

`tests/integration/test_gt_eval_e2e.py` (default, no model deps):

- Test: end-to-end `run_eval()` with the 5-image fixture corpus +
  fixture `pipeline_runner` + mock judge produces a complete
  `last-metrics.json` containing both `metrics` and `gt_metrics`.
- Test: golden values — known fixture inputs produce known golden
  values for every headline metric within tolerance (0.005 absolute).
- Test: per_class_top10 / per_class_bottom10 ordering is correct
  (sorted by AP descending / ascending).
- Test: schema check — the produced JSON validates against an inline
  JSON-schema spec for `gt_metrics` (catches accidental field renames).

`tests/integration/test_gt_eval_real_pipeline.py` (opt-in):

- Skipped unless `EVAL_TEST_REAL_PIPELINE=1` (`@pytest.mark.skipif`).
- Test: full Florence → GDino → SAHI → Qwen pipeline runs on one
  fixture image; `gt_metrics` block is populated; no value
  assertions; the test catches integration drift on the dev Mac.

### §6.3 Replay fixtures

(Fixture data, no test file. Verified by every test that consumes
the fixtures.)

## §7 Operational concerns

### §7.3 Failure modes

`tests/unit/eval/test_failure_modes.py`:

- Test: LVIS download failure → exit code 2, error message mentions
  `LVIS_LOCAL_ZIP`.
- Test: sha256 mismatch → exit code 2, error message mentions
  `EVAL_LVIS_VERSION_BUMP`.
- Test: ≥ 5 % pipeline failures across the corpus → exit code 1, error
  surfaces failure count.
- Test: Ollama unreachable → all candidates `judge_failures`,
  `hallucination_rate=null`, gating skipped for that metric;
  other metrics still gated.
- Test: detection-service preflight unhealthy → exit 2.

### §7.4 Makefile target (manual smoke check)

(Not unit-testable; verified manually post-merge per §10 step 2 in
the plan.)

## §8 Dependency additions

`tests/unit/eval/test_dependencies.py`:

- Test: `import pycocotools` succeeds (or fallback path is logged).
- Test: `import torchmetrics.detection` succeeds.
- Test: `import scipy.optimize.linear_sum_assignment` succeeds.
- Test: `import numpy.random` (default_rng path) succeeds.

## §9 Risk register

(Risks are addressed by tests above. No separate risk-register
test file. Verified at plan-level by the integration test plus the
risk-specific unit tests cited under each risk.)

## §10 Rollout

(Manual post-merge steps; no test coverage.)

## Summary

Total new test files: 14 unit + 2 integration. Estimated lines: ~1500
across all (small files, focused tests). Coverage is concentrated in
the matchers, metrics, and baseline modules — those are the modules
where silent correctness regressions are most damaging.

The opt-in `test_gt_eval_real_pipeline.py` is the safety net for
integration drift: it does not assert specific values, but it does
assert that the new schema is produced when the real pipeline runs.
That's the only test that exercises Florence + Grounding-DINO + Qwen-VL
end-to-end against a real LVIS image.

The default integration test (with mocked pipeline + judge) is fast
(< 10 s) and runs on every CI invocation; it catches schema-level
regressions and the orchestration logic. Combined with the unit tests,
this gives full coverage of the new code paths.
