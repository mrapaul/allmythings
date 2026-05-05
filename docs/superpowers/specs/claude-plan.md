# Implementation Plan — Automated Detection Evaluation (v2 — post-review)

This plan is a self-contained blueprint for building a ground-truth-based
evaluation harness for the Visual Home Inventory detection pipeline. It
incorporates the Opus-review feedback in `reviews/iteration-1-opus.md`;
see `claude-integration-notes.md` for the change rationale.

## 1 · Executive Summary

The application has a multi-stage detection pipeline (Florence-2 dense
captioning → Grounding-DINO open-vocab boxes → SAHI tile recovery → Qwen-VL
crop classification → label-aware dedup) hosted in a Python service called
`pipeline-service`. The pipeline currently has an evaluation rig at
`pipeline-service/pipeline_service/eval/` that measures only **inter-detector
agreement** — it cannot tell whether predictions are actually correct.

This plan adds a parallel **ground-truth-based evaluation path** that:

1. Downloads and caches a 500-image subset of the LVIS-OV rare-class
   benchmark, filtered to indoor / household categories.
2. Runs the existing pipeline on each image (in-process via Dagster) via a
   newly-introduced `single_image_pipeline_runner` shim.
3. Matches predicted boxes to LVIS GT using two complementary mAP passes:
   **class-aware** (label match required) and **class-agnostic** (box quality
   only). Plus label F1 and box-aware F1.
4. Flags hallucinated detections (no GT overlap) and triages them with a
   local Qwen-VL crop verifier.
5. Reports headline metrics + per-class top-10 / bottom-10 categories.
6. Compares against a committed `eval/baseline.json`; **does not** auto-commit
   in v1 — manual review for the first 5 stable runs, then flip the default.
7. Exits non-zero when any gate fails, surfaceable via `make test-eval`.

The new package sits at `pipeline-service/pipeline_service/eval/gt_eval/`
and is wired into the existing `run_eval.py` entry point. The harness is
**local-first** — no cloud API keys are needed in v1.

## 2 · Required Reading

- `claude-spec.md` — synthesised requirements.
- `claude-research.md` — codebase reconnaissance + external-research
  findings with citations.
- `claude-interview.md` — Q&A that decided the scope.
- `reviews/iteration-1-opus.md` — Opus review.
- `claude-integration-notes.md` — which review items are integrated.
- `pipeline-service/pipeline_service/eval/run_eval.py` (existing entry).
- `pipeline-service/pipeline_service/eval/corpus_walker.py` (existing
  multi-frame burst runner).
- `pipeline-service/pipeline_service/types.py` (`SceneObservation`,
  `PipelineDetection`, `BBox` xywh-pixel convention).

## 3 · Architecture

### 3.1 Module layout

```
pipeline-service/
├ pipeline_service/
│   └ eval/
│       ├ __init__.py                  (existing, exported names extended)
│       ├ run_eval.py                  (existing, main entry point — extended)
│       ├ corpus_walker.py             (existing, untouched)
│       ├ metrics.py                   (existing, untouched)
│       └ gt_eval/                     (NEW — this plan)
│           ├ __init__.py
│           ├ run.py                   (top-level orchestration, sync)
│           ├ runner.py                (single_image_pipeline_runner shim)
│           ├ datasets/
│           │   ├ __init__.py
│           │   ├ protocol.py          (EvalDataset Protocol)
│           │   ├ lvis.py              (LVIS-OV concrete impl)
│           │   ├ lvis_supercats.json  (allowed supercategories — DATA, not code)
│           │   └ lvis_aliases.json    (open-vocab → LVIS overrides — DATA)
│           ├ matchers/
│           │   ├ __init__.py
│           │   ├ protocol.py          (LabelMatcher Protocol)
│           │   ├ label_cosine.py      (default LabelMatcher — embedding cosine)
│           │   └ iou.py               (Hungarian-assignment IoU match)
│           ├ metrics/
│           │   ├ __init__.py
│           │   ├ coco.py              (pycocotools wrapper, dual mAP passes)
│           │   ├ labels.py            (label-only F1 + box-aware F1)
│           │   └ hallucination.py     (no-GT-overlap detection + judge)
│           ├ judges/
│           │   ├ __init__.py
│           │   ├ protocol.py          (ReferenceModelJudge Protocol)
│           │   └ qwen_local.py        (Ollama-backed Qwen-VL judge)
│           └ baseline.py              (load / diff / write baseline)
├ eval/
│   ├ datasets/                        (NEW — gitignored)
│   │   └ lvis-ov/                     (downloaded LVIS-OV cache)
│   ├ thresholds.json                  (existing — extended, see §6.2)
│   ├ baseline.json                    (existing — schema extended)
│   └ last-metrics.json                (existing — schema extended)
└ tests/
    ├ unit/eval/                        (NEW — see §6.1)
    ├ integration/test_gt_eval_e2e.py  (NEW — fixture pipeline runner)
    ├ integration/test_gt_eval_real_pipeline.py
    │                                  (NEW — opt-in via EVAL_TEST_REAL_PIPELINE=1)
    └ replay/fixtures/eval/            (NEW — 5 small JPEGs + COCO-format gt.json)
```

