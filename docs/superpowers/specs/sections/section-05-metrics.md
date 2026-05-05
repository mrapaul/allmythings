Now I have enough context to write section 05. Let me output the section content.

# Section 05 — Metrics

## Scope

This section implements the three metric modules consumed by the orchestrator (`section-08`) and the baseline diff (`section-06`):

1. `gt_eval/metrics/coco.py` — COCO mAP wrapper that runs **two** complementary passes (class-aware + class-agnostic).
2. `gt_eval/metrics/labels.py` — label F1 + box-aware F1@0.5.
3. `gt_eval/metrics/hallucination.py` — hallucination candidate scoring with judge-budget cap and conservative null-out.

All three modules are pure compute — they do not download anything, do not touch the pipeline, and do not write files. They are imported by `gt_eval.run` (section-08) which feeds them per-image results.

## Dependencies on other sections

- **section-01-foundation** — `pipeline-service/pipeline_service/eval/gt_eval/metrics/__init__.py` already exists (empty); the conftest fixtures (`tests/unit/eval/conftest.py`) are in place; `pycocotools`, `torchmetrics`, `scipy` are installed via `pyproject.toml`.
- **section-03-matchers** — provides the `LabelMatcher` Protocol (`gt_eval.matchers.protocol.LabelMatcher`), `CosineLabelMatcher` (default impl), and `match_boxes(...)` IoU Hungarian assignment used by `labels.py` and `hallucination.py`. Coordinate hygiene (xywh→xyxy with exclusive max edges, image-bounds clamping, zero-area filtering) is already applied by `match_boxes`. Do **not** re-implement it here.
- **section-04-judges** — provides the `ReferenceModelJudge` Protocol (`async def verify(crop_jpeg_bytes: bytes, label: str) -> JudgeVerdict`) consumed by `hallucination.py`. Do **not** instantiate `QwenLocalJudge` here; the orchestrator injects the judge.

This section does **not** depend on section-02-datasets (LVIS) or section-07-pipeline-shim (runner). The metric modules accept generic `SceneObservation`-style inputs and the pre-built `GtBox` lists; the orchestrator is responsible for plumbing.

## Background — why TWO mAP passes?

The pipeline emits open-vocabulary labels (e.g. `"sectional couch"`); LVIS GT uses a fixed taxonomy (e.g. `"couch"`). A single mAP that requires exact label match unfairly penalises good box predictions whose label only fuzzily matches GT. The two-pass split fixes this:

- **Class-aware mAP** — only label-matched predictions enter pycocotools, with the matched LVIS `category_id`. **Unmatched-label predictions are EXCLUDED** from this pass entirely (they are assessed instead by the hallucination module).
- **Class-agnostic mAP** — **ALL predictions** enter pycocotools with synthetic `category_id=1`; **all GT** is also collapsed to `category_id=1`. Measures box quality independent of label quality.

Both passes use pycocotools' full IoU sweep (`0.5:0.05:0.95`).

Confidence sorting reads `PipelineDetection.confidence`. If `confidence == 0` (the schema default for some pipeline branches), it falls back to `agreementScore`. This contract must be documented in the function docstring.

## Background — hallucination contract

