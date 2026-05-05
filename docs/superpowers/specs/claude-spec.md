# Automated Detection Evaluation — Synthesised Spec

Combined output of `2026-05-05-automated-detection-eval-spec.md` (initial),
`claude-research.md` (codebase + external research) and `claude-interview.md`
(decisions). This is the source-of-truth spec the implementation plan
will follow.

---

## 1. Goal

Replace manual iPhone-photo testing of the visual-home-inventory detection
pipeline with an automated evaluation harness that grades pipeline output
against a published ground-truth dataset (LVIS-OV rare-class subset
filtered to indoor / household categories) and gates regressions in CI.

## 2. Why

- Manual phone testing is non-reproducible and slow.
- The existing `pipeline-service/pipeline_service/eval/` rig measures
  inter-detector agreement only — it cannot tell whether the pipeline is
  actually correct, just whether its detectors agree with each other.
- Open-vocabulary detection regression is silent without GT-based
  metrics: a Qwen-VL classification flip from "couch" to "bed" registers
  as zero on agreement-coverage but is a real product regression.

## 3. Scope (v1)

The interview narrowed scope to a **minimal-cost, local-first** v1:

1. **External GT corpus** — LVIS-OV rare-class subset, filtered to
   indoor/household categories. Cached locally at
   `pipeline-service/eval/datasets/` (gitignored). Default 500 images per
   run; configurable via `EVAL_SAMPLE_SIZE`.
2. **In-process pipeline invocation** — call the existing
   `pipeline_job.execute_in_process()` per the eval rig pattern. No HTTP
   round-trip in v1.
3. **GT-matched metrics** — COCO mAP@0.5:0.95, label F1 (label-only),
   box-aware F1@0.5, hallucination rate (detections with no spatial
   GT corroboration). Reported as a new `gt_metrics` block in
   `eval/last-metrics.json` alongside the existing `metrics` block.
4. **Open-vocab label matching** — match pipeline labels to LVIS
   categories via `sentence-transformers/all-MiniLM-L6-v2` cosine ≥ 0.6
   (the same encoder already in production for dedup).
5. **Per-class breakdown** — headline aggregate metrics PLUS top-10 and
   bottom-10 categories by AP. Surface both wins and worst-case failure
   modes.
6. **Local Qwen-VL judge for hallucination tagging** — for any
   detection that has NO GT box overlap, send the crop to
   Qwen-VL via Ollama with a binary prompt
   ("Is this region a {label}? yes/no/unsure"). Use the result to
   triage hallucinations vs novel-but-correct items.
7. **Absolute-floor thresholds + baseline diff** — `eval/thresholds.json`
   gains `gt_metrics.gating` rules. Auto-committed baseline file can
   never push below the absolute floor.
8. **`make test-eval` Makefile target** that runs the harness and exits
   non-zero on regression. No GitHub Actions hookup in v1.

## 4. Out of scope (v1)

- Cloud VLM judges (GPT-4o, Claude, Gemini) — adapter Protocol is
  designed in but no concrete implementations ship; opt-in for v2.
- GitHub Actions / CI scheduling — local-only.
- Custom hand-annotation tooling — LVIS provides GT.
- HTTP-path testing (would test api-service ↔ pipeline-service plumbing
  separately).
- iOS-side UI testing.
- Re-training the underlying detection / classification models.
- Dataset alternatives (OpenImages, Hypersim) — v2 if LVIS coverage gaps
  appear.
- Active learning / human relabel UI.

## 5. Constraints

- **Zero cloud spend** in default config. The harness must be runnable
  on a checkout without any API keys.
- **No hardcoded prompt or item lists** anywhere — continues the
  constraint from the previous deep-plan. GT category lists come from
  LVIS metadata; reference-VLM prompts are derived from the
  detection labels at runtime.
- **No regression of the existing 235+ unit tests.** The new harness
  layers onto the existing `pipeline-service/pipeline_service/eval/`
  module without modifying existing metric definitions.
- **All artefacts under `pipeline-service/eval/datasets/` are gitignored**
  (LVIS subset is too big to commit).