### 3.2 Data flow

The new `gt_eval/` package sits under `pipeline_service/eval/gt_eval/` and
is wired into `run_eval.py`. The agreement-driven path (`corpus_walker`)
and the new GT-driven path (`gt_eval`) run sequentially. Each can be
disabled by env: `EVAL_RUN_AGREEMENT=false` and `EVAL_RUN_GT=false`. Both
default to `true`.

### 3.3 Sequence of one GT-eval run

1. `gt_eval.run.run_gt_eval()` is invoked from `run_eval.py` (synchronous).
2. **Preflight**: hit `detection-service` `/health`; do one warm-up
   forward pass on a small fixture image to load Florence + Grounding-DINO
   on MPS before timing begins. Fail fast on unhealthy detection-service.
3. The configured `EvalDataset` is iterated; each iteration yields
   `(image_path, list[GtBox])`.
4. For each image, `single_image_pipeline_runner(image_path)` is invoked,
   producing a `SceneObservation`.
5. Each predicted `BBox` is clamped to image bounds and filtered for
   zero-area pathology before any matching.
6. The IoU matcher pairs predicted boxes against GT boxes (Hungarian
   assignment at IoU ≥ `EVAL_IOU_THRESHOLD`, default 0.5).
7. Hallucination candidates (predictions with no GT overlap) are sent to
   the local Qwen-VL judge in batches up to
   `HALLUCINATION_JUDGE_MAX_CALLS = max(50, int(0.1 * total_predictions))`.
8. After the corpus is exhausted, two mAP passes run (class-aware and
   class-agnostic), label F1 is computed, hallucination rate is computed
   (with conservative null-out when judge-failure rate > 50%).
9. Per-category AP is computed and the top-10 / bottom-10 are extracted
   from the **class-aware** pass.
10. The baseline file is loaded; current metrics are diffed against it;
    absolute floors are checked; **a new baseline is NOT auto-committed in
    v1 default** (`EVAL_BASELINE_AUTOCOMMIT=false`). The diff and floor
    decisions are reported regardless.
11. The full result is attached to `last-metrics.json` under a new
    `gt_metrics` top-level key; the existing `metrics` block is untouched.
12. All metric values are rounded to 3 decimal places before persistence
    (defends against MPS non-determinism flipping a borderline gate).

## 4 · Module-by-module design

### 4.1 `gt_eval.datasets.protocol`

- `class GtBox(NamedTuple)` — `x1, y1, x2, y2: float` (xyxy pixels,
  top-left origin), `category_id: int`, `category_name: str`.
- `class EvalDataset(Protocol)` — iterable yielding
  `(image_path: Path, list[GtBox])`. Properties: `name: str`,
  `category_names: list[str]`, `version_sha256: str`,
  `attribution_text: str` (used for `LICENSE-*.md`).

### 4.2 `gt_eval.datasets.lvis`

LVIS-OV downloader, cache, and filter. Pulls the LVIS annotation JSON
and only the images referenced in the rare-class subset filtered to
indoor / household supercategories.

**Configuration** (frozen dataclass):

- `cache_root: Path` (default `pipeline-service/eval/datasets/lvis-ov/`)
- `sample_size: int = 500`
- `rare_class_only: bool = True`
- `indoor_supercats_only: bool = True`
- `download_url: str = "https://dl.fbaipublicfiles.com/LVIS/lvis_v1_train.json.zip"`
  (annotations) and the COCO 2017 train images base URL `https://images.cocodataset.org/train2017/`
- `expected_archive_sha256: str | None` — when set, downloader verifies
  the archive sha256 and aborts on mismatch.
- `seed: int = 0` — sampling seed, fed to
  `numpy.random.default_rng(seed).choice(image_ids, size=N, replace=False)`
  for **stable-across-Python-versions** sampling.

**Filtering policy** — no hardcoded item list. Reads:
- `gt_eval/datasets/lvis_supercats.json` — LVIS supercategory allow-list
  (`furniture`, `appliance`, `home decor`, `kitchen`,
  `bathroom_furniture`, `lighting`, `textile`). Editable as data.
- `gt_eval/datasets/lvis_aliases.json` — optional explicit overrides
  for known systematic open-vocab → LVIS mismatches
  (e.g. `{"tv stand": "entertainment_center"}`). Empty by default;
  populated as failure modes surface in calibration.

**LVIS download** specifics:
- First run: download annotation JSON, parse once, **cache parsed dict
  via `pickle`** (the LVIS JSON parse is the slowest non-pipeline step).
- For the deterministic-seeded 500-image sample, only download those 500
  images from `images.cocodataset.org`, not the full rare-class image set.
- Write `LICENSE-LVIS.md` to `cache_root` on first download (LVIS is
  CC-BY 4.0 and COCO images are CC-BY 4.0; both must be attributed).
- `LVIS_LOCAL_ZIP` env var bypasses network entirely; consumes a
  pre-downloaded archive.

