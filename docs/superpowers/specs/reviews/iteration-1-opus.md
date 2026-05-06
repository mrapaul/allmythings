# Opus Review

**Model:** claude-opus-4
**Generated:** 2026-05-05

---

# Implementation Plan Review — Automated Detection Evaluation

This review covers `/Users/mrarindampaul/Develop/allmythings/docs/superpowers/specs/claude-plan.md` and its companions (`claude-spec.md`, `claude-research.md`, `claude-interview.md`). I cross-checked load-bearing claims against the live source tree under `/Users/mrarindampaul/Develop/allmythings/pipeline-service/`.

Verdict up front: the architectural shape (additive `gt_eval/` module, Protocols for dataset and judge) is sound. But several concrete contracts are wrong or under-specified, the COCO-mAP/`category_id=-1` claim is incorrect, the `EVAL_FAST_MODE` lever does not exist in the codebase and section 4.11 misdescribes how to invoke the existing pipeline runner. There are also real-world install pitfalls (`pycocotools` on Apple Silicon) and a sampling-determinism subtlety the plan glosses over. Details below.

## 1. Architecture soundness

### 1.1 Module placement is fine; one concern about gt_eval vs eval

The choice to nest `gt_eval/` under `pipeline_service/eval/` is correct. However, the plan also writes datasets, baselines, and reports to `pipeline-service/eval/` (the data dir at repo level). That directory does not exist yet: only `pipeline-service/pipeline_service/eval/` exists. The `run_eval.py` resolves it as `Path(__file__).resolve().parent.parent.parent / "eval"`, so the path will spring into existence on first run, but §5.2 should explicitly say "create or update `thresholds.json`" including the existing keys (`agreement_coverage_min`, `dedup_precision_min`, `op_failure_rate_max`, etc.).

### 1.2 Protocols look right but miss one extension hook

Make `LabelMatcher` a Protocol (`__call__(predicted: str, gt_category: str) -> bool`) and have the encoder-cosine implementation be the default. Cost: ~10 lines. Benefit: v2 plug-in for free.

### 1.3 Hidden coupling: pipeline_runner callable

§4.11 hand-waves about the runner. The actual `default_pipeline_runner` takes `(CorpusItem, list[dict])` — a multi-frame burst. LVIS images are single-frame. Plan must specify a `single_image_pipeline_runner(image_path: Path) -> SceneObservation` shim that wraps a single image into a synthetic CorpusItem with one frame.

### 1.4 The async/sync boundary is muddled

§4.11 declares `run_gt_eval` async; §4.12 says it's "called from `run_eval.py` inside the existing event loop." But `run_eval.py` is fully synchronous. Pick: fully sync orchestration with `asyncio.run` only inside the judge's batched verification call, since the only async thing is Ollama.

## 2. Correctness

### 2.1 The category_id=-1 claim in §4.5 is wrong (P0)

`pycocotools.COCOeval` does not have a "match against every category" mode. A detection with `category_id=-1` will fail `COCO.loadRes` validation. What you need:

- Two metrics, two passes. (a) Class-aware mAP: only label-matched detections enter, with the GT cat id; unmatched are excluded. (b) Class-agnostic mAP: all detections enter with a single synthetic category id, scored against all GT collapsed to the same id.

This is a real bug that will silently produce wrong numbers.

### 2.2 The xywh/xyxy conversion is okay but underspecified

- Clamp predictions to image bounds before IoU.
- Filter zero-area boxes (pycocotools eats them and produces NaN).
- xyxy max edges should be exclusive; pin in `iou.py` and add unit tests.

### 2.3 Hungarian assignment vs. COCO scoring inconsistency

- `match_boxes` (Hungarian) feeds label-F1 and box-aware-F1 only.
- pycocotools does its own greedy-by-confidence matching internally; do NOT feed Hungarian output into pycocotools.
- §4.5's signature is missing confidence scores — pycocotools needs them. Read `PipelineDetection.confidence`; if 0, fall back to `agreementScore`.