## 6. Success criteria

- `make test-eval` runs the harness end-to-end on the cached LVIS-OV
  subset (or downloads + caches on first run).
- Returns exit code 0 on no regression, 1 on regression with a
  human-readable diff report on stderr.
- Adds new metrics under `gt_metrics` block in `last-metrics.json`:
  `map_50_95`, `map_50`, `label_f1`, `box_f1_50`, `hallucination_rate`,
  plus per-class top10 / bottom10 lists.
- New gating thresholds (`map_50_95_min`, `hallucination_rate_max`,
  `label_f1_min`) live in `eval/thresholds.json` under `gating` and are
  enforced by absolute floor.
- Baseline auto-commit only when **all** of: gating passes, baseline
  diff has no regression, AND new run respects absolute floors.
- A new test image / category can be added by editing one config file
  (no code changes), and a new dataset adapter can be added by
  implementing one Protocol class.
- Reference-VLM judge interface is a Protocol with a working local
  Qwen-VL implementation; cloud impls can be added later without
  changing the Protocol.

## 7. Architecture overview

```
┌──────────────────────────────────────────────────────────────────┐
│  pipeline-service/pipeline_service/eval/  (existing module)      │
│                                                                  │
│  ┌────────────────────────┐    ┌────────────────────────────┐    │
│  │ corpus_walker.py       │    │ run_eval.py (entry point)  │    │
│  │ (existing — agreement) │◄───┤ (existing)                 │    │
│  └────────────────────────┘    └────────────┬───────────────┘    │
│                                             │                    │
│                                             ▼                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ NEW: gt_eval/                                            │    │
│  │   ├ datasets/        (LVIS-OV downloader + filter)       │    │
│  │   ├ matchers/        (label match via embedding cos)     │    │
│  │   ├ metrics/         (mAP, F1, hallucination_rate)       │    │
│  │   ├ judges/          (Qwen-VL crop verifier; Protocol)   │    │
│  │   └ baseline.py      (load/diff/auto-commit)             │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                             │                    │
│                                             ▼                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ last-metrics.json:                                       │    │
│  │   { metrics: {...},          ← existing agreement       │    │
│  │     gt_metrics: {            ← NEW                      │    │
│  │       headline: {...},                                  │    │
│  │       per_class_top10: [...],                           │    │
│  │       per_class_bottom10: [...] },                      │    │
│  │     thresholds: { gating, warn },                       │    │
│  │     violations, warnings, ok }                          │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

The new `gt_eval/` package sits under
`pipeline-service/pipeline_service/eval/gt_eval/` and is wired into the
existing `run_eval.py` entry point. The agreement-driven path
(`corpus_walker`) and the new GT-driven path (`gt_eval`) run in
sequence; both contribute to the unified metrics output.

## 8. Module boundaries

- `gt_eval/datasets/lvis.py` — download a sliced LVIS-OV rare-class
  subset filtered to indoor/household supercategories, cache to
  `eval/datasets/lvis-ov/`, expose as an iterator of
  `(image_path, list[GtBox])`.
- `gt_eval/datasets/protocol.py` — `EvalDataset` Protocol (iter of
  `(image_path, list[GtBox])`); LVIS impl is the v1 concrete class.
- `gt_eval/matchers/label.py` — `match_labels(predicted: str,
  gt_category: str, threshold: float) -> bool` using
  `LabelEncoder` (the existing sentence-transformers wrapper).
- `gt_eval/matchers/iou.py` — `match_boxes(predicted_xyxy, gt_xyxy,
  threshold: float)` Hungarian-assignment IoU matcher.
- `gt_eval/metrics/coco.py` — wraps `pycocotools` to produce mAP
  numbers in COCO format from our `SceneObservation` outputs.
- `gt_eval/metrics/labels.py` — label F1 + box-aware F1 calculators.
- `gt_eval/metrics/hallucination.py` — count detections with zero
  GT-overlap; optionally call the local-VLM judge to triage and
  produce `hallucination_rate` + a "candidate-novel" list.
- `gt_eval/judges/protocol.py` — `ReferenceModelJudge` Protocol
  (`async def verify(image_crop: bytes, label: str) -> Literal["yes",
  "no", "unsure"]`).
- `gt_eval/judges/qwen_local.py` — Ollama-backed local impl using the
  existing `OllamaClient`.
- `gt_eval/baseline.py` — read/write `eval/baseline.json`; diff
  current vs baseline; absolute-floor enforcement.
- `gt_eval/run.py` — top-level orchestration called from
  `run_eval.py`.

## 9. Test strategy (TDD shape)

Each module gets a unit test file under
`pipeline-service/tests/unit/eval/`:
- `test_lvis_loader.py` — fixture-based; injects a fake HTTP/zipfile
  source, verifies filtering and caching.
- `test_label_matcher.py` — feeds known cosine-similarity pairs
  (mock encoder) to verify match/no-match semantics.
- `test_iou_matcher.py` — synthetic xyxy pairs at IoU 0.0, 0.4, 0.5,
  0.6, 1.0; verifies Hungarian assignment.
- `test_coco_metrics.py` — golden inputs (3 images, hand-built GT
  + predictions), verifies pycocotools wraps to expected mAP values.
- `test_label_metrics.py` — F1 calculations on hand-built confusion
  cases.
- `test_hallucination.py` — synthetic detection lists; mock VLM judge
  returning yes/no/unsure; verifies triage classification.
- `test_qwen_local_judge.py` — mocked OllamaClient; verifies prompt
  shape, retry behaviour, parse failure handling.
- `test_baseline.py` — round-trip read/write, diff output,
  absolute-floor enforcement, auto-commit gating.
- `tests/integration/test_gt_eval_e2e.py` — end-to-end on a 5-image
  fixture corpus (committed under `tests/replay/fixtures/eval/`),
  full run from `run_eval.run_eval` returning the new schema.

## 10. CI / runtime parameters

- Default `EVAL_SAMPLE_SIZE=500`. Override via env.
- Runtime budget for `make test-eval` ≤ 60 min on the dev Mac
  (target: 30–45 min on warm caches).
- The harness is invoked from a single command:
  `cd pipeline-service && uv run python -m pipeline_service.eval.run_eval`
  (existing entry point), with the new code path triggered by a flag
  / env var (`EVAL_RUN_GT=true`, default true once shipped).
- LVIS-OV download is one-time (~1–2 GB cached); first run takes
  longer.

## 11. Risk register

| Risk | Mitigation |
| --- | --- |
| LVIS download rate-limit / link rot | Document the download URL; supply a `--from-local-zip` flag accepting a pre-downloaded archive. |
| Embedding-similarity label match has false positives ("table" matches "coffee table" too eagerly) | Per-class threshold override in config; calibration on a held-out 50-image set before merging. |
| Auto-commit baseline drifts down silently | Absolute floors in `thresholds.json`; baseline write blocked below floor. |
| Qwen-VL judge inflates runtime past 60 min | Hard top-K cap on detections sent to judge; opt-out env var; default to "judge only no-GT-overlap detections" so cost is bounded by hallucination rate, not detection count. |
| LVIS GT taxonomy diverges from app's open-vocab labels | Match via embedding cosine, threshold 0.6 default; tune in calibration. |
| Existing tests start failing because run-config changes | New code is additive; existing `corpus_walker` + agreement metrics are not modified; CI surfaces any regression in the existing test suite. |
| `pycocotools` build fails on Apple Silicon | Pin a known-working wheel; document fallback to `torchmetrics` COCO backend. |

## 12. Open questions deferred to v2

- Should the harness publish to a Grafana dashboard? (Existing
  dashboards in `/observability/grafana/` could consume `last-metrics.json`.)
- Cloud VLM judge cost-cap design.
- Multi-source dataset blending (LVIS + OpenImages + custom hand-annotated).
- Per-PR GitHub Actions hookup.
- Active-learning loop / failure-case mining UI.