**Public surface** (`class LvisDataset(EvalDataset)`):
- `__iter__()` yields `(image_path, list[GtBox])`. Each yielded image is
  guaranteed to contain ≥1 GT box from an allowed supercategory.
- `version_sha256` returns the LVIS archive sha256 (for baseline stamping).

### 4.3 `gt_eval.matchers` — Protocol + default

`LabelMatcher` is a Protocol so v2 can plug in non-cosine strategies
(e.g. WordNet hypernym, dataset-specific alias map):

- `class LabelMatcher(Protocol)`: `__call__(predicted: str, gt_category: str) -> bool`.
- `class CosineLabelMatcher(LabelMatcher)`: default impl.
  - Uses `pipeline_service.models.label_encoder.LabelEncoder` (the
    existing `sentence-transformers/all-MiniLM-L6-v2` wrapper).
  - Cosine ≥ `threshold` (default 0.6) → True.
  - Identical normalised strings short-circuit to True.
  - Encoder failure returns True (degraded — never block a match
    because the encoder is sick). Mirrors `label_text_compat`.
  - Reads `lvis_aliases.json` first; if `predicted` has an explicit
    alias for `gt_category`, return True without calling the encoder.

The encoder is shared with the production label-compat path; reuse keeps
the embedding cache warm and the semantics consistent.

### 4.4 `gt_eval.matchers.iou`

Hungarian-assignment box matcher. Falls back to greedy when SciPy isn't
available.

- `class Match` (frozen dataclass): `pred_idx: int, gt_idx: int, iou: float`.
- `match_boxes(predictions, gts, *, iou_threshold=0.5, image_width, image_height)
  -> tuple[list[Match], list[int], list[int]]`. Returns
  `(matches, unmatched_pred_idxs, unmatched_gt_idxs)`.

**Coordinate hygiene** (added per review §2.2):
- xywh ↔ xyxy conversion is internal; the xyxy max edges are exclusive
  (`x+w` is one past the last column).
- Predicted boxes are **clamped** to `[0, image_width] × [0, image_height]`
  before IoU computation — handles slightly-out-of-frame predictions
  from upstream SAHI tile re-projection edge cases.
- **Zero-area boxes are filtered** before matching (pycocotools and
  IoU formulas handle them poorly).
- Unit tests pin the convention: `iou(BBox(0,0,10,10), BBox(0,0,10,10)) == 1.0`,
  `iou(BBox(0,0,10,10), BBox(10,0,10,10)) == 0.0` (touching, not
  overlapping).

### 4.5 `gt_eval.metrics.coco` — TWO mAP PASSES

This module produces two distinct mAP results:

- **Class-aware mAP**: only label-matched predictions enter pycocotools,
  with the matched LVIS `category_id`. Unmatched predictions are
  excluded from this pass entirely (they will be assessed by the
  hallucination metric instead).
- **Class-agnostic mAP**: all predictions enter pycocotools with a
  single synthetic `category_id=1`; all GT boxes are also collapsed to
  that single id. Measures box-quality independent of label quality.

Both passes use pycocotools' full `0.5:0.05:0.95` IoU sweep. Confidence
sorting reads `PipelineDetection.confidence`; if 0 (the schema default
for some pipeline branches), falls back to `PipelineDetection.agreementScore`.
This is documented in the function docstring.

**Public surface**:
- `coco_evaluate(observations, ground_truths, *, label_matcher) -> CocoEvalResult`.
- `class CocoEvalResult` (dataclass): `class_aware: PassResult`,
  `class_agnostic: PassResult`, `n_predictions, n_ground_truths: int`.
- `class PassResult` (dataclass): `map_50_95, map_50, map_75: float`,
  `per_category: dict[str, float]` (only populated for class-aware pass).

**Backend selection**: try `import pycocotools.cocoeval` at module load.
On ImportError, fall back to `torchmetrics.detection.MeanAveragePrecision`.
This selection is logged at module load. (Note: torchmetrics 1.4 still
has pycocotools as a soft dependency. We add `pycocotools-binary` as
a fallback wheel option to avoid Apple-Silicon source-build pitfalls.)

### 4.6 `gt_eval.metrics.labels`

- `class LabelMetrics` (dataclass): `label_f1: float`,
  `box_aware_f1_50: float`, `label_precision: float`, `label_recall: float`.
- `label_f1(observations, ground_truths, *, label_matcher, iou_threshold=0.5)
  -> LabelMetrics`.

### 4.7 `gt_eval.metrics.hallucination`

Per-image: any predicted detection with no GT box at IoU ≥ 0.5 is a
hallucination candidate. Each is sent to the configured `ReferenceModelJudge`
for binary verification.

- `class HallucinationReport` (dataclass): `rate: float | None`,
  `candidates: int`, `verified_hallucinations: int`,
  `novel_likely_correct: int`, `judge_unsure: int`, `judge_failures: int`.

**Conservative-rate policy** (per review §5.2):
- If `(judge_unsure + judge_failures) / max(candidates, 1) > 0.5`,
  `rate = None`. The gate is then skipped (treat as "unknown") and the
  absolute-floor check applies to other metrics only.