A hallucination *candidate* is a predicted detection with no GT box at IoU ≥ 0.5 (per the `match_boxes` output's `unmatched_pred_idxs`). Each candidate is sent to `ReferenceModelJudge.verify(...)` for a binary verdict in `{"yes", "no", "unsure"}`.

Bookkeeping rules (do not deviate):
- `verified_hallucinations` = count of `verdict == "no"` (judge agrees the detection is not the labelled object).
- `novel_likely_correct` = count of `verdict == "yes"` (judge says the detection is correct — the prediction is real but LVIS GT did not annotate this object class on this image).
- `judge_unsure` = count of `verdict == "unsure"`.
- `judge_failures` = count of judge invocations that raised or returned a non-`JudgeVerdict` value. The judge should *itself* return `"unsure"` on JSON parse / malformed-verdict per section-04, but the metric module still defends against raised exceptions.

**Rate denominator** is `total_predictions`, **NOT** `candidates`:
```
rate = verified_hallucinations / total_predictions
```
Be explicit about this in the docstring — using `candidates` would inflate the rate and would behave non-monotonically as the matcher improves.

**Conservative null-out**: when
```
(judge_unsure + judge_failures) / max(candidates, 1) > 0.5
```
set `rate = None`. The orchestrator (and baseline gate) treats `None` as "metric unknown — gate skipped".

**Budget cap** — `HALLUCINATION_JUDGE_MAX_CALLS` defaults to:
```
max(50, int(0.1 * total_predictions))
```
Once hit, remaining candidates are bucketed `judge_unsure`; the conservative null-out check then naturally fires when the budget is small relative to candidates.

`judge_unsure` itself does **NOT** count toward `verified_hallucinations` — that would penalise the gate every time the judge is uncertain, which is unfair.

## Tests FIRST

Test conventions: pytest, `asyncio_mode=auto`, `unittest.mock` and `pytest-mock`. Test files live under `pipeline-service/tests/unit/eval/`. Use the conftest fixtures from section-01 (`mock_ollama_client`, `mock_label_encoder`).

Stub definitions only — the implementer fleshes out the bodies.

### File: `pipeline-service/tests/unit/eval/test_coco_metrics.py`

```python
"""Tests for gt_eval.metrics.coco — dual-pass mAP wrapper."""
# pytest, mocker, pytest fixtures from conftest.

def test_dual_pass_split(...):
    """5 predictions, 2 with no label match.

    - Class-aware pass receives only the 3 matched preds with correct
      category_ids.
    - Class-agnostic pass receives all 5 preds with synthetic id=1; all
      GT collapsed to id=1.
    - Class-agnostic per-class breakdown contains exactly 1 class.
    """

def test_pycocotools_and_torchmetrics_agree(...):
    """3 hand-built images. Both backends produce mAP@0.5:0.95 within
    0.005 absolute tolerance.

    Skip via `pytest.importorskip` if either backend missing.
    """

def test_torchmetrics_fallback_on_pycocotools_import_error(mocker):
    """Monkeypatch pycocotools.cocoeval to raise ImportError at module
    reimport; verify torchmetrics path is selected and a warning is
    logged via caplog."""

def test_confidence_zero_falls_back_to_agreement_score(mocker):
    """Build 3 detections with confidence=0 and distinct
    agreementScore values. Patch the COCO backend to record the order
    of detections it received; assert order matches descending
    agreementScore."""

def test_empty_predictions_produces_zero_map(...):
    """No detections, non-empty GT → both passes return map_50_95=0.0,
    n_predictions=0."""

def test_empty_ground_truths_masked_to_zero(...):
    """No GT, non-empty preds → pycocotools returns NaN; wrapper masks
    NaN to 0.0 (avoids JSON corruption when written to baseline.json)."""

def test_per_category_only_populated_for_class_aware(...):
    """`PassResult.per_category` is populated for the class-aware pass
    only; class-agnostic pass leaves it as {} or {'all': ...}."""
```

### File: `pipeline-service/tests/unit/eval/test_label_metrics.py`

```python
"""Tests for gt_eval.metrics.labels — label F1 + box-aware F1."""

def test_all_correct(...):
    """Every prediction has IoU ≥ 0.5 AND a label match.
    label_f1 == 1.0, box_aware_f1_50 == 1.0,
    label_precision == 1.0, label_recall == 1.0.
    """

def test_all_wrong(...):
    """No IoU matches OR all labels mismatch.
    label_f1 == 0.0, box_aware_f1_50 == 0.0.
    """

def test_partial_match(...):
    """4 preds, 2 IoU+label correct, 1 IoU correct but wrong label,
    1 wrong IoU. Verify expected precision / recall / F1 numerics.
    """

def test_label_only_metric_ignores_iou(...):
    """A prediction with bbox far from any GT but with a correct label
    string still contributes to label_f1 if a GT exists with that
    label, regardless of overlap. box_aware_f1_50 must NOT count it.
    """
```

### File: `pipeline-service/tests/unit/eval/test_hallucination.py`

```python
"""Tests for gt_eval.metrics.hallucination — candidate scoring +
budget cap + conservative null-out."""

def test_basic_rate_denominator(mock_judge):
    """10 candidates with verdicts (6×no, 2×yes, 1×unsure, 1×failure),
    total_predictions=20.
    rate == 6/20 == 0.30,
    verified_hallucinations == 6,
    novel_likely_correct == 2,
    judge_unsure == 1,
    judge_failures == 1.
    """

def test_rate_uses_total_predictions_not_candidates(mock_judge):
    """Same verdict mix, total_predictions=100 → rate == 6/100 == 0.06."""

def test_conservative_null_out(mock_judge):
    """10 candidates with 6 unsure + 1 failure (= 7/10 = 70% > 50%).
    rate is None.
    """

def test_budget_cap(mock_judge):
    """200 candidates, judge_max_calls = 50 → only 50 verify() awaited
    calls. Remaining 150 are bucketed judge_unsure.
    Rate computation then triggers conservative null-out (60% unsure).
    """

def test_zero_candidates(mock_judge):
    """No unmatched predictions → rate == 0.0, all counts zero,
    judge.verify() never called."""

def test_judge_exception_counts_as_failure(mock_judge):
    """When mock_judge.verify raises (e.g. OllamaTimeout), count toward
    judge_failures and continue with remaining candidates."""

def test_default_budget_formula():
    """For total_predictions=100 → default cap = max(50, 10) = 50.
    For total_predictions=2000 → default cap = max(50, 200) = 200.
    """
```

## Implementation

### File: `pipeline-service/pipeline_service/eval/gt_eval/metrics/coco.py`

Public surface:

```python
"""COCO mAP wrapper with dual-pass (class-aware + class-agnostic)
evaluation. Uses pycocotools when available; falls back to torchmetrics
on ImportError.

Two-pass rationale: the pipeline emits open-vocab labels which only
fuzzily match LVIS GT. The class-aware pass measures label-correct box
quality; the class-agnostic pass measures pure box quality. Both use
the COCO 0.5:0.05:0.95 IoU sweep.

Confidence sorting reads PipelineDetection.confidence; falls back to
PipelineDetection.agreementScore when confidence == 0.

Public:
    coco_evaluate(observations, ground_truths, *, label_matcher) -> CocoEvalResult
    PassResult, CocoEvalResult dataclasses
"""

@dataclass(frozen=True)
class PassResult:
    map_50_95: float
    map_50: float
    map_75: float
    per_category: dict[str, float]   # {} for class-agnostic pass

@dataclass(frozen=True)
class CocoEvalResult:
    class_aware: PassResult
    class_agnostic: PassResult
    n_predictions: int
    n_ground_truths: int

def coco_evaluate(
    observations: Sequence[SceneObservation],
    ground_truths: Sequence[Sequence[GtBox]],
    *,
    label_matcher: LabelMatcher,
) -> CocoEvalResult:
    """Runs both mAP passes. See module docstring for the dual-pass
    contract and confidence-fallback rule.

    Empty preds → map_50_95 == 0.0.
    Empty GT → pycocotools NaN is masked to 0.0 (avoids JSON corruption).
    """
```

Implementation notes:
- Choose backend at module load (`try: import pycocotools.cocoeval` ... `except ImportError: from torchmetrics.detection import MeanAveragePrecision`). Log selection at INFO. If both fail, raise at module load (the orchestrator surfaces this as exit 2 — see section-08 failure modes).
- For the class-aware pass: iterate (prediction, gt-list) pairs; for each prediction, call `label_matcher(predicted_label, gt_label)` against every overlapping GT (or use a pre-resolved label-to-id mapping built once per image). Predictions that match no GT label are dropped from this pass entirely.
- For the class-agnostic pass: stamp `category_id=1` on every prediction and every GT before feeding the backend.
- Confidence: build a small helper `_score(detection) -> float` that returns `detection.confidence if detection.confidence > 0 else detection.agreementScore`. Use it everywhere the backend wants a score.
- `per_category` is populated only for the class-aware pass — pull `precision[..., catId, area=all, maxDets=100]` and average over IoU range to get per-class mAP. Cast keys to LVIS `category_name` strings (not ids) so the orchestrator can sort top-10/bottom-10 without an extra lookup.
- Empty-input guards: when `sum(len(gt) for gt in ground_truths) == 0`, short-circuit and return `PassResult(0.0, 0.0, 0.0, {})` for both passes (avoid pycocotools NaN). When `n_predictions == 0`, same.

### File: `pipeline-service/pipeline_service/eval/gt_eval/metrics/labels.py`

Public surface:

```python
"""Label F1 + box-aware F1@0.5.

label_f1: pure label correctness — for each image, build the multiset
of predicted labels and the multiset of GT labels; count matches via
label_matcher; compute precision / recall / F1.

box_aware_f1_50: a TP requires BOTH IoU ≥ 0.5 AND a label match. Uses
match_boxes from gt_eval.matchers.iou for assignment.

Public:
    label_f1(observations, ground_truths, *, label_matcher,
             iou_threshold=0.5) -> LabelMetrics
    LabelMetrics dataclass
"""

@dataclass(frozen=True)
class LabelMetrics:
    label_f1: float
    box_aware_f1_50: float
    label_precision: float
    label_recall: float
```

Implementation notes:
- Build per-image confusion counts; aggregate over the corpus before computing precision/recall/F1 (micro-average — matches LVIS convention and the COCO mAP semantics so the two metrics are comparable).
- For label-only F1: do NOT call `match_boxes`. For each image, walk predicted labels; for each, search GT labels for a `label_matcher` hit; count one TP per matched (pred, gt) pair without re-using the same GT twice (multiset matching, not bipartite optimal — small N per image, simple greedy is fine).
- For box-aware F1: call `match_boxes(...)` from section-03 to get `(matches, unmatched_pred_idxs, unmatched_gt_idxs)`; then filter `matches` to those where `label_matcher(pred_label, gt_label)` is True. Those filtered pairs are TPs; remaining preds are FPs; remaining GTs are FNs.
- Edge cases: zero predictions and zero GT → all metrics = 1.0 (vacuous). Zero predictions but non-zero GT → precision = 0.0, recall = 0.0, F1 = 0.0. Non-zero predictions but zero GT → precision = 0.0, recall = 1.0 (vacuous), F1 = 0.0.

### File: `pipeline-service/pipeline_service/eval/gt_eval/metrics/hallucination.py`

Public surface:

```python
"""Hallucination metric: per-image, any prediction unmatched at
IoU ≥ 0.5 against GT is a candidate. Each candidate is verified by
the configured ReferenceModelJudge.

Rate denominator is total_predictions (NOT candidates) — this keeps the
metric monotone as the matcher improves.

Conservative null-out: rate = None when
    (judge_unsure + judge_failures) / max(candidates, 1) > 0.5

Budget cap: HALLUCINATION_JUDGE_MAX_CALLS defaults to
    max(50, int(0.1 * total_predictions))
Once hit, remaining candidates are bucketed judge_unsure.

Public:
    HallucinationReport dataclass
    DEFAULT_JUDGE_MAX_CALLS_FN  (callable: total_predictions -> int)
    score_hallucinations(observations, ground_truths, *,
                         judge, iou_threshold=0.5,
                         judge_max_calls=None) -> HallucinationReport
"""

@dataclass(frozen=True)
class HallucinationReport:
    rate: float | None
    candidates: int
    verified_hallucinations: int
    novel_likely_correct: int
    judge_unsure: int
    judge_failures: int

def default_judge_max_calls(total_predictions: int) -> int:
    """max(50, int(0.1 * total_predictions))."""
```

Implementation notes:
- Iterate `(observation, gt_list)` pairs. For each, call `match_boxes(...)` from section-03 with `iou_threshold=0.5` and the image dimensions from the observation. Collect `unmatched_pred_idxs` — these are the candidates. Coordinate clamping and zero-area filtering happen inside `match_boxes` already; do not re-do them here.
- For each candidate:
  - Crop the predicted bbox from the image bytes (use existing helpers in `pipeline_service` if any; otherwise PIL crop suffices). The 1.5× RoI expansion is the **judge's** responsibility (section-04 `QwenLocalJudge`), not this module's. Pass the raw crop bytes; `roi_pad_frac` is set on the judge instance.
  - Call `asyncio.run(judge.verify(crop_bytes, predicted_label))` — the orchestrator is synchronous (section-08); only the judge is async. Wrap in try/except: any raised exception → bucket `judge_failures`. Do NOT let one failed candidate abort the corpus.
- Enforce the budget cap **before** the verify call. Track `calls_made` across the entire corpus (not per image). Once `calls_made >= effective_max`, do not call the judge for further candidates; bucket them `judge_unsure`.
- Compute `effective_max` once at function start: `judge_max_calls if judge_max_calls is not None else default_judge_max_calls(total_predictions)`.
- After all candidates are processed, compute `rate`:
  - `noise = (judge_unsure + judge_failures) / max(candidates, 1)`
  - if `noise > 0.5`: `rate = None`.
  - else: `rate = verified_hallucinations / total_predictions` (use 0.0 when `total_predictions == 0`).
- Logging: at INFO, log `total_predictions, candidates, verified_hallucinations, novel_likely_correct, judge_unsure, judge_failures, calls_made, rate` once at the end. Useful for debugging baseline drift.

## Rounding contract

These metric modules return raw `float` values (no rounding). Rounding to **3 decimal places** happens at the orchestrator boundary (section-08, `gt_eval.run`) and at the baseline write boundary (section-06, `gt_eval.baseline`). Do **NOT** round inside these modules — that would bake a precision loss into intermediate computations and lose the ability to inspect raw values during debugging.

## Files to create

- `pipeline-service/pipeline_service/eval/gt_eval/metrics/coco.py`
- `pipeline-service/pipeline_service/eval/gt_eval/metrics/labels.py`
- `pipeline-service/pipeline_service/eval/gt_eval/metrics/hallucination.py`
- `pipeline-service/tests/unit/eval/test_coco_metrics.py`
- `pipeline-service/tests/unit/eval/test_label_metrics.py`
- `pipeline-service/tests/unit/eval/test_hallucination.py`

## Files to modify

- `pipeline-service/pipeline_service/eval/gt_eval/metrics/__init__.py` — re-export `coco_evaluate, CocoEvalResult, PassResult, label_f1, LabelMetrics, score_hallucinations, HallucinationReport, default_judge_max_calls` for the orchestrator to import as `from pipeline_service.eval.gt_eval.metrics import ...`.

## Acceptance checklist

Before declaring this section complete, verify:

- [ ] All three metric modules import cleanly under `uv run python -c "from pipeline_service.eval.gt_eval import metrics"`.
- [ ] `uv run --project pipeline-service pytest tests/unit/eval/test_coco_metrics.py tests/unit/eval/test_label_metrics.py tests/unit/eval/test_hallucination.py -q` passes.
- [ ] `coco_evaluate` excludes unmatched-label predictions from class-aware mAP and includes them in class-agnostic mAP with `category_id=1`.
- [ ] Confidence sorting falls back to `agreementScore` when `confidence == 0`.
- [ ] `score_hallucinations` rate denominator is `total_predictions`, not `candidates`.
- [ ] Conservative null-out triggers when `(unsure + failures) / candidates > 0.5`.
- [ ] Budget cap defaults to `max(50, int(0.1 * total_predictions))` and buckets overflow as `judge_unsure`.
- [ ] No rounding inside these modules; raw floats returned.
- [ ] `match_boxes` is the only path used for IoU matching (no duplicate logic).
- [ ] Per-category AP is populated only for the class-aware pass.