### 2.4 Auto-commit baseline + absolute floor

Bootstrap (no baseline exists) must also check floors, otherwise a borked first run sets a baseline below the floor and subsequent runs can never recover. Specify: bootstrap must satisfy floor_violations==0; otherwise refuse to bootstrap and exit 1.

### 2.5 IoU threshold for box-aware F1 vs COCO mAP

`EVAL_IOU_THRESHOLD` should control only F1; pycocotools always uses its full sweep.

## 3. Practicality on this stack (Mac, MPS, Ollama)

### 3.1 EVAL_FAST_MODE does not exist (P0)

`CLASSIFICATION_TOP_K` is already env-driven, but there is no env var to skip SAHI. The plan needs to add a new env var (e.g. `EVAL_SKIP_SAHI=1`) and a corresponding short-circuit in `sahi_recovery_impl`. This is a modification to existing code, contradicting the "purely additive" promise.

### 3.2 pycocotools on Apple Silicon

`pycocotools` 2.0.7 has universal2 wheels — confirmed. But on a fresh `uv` install with no compiler toolchain, you can hit a build-from-source fallback. Verify by running `uv add pycocotools torchmetrics` in a clean venv. torchmetrics still requires pycocotools as a soft dep — fallback may fail for the same reason.

### 3.3 Wall-clock target of 60-90 min: optimistic

500 images at 8-10s = 67-83 min. Plus LVIS download (5-15 min first run), 50 judge calls (2-4 min), COCO eval (~30s), GT JSON parse (~5s). Cache the LVIS GT JSON parse output. Make the 90-min target conditional on warm caches.

### 3.4 Florence-2 + Grounding-DINO on MPS quirks

Add a "preflight" step that calls detection-service `/health` and does one warm-up forward pass before the eval loop starts.

### 3.5 LVIS download size and rate-limiting

Download just the 500 sampled images on first run, not the whole rare subset, keyed by deterministic seed.

## 4. TDD / test coverage

### 4.1 Three gaps

- No test for `category_id=-1` behavior (once §4.5 is fixed).
- No test for `single_image_pipeline_runner` wrapper.
- No test for `EVAL_SKIP_SAHI` env var path.

### 4.2 Integration test is necessary but not sufficient

The fixture-runner integration test never exercises Florence/GDino/Qwen/SAHI. Add a third test, gated on env var (e.g. `EVAL_TEST_REAL_PIPELINE=1`), that runs the full pipeline against one fixture LVIS image.

### 4.3 Calibration sentinels: 12-20 pairs is too few

Want 50 pairs covering obvious positives, borderline positives, obvious negatives, and hard negatives near threshold.

### 4.4 No test for novel_likely_correct math

Specify in the test: given 10 candidates with judge verdicts {6×no, 2×yes, 1×unsure, 1×failure}: assert `rate = 6/total_predictions`, NOT `6/10`.

### 4.5 Replay fixtures: 5 images may not be enough for deterministic-sampling test

Use a synthetic 50-image fixture or unit-test the sampling function in isolation against 1000 synthetic image-ids.

## 5. Risks and mitigations

### 5.1 Three additional risks

**R1: Embedding cache invalidation across calibration.** Stamp the baseline with `label_encoder_model_id` and refuse to compare baselines across model id changes.

**R2: LVIS license attribution.** Add a `LICENSE-LVIS.md` in the cache dir on first download.

**R3: Determinism under MPS non-determinism.** Round all metric values in the gt_metrics block to 3 decimal places before comparison.

### 5.2 The novel_likely_correct bucket interaction with hallucination_rate

If 30% of judge calls fail, `rate` is biased low. Specify: if `(judge_unsure + judge_failures) / candidates > 0.5`, mark `hallucination_rate` as `null` and skip the gate. Or compute a conservative bound.

### 5.3 Deterministic 500-image sampling under a seed