- Otherwise `rate = verified_hallucinations / total_predictions`
  (judge_unsure does NOT count as hallucination — that would inflate
  the rate every time the judge is uncertain, which is unfair).

**Budget cap**: `HALLUCINATION_JUDGE_MAX_CALLS` defaults to
`max(50, int(0.1 * total_predictions))`. Once hit, remaining candidates
are bucketed `judge_unsure` and the rate is computed conservatively.

### 4.8 `gt_eval.judges.protocol`

- `JudgeVerdict = Literal["yes", "no", "unsure"]`.
- `class ReferenceModelJudge(Protocol)`: `name: str`,
  `async def verify(crop_jpeg_bytes: bytes, label: str) -> JudgeVerdict`.

### 4.9 `gt_eval.judges.qwen_local`

The v1 concrete impl. Wraps the existing `OllamaClient` with a binary-
classification prompt and a 1.5×-expanded crop.

- `class QwenLocalJudge(ReferenceModelJudge)`: `name = "qwen2.5vl:3b"`.
  Constructor: optional `OllamaClient`, `roi_pad_frac: float = 0.5`
  (expand crop to 1.5×).

**Prompt** — built at runtime, no hardcoded item list:
```
You are verifying a vision-model detection. Look at the cropped region.
Is this region a {label}? Answer with JSON only:
  {"verdict": "yes"} if confident the region shows a {label},
  {"verdict": "no"} if it clearly is not,
  {"verdict": "unsure"} if you cannot tell.
Do not include any other keys or commentary.
```

JSON-mode forces a structured response. Parse failures map to `"unsure"`.
Ollama call uses `keep_alive="60s"` to keep the 3B model warm during a
batch; final call sets `keep_alive=0` to release MPS for the next stage.

### 4.10 `gt_eval.baseline`

Reads / writes `pipeline-service/eval/baseline.json`. Compares current
run against baseline, emits a human-readable diff, enforces absolute
floors, and writes a new baseline iff every gate passes AND
`EVAL_BASELINE_AUTOCOMMIT=true`.

**Public surface**:
- `class MetricDelta` (dataclass): `metric, current, baseline, delta`.
- `class MetricFloor` (dataclass): `metric, current, floor`.
- `class BaselineDiff` (dataclass): `regressions, improvements: list[MetricDelta]`,
  `floor_violations: list[MetricFloor]`, `baseline_age_days: int`,
  `version_mismatch: bool` (LVIS sha256 or label-encoder model id).
- `diff_and_check(current, baseline_path, thresholds_path) -> BaselineDiff`.
- `maybe_commit_baseline(diff, current, baseline_path, autocommit_enabled)
  -> bool`. Writes only when:
  - `autocommit_enabled` is True.
  - Zero regressions vs baseline.
  - Zero floor violations.
  - Zero version mismatches.

**Bootstrap policy** (per review §2.4): if no baseline exists, the
current run **also** must satisfy floor_violations==0 to be written
as the first baseline. A run that fails floors when bootstrapping exits
non-zero without writing the baseline. This prevents lock-in to a
borked first run.

**Stamping** (per review §5.1 R1): the baseline file records:
- `lvis_dataset_sha256` — from `LvisDataset.version_sha256`.
- `label_encoder_model_id` — from
  `pipeline_service.models.label_encoder._DEFAULT_MODEL_NAME`.
- `python_version` — `sys.version`.
- `created_at` — ISO timestamp.

A baseline whose stamp differs from the current run's environment is
flagged `version_mismatch=True`; comparison is skipped (treated as
"no baseline available — bootstrap-eligible") and an explicit
`EVAL_LVIS_VERSION_BUMP=1` env opt-in is required to write a fresh
baseline under the new version stamp.

### 4.11 `gt_eval.runner` — single_image_pipeline_runner shim

The existing `corpus_walker.default_pipeline_runner` takes
`(CorpusItem, list[dict])` — a multi-frame burst. LVIS images are
single-frame. New shim:

- `single_image_pipeline_runner(image_path: Path, *, mime_type: str = "image/jpeg",
  apply_eval_skip_sahi: bool = False) -> SceneObservation`.
- Wraps the image into a synthetic
  `CorpusItem(scene_id=f"lvis-{image_path.stem}", capture_id="0",
  frame_paths=[image_path])`.
- Builds the same Dagster run config the multi-frame burst path uses,
  with one frame: `{frame_intake: {config: {frames: [{frame_id, sha256,
  mime_type, photo_bytes_hex}]}}}`.
- Calls `pipeline_job.execute_in_process(run_config=...)`.
- Returns the `SceneObservation` from the assemble_result op.
- When `apply_eval_skip_sahi=True`, sets the run config to disable SAHI
  (see §4.13).

The shim is a top-level function for testability; the Dagster invocation
is mockable in unit tests.

### 4.12 `gt_eval.run` — synchronous orchestration

The orchestrator is **synchronous**. The judge's `verify()` is `async`
because the underlying Ollama client is async, but the orchestrator
calls it via `asyncio.run(judge.verify(...))` inside the
hallucination-metric module — that's the only place async actually
matters.

- `class GtEvalConfig` (dataclass): `sample_size`, `label_match_threshold`,
  `iou_threshold`, `judge: ReferenceModelJudge | None`, `judge_max_calls`,
  `write_baseline`, `apply_eval_skip_sahi`, `apply_eval_top_k`.
- `class HeadlineMetrics`: `class_aware_map_50_95, class_aware_map_50,
  class_agnostic_map_50_95, class_agnostic_map_50, label_f1, box_f1_50,
  hallucination_rate: float | None, novel_likely_correct, judge_unsure: int`.
- `class GtMetricsBlock`: `headline: HeadlineMetrics`,
  `per_class_top10, per_class_bottom10: list[CategoryAP]`,
  `n_images, n_predictions, n_ground_truths: int`, `runtime_s: float`.
- `def run_gt_eval(config, dataset, pipeline_runner) -> GtMetricsBlock`
  (synchronous).

`pipeline_runner` is injected so unit / integration tests can replace it
with a fixture-replay function (no Dagster, no models loaded).

### 4.13 Wiring `EVAL_SKIP_SAHI` (existing-code modification)

This is **not** purely additive — it's a small, env-gated edit to
existing pipeline code. Acknowledged.

- Edit: `pipeline_service/dagster_defs.py` (the `sahi_recovery_op`
  Dagster op) reads `EVAL_SKIP_SAHI` env var; when truthy, returns an
  empty `[FrameDetections]` and skips the underlying impl call.
- Default behaviour (env var absent): unchanged. SAHI runs as today.
- Unit test pinned in `tests/unit/eval/test_skip_sahi.py` asserting both
  paths.
- This edit does NOT modify any existing test expectations (none of
  them set the env var).

### 4.14 Integration into `run_eval.py`

Adds two env-gated blocks:

```
if env('EVAL_RUN_AGREEMENT', default=True):
    # existing agreement-metrics path (unchanged)

if env('EVAL_RUN_GT', default=True):
    gt_block = gt_eval.run.run_gt_eval(...)
    metrics_dict['gt_metrics'] = gt_block.to_dict()
    metrics_dict['gt_diff'] = ...
```

Existing exit-code logic extends to: exit 1 if violations OR
corpus_empty OR `gt_floor_violations` OR (`baseline_path.exists()` AND
`gt_regressions` AND no `version_mismatch`). Version-mismatch is treated
as "no baseline available" — bootstraps fresh, doesn't fail.

## 5 · Configuration

### 5.1 Environment variables

| Var | Default | Effect |
| --- | --- | --- |
| `EVAL_RUN_GT` | `true` | Enable the new GT-eval path. |
| `EVAL_RUN_AGREEMENT` | `true` | Enable the existing agreement-eval path. |
| `EVAL_SAMPLE_SIZE` | `500` | LVIS images per run. |
| `EVAL_SEED` | `0` | Sampling seed (numpy.random.default_rng). |
| `LVIS_LOCAL_ZIP` | unset | If set, points to a pre-downloaded LVIS archive. |
| `EVAL_LABEL_MATCH_THETA` | `0.6` | Cosine threshold for label match. |
| `EVAL_IOU_THRESHOLD` | `0.5` | IoU threshold for F1 + hallucination match (NOT mAP — that uses the full COCO sweep). |
| `HALLUCINATION_JUDGE_MAX_CALLS` | `max(50, int(0.1 * total_predictions))` | Cap on Qwen-VL judge calls per run. |
| `EVAL_BASELINE_AUTOCOMMIT` | `false` | v1 default OFF. Flip to true after 5+ stable runs. |
| `EVAL_LVIS_VERSION_BUMP` | unset | Required to bootstrap a baseline under a new LVIS dataset sha256. |
| `EVAL_SKIP_SAHI` | unset | When truthy, the SAHI op is a no-op for this run only. Used by GT eval to hit runtime budget. |
| `CLASSIFICATION_TOP_K` | `8` (existing) → `3` (eval default) | GT-eval orchestrator overrides via env before invoking pipeline. |
| `EVAL_TEST_REAL_PIPELINE` | unset | When set, the opt-in real-pipeline integration test runs (else skipped). |

### 5.2 Threshold file extension

`pipeline-service/eval/thresholds.json` may not exist before this PR
(per review §1.1, the runtime resolves it relative to the data dir
which springs into existence on first run). The plan specifies:

- If file does not exist: this PR creates it with both the existing
  agreement-metric thresholds (cited from `run_eval.py` lines 82–93)
  AND the new GT-metric thresholds.
- If file exists: this PR adds the new `gt_metrics.gating` and
  `gt_metrics.warn` keys without modifying existing keys.

```jsonc
{
  "gating": {
    "agreement_coverage_min": 0.70,         /* existing */
    "dedup_precision_min": 0.88,            /* existing */
    "op_failure_rate_max": 0.05,            /* existing */
    /* NEW */
    "class_aware_map_50_95_min": 0.20,
    "class_agnostic_map_50_95_min": 0.30,
    "label_f1_min":  0.50,
    "hallucination_rate_max": 0.15
  },
  "warn": {
    "agreement_precision_min": 0.40,        /* existing */
    "self_diagnosis_trigger_rate_max": 0.30, /* existing */
    "single_source_run_rate_max": 0.05,     /* existing */
    "empty_detection_set_rate_max": 0.02,   /* existing */
    /* NEW */
    "class_aware_map_50_min": 0.30,
    "box_f1_50_min": 0.45,
    "novel_likely_correct_min": 0
  }
}
```