`random.Random.sample` is not stable across Python versions (changed in 3.11). Use `numpy.random.default_rng(seed).choice(image_ids, size=500, replace=False)` which has a stable algorithm pinned to numpy.

## 6. v1 vs v2 split

### 6.1 Things in v1 that should be deferred to v2

- **Auto-commit baseline.** For the first 2-4 weeks post-merge, `EVAL_BASELINE_AUTOCOMMIT=false` and require human review.
- **Top-10 / bottom-10 per-class breakdown.** Could be v2; v1 just gives headline numbers and dumps `per_class_ap` in full.

### 6.2 Things deferred to v2 that should arguably be in v1

- **Per-dataset label alias map.** A simple `gt_eval/datasets/lvis_aliases.json` with explicit overrides is a 30-minute add.
- **Class-agnostic mAP** (per §2.1). Single-digit number of extra lines and is the standard reporting convention for open-vocab evals.

### 6.3 Things correctly deferred

Cloud VLM judges, GitHub Actions, Grafana wiring, multi-source dataset blending — yes, all v2.

## 7. Smaller specific issues

| Where | Issue |
| --- | --- |
| §3.2 ("two paths run sequentially") | Add `EVAL_RUN_AGREEMENT=false` toggle for symmetry. |
| §4.2 LvisConfig | Pin the URL: `https://dl.fbaipublicfiles.com/LVIS/lvis_v1_train.json.zip` |
| §4.5 fallback | Document detection mechanism (try import at module load). |
| §4.7 budget cap | `HALLUCINATION_JUDGE_MAX_CALLS` defaults to `max(50, 0.1 * total_predictions)`. But §5.1 gives the default as `50`. Pick one. |
| §4.9 prompt | Qwen-VL 3B is small and prompt-sensitive. Include "Answer with JSON: {\"verdict\": \"yes\"}" to match `format=json`. |
| §5.1 EVAL_LABEL_MATCH_THETA | Document that `EVAL_IOU_THRESHOLD` covers both F1 and hallucination. |
| §7.2 "10× per-image speedup" | Unsubstantiated. Recompute. Probably 2-3×, not 10×. |
| §7.4 Makefile | Verify `make eval-pipeline` does not currently exist in root Makefile. |
| §10 step 3 | State exact `.gitignore` rule. |

## 8. Summary of required plan changes (sorted by severity)

**P0 (blocks correctness):**
1. Fix §4.5 `category_id=-1` claim. Specify class-aware AND class-agnostic mAP passes.
2. Specify the `single_image_pipeline_runner` shim in §4.11.
3. Decide on async vs sync orchestration (§4.11 vs §4.12 contradict).
4. Add `EVAL_SKIP_SAHI` and acknowledge the existing-code modification.

**P1 (blocks gates from being meaningful):**
5. Specify how partial judge failure interacts with `hallucination_rate`.
6. Specify confidence-source for pycocotools sorting when `confidence==0`.
7. Specify rounding precision for metric comparison (MPS non-determinism).
8. Specify LVIS dataset version pinning + sha256 verification.
9. Specify Python version pinning for `random.sample` determinism (or switch to numpy).

**P2 (improves robustness):**
10. Make `LabelMatcher` a Protocol.
11. Beef up calibration sentinels to 50 pairs.
12. Box clamping + zero-area filtering in `iou.py`.
13. Bootstrap baseline must respect floors.
14. Stamp `label_encoder_model_id` in baseline.
15. Add LVIS attribution file on download.
16. Add a real-pipeline opt-in integration test.
17. Default `EVAL_BASELINE_AUTOCOMMIT=false` for the first month post-merge.
18. Add `lvis_aliases.json` override map.
19. Report class-agnostic mAP alongside class-aware mAP.
20. Add a preflight model-warmup step before the eval loop.

The architecture is fundamentally workable — the issues above are concrete and addressable. With the P0 fixes the plan is ready to implement. Without them, an implementer will produce a harness that ships but reports wrong numbers in subtle ways.