Floors are absolute; bake-in policy: 5 successful runs before tightening.

### 5.3 Schema of `last-metrics.json`

Existing top-level keys preserved. Two new top-level keys:

```jsonc
{
  /* existing: metrics, thresholds, violations, warnings,
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

### 5.4 Rounding policy (per review §5.1 R3)

All `gt_metrics` float values are rounded to **3 decimal places** before
persistence. MPS produces small floating-point variation across runs
that can flip a borderline gate; rounding makes regression detection
stable. Cardinal counts (`novel_likely_correct`, `n_images`, etc.) are
not rounded.

### 5.5 `eval/baseline.json` schema extension

Existing baseline file structure preserved; add a `gt_metrics`
sub-block mirroring §5.3, plus a `stamps` sub-block:

```jsonc
{
  /* existing baseline keys */
  "gt_metrics": {...},
  "stamps": {
    "lvis_dataset_sha256": "abc123...",
    "label_encoder_model_id": "sentence-transformers/all-MiniLM-L6-v2",
    "python_version": "3.11.10",
    "created_at": "2026-05-05T13:24:00Z"
  }
}
```

Bootstrap behaviour: if no baseline exists OR if the existing baseline
is missing the `gt_metrics` block, the current run bootstraps it
provided floors pass.

## 6 · Test strategy

Mirrors existing pytest conventions
(`pipeline-service/tests/...`, `asyncio_mode=auto`, replay fixtures
under `tests/replay/fixtures/`).

### 6.1 Unit tests

| File | Pins |
| --- | --- |
| `test_lvis_loader.py` | Synthetic 50-image fixture archive; cache hit on second iter; supercategory filter; deterministic numpy sampling under fixed seed; sha256 verification; LICENSE-LVIS.md written; pickle cache hit on JSON parse second time around. |
| `test_label_matcher.py` | 60 calibration sentinels across 5 buckets (15 obvious-positive, 15 borderline-positive, 15 obvious-negative, 5 hard-negative, 10 cross-language). Identical-string short-circuit; encoder-failure degradation to True; alias-map override path. |
| `test_iou_matcher.py` | Synthetic xyxy pairs at IoU 0.0/0.4/0.5/0.6/1.0; touching boxes give IoU=0; identical boxes give IoU=1; Hungarian gives optimal pairing on a 3×3 ambiguous case; xywh→xyxy conversion; image-bound clamping; zero-area filtering. |
| `test_coco_metrics.py` | 3 hand-built images with known mAP under both pycocotools and torchmetrics backends. **Includes**: unmatched-label-detection ⇒ excluded from class-aware pass, included in class-agnostic pass with synthetic id 1; confidence==0 falls back to agreementScore. |
| `test_label_metrics.py` | Confusion-matrix corner cases: all-correct, all-wrong, partial-match. |
| `test_hallucination.py` | Mocked judge returning yes/no/unsure across 10 candidates; budget-cap behaviour; `novel_likely_correct` accounting; conservative null-out when (unsure+failure)/candidates > 0.5; rate denominator is `total_predictions` (not `candidates`). |
| `test_qwen_local_judge.py` | Mock `OllamaClient`; verifies prompt includes the `{"verdict": ...}` JSON shape; 1.5× RoI expansion; JSON-parse failure → `"unsure"`; `keep_alive` plumbing. |
| `test_baseline.py` | Round-trip I/O; diff produces correct deltas; floor enforcement blocks bad commit; first-run bootstrap respects floors; version-mismatch detection (LVIS sha256 + label_encoder_model_id); rounding to 3 decimals. |
| `test_runner.py` | Mock `pipeline_job.execute_in_process`; verify `single_image_pipeline_runner` builds a one-frame `CorpusItem`-shaped run config; `apply_eval_skip_sahi=True` sets env before execution. |
| `test_skip_sahi.py` | `EVAL_SKIP_SAHI=1` makes `sahi_recovery_op` return empty `[FrameDetections]` without calling the impl; absent env var leaves behaviour unchanged. |

### 6.2 Integration tests

**Default (committed, runs in CI):** `tests/integration/test_gt_eval_e2e.py`
- 5-image fixture corpus committed under `tests/replay/fixtures/eval/`.
- Fixture pipeline runner returns a hand-built `SceneObservation` per
  image (skips Dagster + models entirely).
- Mock judge returns deterministic verdicts.
- Asserts `run_gt_eval()` produces a `GtMetricsBlock` matching golden
  values within tolerance, and that `run_eval()` end-to-end produces a
  `last-metrics.json` containing both `metrics` and `gt_metrics`.

**Opt-in (real pipeline):**
`tests/integration/test_gt_eval_real_pipeline.py`, gated on
`@pytest.mark.skipif(os.getenv('EVAL_TEST_REAL_PIPELINE') is None)`.
Runs the full Florence → GDino → SAHI → Qwen pipeline on one fixture
image and asserts a populated `gt_metrics` block — no value assertions,
just shape. Catches integration drift on developer machines that have
the full model stack.

### 6.3 Replay fixtures

`tests/replay/fixtures/eval/`:
- `images/` — 5 small JPEGs.
- `gt.json` — minimal LVIS-shaped GT JSON with 5 images, 12 GT boxes
  across 4 categories.
- `synthetic_image_ids.json` — 1000 fake image-ids for the deterministic-
  sampling unit test (so the seed test does meaningful work).

## 7 · Operational concerns

### 7.1 First-run experience

```
$ make test-eval
[…downloads LVIS-OV annotations + 500 images, ~5 min on first run…]
[…preflight: detection-service health + 1 warm-up forward pass, ~10s…]
[…runs pipeline on each image with EVAL_SKIP_SAHI=1, EVAL_TOP_K=3, ~70 min…]
[…matches, computes class-aware + class-agnostic mAP, ~3 min…]
[…hallucination-judge for 50 candidates, ~3 min…]
ok = True
gt_metrics:
  class-aware mAP@.5:.95 = 0.247   class-agnostic mAP@.5:.95 = 0.318
  label_f1 = 0.612                 hallucination_rate = 0.082
  per_class top10:    couch (0.71), …
  per_class bottom10: spice_rack (0.04), …
baseline auto-committed: false (EVAL_BASELINE_AUTOCOMMIT=false; manual review)
```

### 7.2 Wall-clock target — recomputed per review §3.3

Skipping SAHI saves variable time depending on density (most LVIS
indoor images won't trigger it anyway, ~0–30% speedup). Reducing
CLASSIFICATION_TOP_K from 8 to 3 saves ~60% of Qwen-VL calls. Combined
realistic speedup: ~2.5×, not 10×.

Targets:
- **Smoke run** (`EVAL_SAMPLE_SIZE=100`): ≤ 25 min.
- **Standard run** (`EVAL_SAMPLE_SIZE=500`, warm caches): ≤ 90 min.
- **First run** (with LVIS download): ≤ 120 min.

If the standard run misses 90 min in practice, `EVAL_SAMPLE_SIZE=300`
is the next dial; below that, statistical confidence on rare-class AP
drops too far.

### 7.3 Failure modes

| Failure | Behaviour |
| --- | --- |
| LVIS download fails | Surface error; suggest `LVIS_LOCAL_ZIP`. Exit 2 (config error). |
| LVIS archive sha256 mismatch | Treat as a different dataset version; require `EVAL_LVIS_VERSION_BUMP=1` to proceed; otherwise exit 2. |
| Single image pipeline call errors | Record under `n_pipeline_failures`; if ≥ 5 % of corpus, abort with non-zero exit. |
| `pycocotools` import fails at module load | Fall back to torchmetrics backend silently; log a warning. |
| Both `pycocotools` and torchmetrics unavailable | Module load fails fast; exit 2. |
| Ollama unavailable for the judge | All hallucination candidates → `judge_failures`; `hallucination_rate=null`; gating skipped for this metric; absolute floor still applies for non-null metrics. |
| Baseline file is malformed JSON | Treat as missing; log warning; bootstrap on this run (still respects floors). |
| Baseline file missing | Bootstrap (write current as baseline IFF floors pass); skip diff. |
| Version stamp mismatch | Treat as no-baseline; exit 1 if `EVAL_LVIS_VERSION_BUMP` not set; bootstrap if it is. |
| Detection-service preflight unhealthy | Exit 2 (config / system error). |

### 7.4 Makefile target

Append to root `Makefile`:

```make
test-eval: ## Run GT-based evaluation harness on LVIS-OV indoor subset
	@cd pipeline-service && uv run python -m pipeline_service.eval.run_eval

test-eval-smoke: ## Faster smoke run, 100 images
	@cd pipeline-service && EVAL_SAMPLE_SIZE=100 uv run python -m pipeline_service.eval.run_eval
```

`make test` is **not** modified — eval is too slow to be in the default
test loop. The existing in-tree `eval-pipeline` and `eval-ci` targets
(if any) are preserved unchanged.

### 7.5 Adding a new dataset (v2)

Drop `gt_eval/datasets/openimages.py` implementing the `EvalDataset`
Protocol; expose it from `gt_eval.datasets.__init__`. `run_eval.py`
selects via env var `EVAL_DATASET=openimages` (default `lvis`). No
other module changes.

### 7.6 Adding a cloud VLM judge (v2)

Drop `gt_eval/judges/openai_gpt4o.py` (or anthropic / google) implementing
`ReferenceModelJudge`. Gate registration on the relevant `*_API_KEY` env
var. Add a hard $-cap parameter to the judge constructor. Orchestrator
reads `EVAL_JUDGE` env var to pick which Protocol impl to use. Out of
scope for v1; the Protocol is designed so v2 doesn't refactor.

## 8 · Dependency additions

`pipeline-service/pyproject.toml` gains:

| Package | Floor | Purpose |
| --- | --- | --- |
| `pycocotools` | `>=2.0.7` | COCO mAP eval (with torchmetrics fallback). |
| `pycocotools-binary` | (optional) | Apple-Silicon-friendly wheel fallback if pycocotools source-build fails. |
| `torchmetrics` | `>=1.4` | Fallback mAP backend. |
| `scipy` | `>=1.13` | `linear_sum_assignment` for Hungarian matching. |
| `requests` | `>=2.32` | LVIS downloader (sync). |
| `tqdm` | `>=4.67` | Progress bar for downloads + per-image eval. |

`numpy`, `sentence-transformers` already deps. No new test deps.

**Verification step** in §10 (Rollout): run `uv add` of the above in a
clean venv on the dev Mac before committing the pyproject change, to
catch the pycocotools-on-Apple-Silicon build issue early.

## 9 · Risk register

| Risk | Mitigation |
| --- | --- |
| LVIS hot-link rot / rate limits | `LVIS_LOCAL_ZIP` escape hatch; sha256 verification; documented in README. |
| Embedding-cosine label match has false positives | 60 calibration sentinels in test; `lvis_aliases.json` per-category overrides; `EVAL_LABEL_MATCH_THETA` tunable. |
| Auto-commit baseline drifts down silently | v1 default `EVAL_BASELINE_AUTOCOMMIT=false`; absolute floors; bootstrap respects floors; baseline diff tracked in git. |
| Qwen-VL judge inflates runtime | Hard `judge_max_calls` cap; only no-GT-overlap detections sent to judge; `EVAL_SKIP_SAHI` + reduced `CLASSIFICATION_TOP_K` shrink per-image cost. |
| LVIS GT taxonomy diverges from app's open-vocab labels | Embedding-cosine match w/ calibrated threshold; `lvis_aliases.json` overrides; `novel_likely_correct` bucket surfaces real items LVIS doesn't annotate. |
| Existing tests start failing | New code is additive except for the env-gated `EVAL_SKIP_SAHI` short-circuit, which is no-op in the default path. CI surfaces any regression. |
| `pycocotools` build fails on Apple Silicon | Pinned wheel; `pycocotools-binary` fallback; torchmetrics secondary fallback. |
| First few runs lock in a bad baseline | v1 `EVAL_BASELINE_AUTOCOMMIT=false`; bake-in policy: 5+ stable runs before flipping default to true. |
| Embedding model upgraded post-merge silently invalidates baseline | `label_encoder_model_id` stamped in baseline; mismatch forces re-bootstrap. |
| LVIS license attribution missing | `LICENSE-LVIS.md` written to cache_root on first download; documented in README. |
| MPS non-determinism flips borderline gate | All `gt_metrics` floats rounded to 3 decimal places before comparison or persistence. |
| `random.sample` algorithm change between Python versions | Use `numpy.random.default_rng(seed).choice(...)` — algorithm pinned to numpy version, stable across Python versions. |

## 10 · Rollout

Single PR, single merge. The harness is mostly additive; the one
existing-code modification (`EVAL_SKIP_SAHI` env-gated short-circuit in
`sahi_recovery_op`) is no-op in the default path. The existing eval rig,
agreement metrics, and CI behaviour remain unchanged.

After merge:

1. Verify dependencies install cleanly: `cd pipeline-service && uv add
   pycocotools torchmetrics scipy requests tqdm` in a clean venv on the
   dev Mac. Watch for pycocotools build issues; switch to
   `pycocotools-binary` if needed.
2. Run `make test-eval-smoke` (100 images) to verify the harness works
   end-to-end.
3. Run `make test-eval` (500 images) to bootstrap the baseline.
4. Manually review the bootstrapped `pipeline-service/eval/baseline.json`,
   verify floors pass, commit it.
5. Add `pipeline-service/eval/datasets/` to `.gitignore` (one new line).
   The line `pipeline-service/eval/last-metrics.json` is already
   gitignored; verify and add only what's missing.
6. Document the new harness in `pipeline-service/README.md` with a
   "Running the eval harness" section: command, env vars, what the
   numbers mean.
7. After 5+ successful runs on different commits show stable metrics,
   flip `EVAL_BASELINE_AUTOCOMMIT=true` as the default in a follow-up PR.

A v2 follow-up will add cloud VLM judges, GitHub Actions nightly,
dataset blending (LVIS + OpenImages + custom), and Grafana dashboard
wiring. The Protocol surfaces are explicit about where those plug in.

## 11 · Open questions deferred to v2

- Grafana dashboard wiring for `last-metrics.json`.
- Cloud-VLM judge cost-cap design (Anthropic batch API vs realtime).
- Multi-source dataset blending and how their per-class APs combine
  into a single headline number.
- Per-PR GitHub Actions hookup.
- Active-learning / failure-case mining UI.
- Per-category threshold overrides (e.g. allow lower mAP floor on
  rare classes specifically).
- Auto-flip `EVAL_BASELINE_AUTOCOMMIT=true` once the metric distribution
  is calibrated.
