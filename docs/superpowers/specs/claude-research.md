# Research — Automated Detection Evaluation

This file combines codebase reconnaissance and external best-practice
research conducted before drafting the implementation plan.

---

## Part 1 — Codebase Reconnaissance

### 1.1 Existing Eval Rig (Already Lives in the Repo)

**Entry points**
- CLI shim: `pipeline-service/eval/run_eval.py`
- Real impl: `pipeline-service/pipeline_service/eval/run_eval.py` (~219 lines)
- Makefile target: `make eval-pipeline` → `cd pipeline-service && uv run python -m pipeline_service.eval.run_eval`
- CI gate: `make eval-ci` (gated against `eval/baseline.json`)

**What it computes today** (`pipeline_service/eval/metrics.py`, ~131 lines):

| Metric | Definition |
| --- | --- |
| `agreement_coverage_avg` | mean `SceneObservation.agreementCoverage` |
| `agreement_precision_avg` | mean `SceneObservation.agreementPrecision` |
| `self_diagnosis_trigger_rate` | fraction of runs where `selfDiagnosisTriggered=true` |
| `op_failure_rate` | fraction of runs where `errors[]` is non-empty |
| `single_source_run_rate` | fraction flagged `single_source_run` |
| `empty_detection_set_rate` | fraction flagged `empty_detection_set` |
| `multi_frame_stability` | pairwise Jaccard of crop-embedding clusters across captures of the same scene |

**All metrics are agreement-driven** — derived from inter-detector consensus
or frame-to-frame consistency. **There is currently NO ground-truth-based
evaluation, no IoU-matched precision/recall, no per-class AP, and no
cross-model corroboration with reference VLMs.** That is the gap this
plan must fill.

**Input format** (`pipeline_service/eval/corpus_walker.py`):
```
eval/corpora/
  scene_<id>_<descr>/
    capture-<N>/
      frame-0.webp
      frame-1.webp
      frame-2.webp
```
- 6 scenes × 1 capture × 3 frames currently committed.
- `multi_frame_stability` requires ≥2 captures per scene → today it always
  reports 0 for that metric.
- Each frame becomes a payload dict `{frame_id, sha256, mime_type, photo_bytes}`.
- Frame IDs are `{scene_id}/{capture_id}/{stem}`.

**Default pipeline runner** uses `pipeline_job.execute_in_process()` from
`dagster_defs` with frames hex-encoded into run-config. Tests can inject a
`pipeline_runner` callable to bypass Dagster + HTTP backends.

**Output**: `pipeline-service/eval/last-metrics.json`:
```jsonc
{
  "metrics": { "agreement_coverage_avg": 0.85, "n_observations": 6, ... },
  "thresholds": { "gating": {...}, "warn": {...} },
  "violations": ["..."],   // only gating bucket
  "warnings":   ["..."],   // only warn bucket
  "corpus_empty": false,
  "gating": true,
  "ok": true
}
```
- Two threshold buckets in `eval/thresholds.json`: **gating** (CI fail) and
  **warn** (logged only).
- Reports are timestamped under `eval/report-*.json`; current baseline is
  `eval/baseline.json`.

### 1.2 Detection Output Schema (the SUT)

`pipeline-service/pipeline_service/types.py`:

- `SceneObservation` — top-level result returned by the pipeline:
  `sceneId, runId, frameIds, detections[], agreementCoverage,
   agreementPrecision, selfDiagnosisTriggered, rerunDepth, flagged,
   flagReason, processingMs, errors[], tileErrors[]`.
- `PipelineDetection` — per-detection record:
  `id, bbox, maskRleB64?, cropEmbeddingB64?, primaryLabel, alternateLabels[],
   vlmStructuredAttributes (Qwen-VL JSON: type/name/category/color/material/
   condition/estimated_value/description/search_tags), agreementScore,
   contributingSignals[], confidence`.
- `BBox` — **xywh in pixel coordinates, top-left origin**. NOT normalized.
- `ContributingSignal` — `detector ∈ {florence, gdino, gdino-sahi}, frameId,
  rawConfidence?`.

The eval harness must convert this to a COCO-style record (xyxy in pixels +
category id) for any external metric library.

### 1.3 API Surface for Eval

**`POST /v1/detect`** (`api-service/src/routes/detect.route.ts`):
- Multipart, 1–3 frames, ≤10 MB each, `image/jpeg|png|webp`.
- Idempotency key = `sha256(concat(per-frame sha256 bytes))`.
- 200 returns full `SceneObservation`; 202 returns `{runId, statusUrl}`;
  503 for `pipeline_unavailable` / `queue_full`.
- The api-service has `HTTP_RESPONSE_TIMEOUT_MS=115000` (recently bumped).
- The eval harness can either call this HTTP endpoint, or call
  `pipeline_service.api.server` directly via in-process Dagster.

**Pipeline sidecar** (`pipeline_service/api/server.py`):
- `POST /runs` (idempotent), `GET /runs/:id`, `GET /runs/:id/wait` (long-poll),
  `GET /runs/:id/timeline` (per-op timing), `GET /health`.
- Single-process Dagster with `asyncio.Semaphore(max_queue_depth)`.

### 1.4 Test Infrastructure

| Service | Test runner | Layout |
| --- | --- | --- |
| pipeline-service | pytest (`asyncio_mode=auto`) | `tests/{unit,integration,replay}/` — 39 files |
| detection-service | pytest | `tests/unit/` — small, mostly route tests |
| api-service | Vitest | `src/__tests__/{unit,integration}/` |

- Replay convention: JSON fixtures under
  `pipeline-service/tests/replay/fixtures/<op>/<name>.json`.
- Conftest provides `tmp_dagster_home`, `tmp_photo_dir`, `isolated_env`,
  `tiny_jpeg_bytes`, etc.
- CI workflows in `.github/workflows/`: `ci.yml` (all three),
  `test-api.yml`, `e2e-regression-tests.yml`.
- Existing test corpus on disk:
  `test_images/{hallway,bedroom,office,bathroom,dining_room,living_room,kitchen,utility_room}/`
  — 6 JPEGs each, 48 total, plus 2 standalone interior images.
- Existing eval corpora: 6 scenes × 3 WebP frames under
  `pipeline-service/eval/corpora/`.

### 1.5 External-Model Integrations Already Wired

- Florence-2 + Grounding-DINO: hosted in **detection-service**,
  consumed via HTTP from pipeline-service
  (`pipeline_service/models/{florence_client,grounding_dino,grounding_dino_http}.py`).
- Qwen-VL / Moondream: **Ollama** at `http://127.0.0.1:11434`
  (`pipeline_service/models/ollama_client.py`); per-call
  `keep_alive` is supported; tier order is currently
  `qwen2.5vl:3b → qwen2.5vl:7b → moondream`.
- Label encoder: **`sentence-transformers/all-MiniLM-L6-v2`** as the
  production backend (`pipeline_service/models/label_encoder.py`),
  lazy-loaded; `_deterministic_fake_encode` reserved for tests; hardcoded
  synonym/canonical lists were removed.
- **No proprietary LLM SDKs are currently a dependency** in either
  pipeline-service or api-service. Adding `openai`, `anthropic`, or
  `google-generativeai` would be a new dependency.

### 1.6 Configuration / Secrets Pattern

- `~/.allmythings.env` (KEY=VALUE) is loaded by `pipeline_service/config.py`,
  with process env vars overriding.
- No vault integration; secrets are environment variables.
- Cloud features are opt-in via env vars (e.g. `OLLAMA_BASE_URL`,
  `LABEL_ENCODER_MODEL`). The new eval cloud-VLM adapters should follow
  the same pattern: only call out if the relevant `*_API_KEY` env is set.

### 1.7 Recently Landed (Post-Deep-Plan-of-Last-Week)

- `_dedupe_by_type` in `classification_refine.py` (IoU≥0.5 OR containment
  ≥0.7) collapses same-type overlapping boxes after Qwen-VL.
- `vlm_prompt_expansion.py` no longer has the `_FALLBACK_HOUSEHOLD_PROMPTS`
  hardcoded list; degraded runs return empty prompts honestly.
- `OllamaClient.generate(format="json")` defaults to `temperature=0.0`
  for deterministic structured output; free-text defaults to 0.2.
- iOS `MacServerDiscovery.swift` returns the resolved IPv4 directly
  (no second-stage hostname lookup); api-service-side auto-retry on
  ECONNREFUSED via `AppConfig.refresh()`.

---

## Part 2 — Detection Eval Best Practices (External Research)

Sources cited inline; full URL list at the bottom of this section.

### 2.1 Object-Detection Evaluation Metrics

- **Primary metric: COCO `mAP@[.50:.05:.95]`** is the de-facto industry
  standard ([Label Your Data — 2026 Object Detection Metrics];
  [PyImageSearch COCO Evaluator]). It rewards precise localisation;
  Pascal VOC's single 0.5 IoU is no longer sufficient.
- **For long-tail vocabularies, use LVIS AP** with rare/common/frequent
  splits ([LVIS Dataset]; [arXiv 1908.03195]). Open-vocab papers report
  AP separately on **base vs novel** classes — that's the true
  generalisation signal ([Open-Vocabulary OD via Prompt Learning]).
- **Box-aware F1 vs label F1** — both useful and they often diverge
  ([Roboflow Supervision F1]; [Roboflow Object Detection Metrics]).
  Box-aware = IoU≥0.5 + correct class. Label F1 ignores localisation.
  We should report both — Florence-2 caption accuracy is a label-only
  question; Grounding-DINO localisation quality is a box-aware question.
- **Hallucination rate via cross-model spatial corroboration**
  ([Survey of Multimodal Hallucination Eval]; [Hallo3D]).
  Define `hallucination_rate = |detections with 0 corroborating models|
  / |total detections|`. Cross-model verification cuts hallucinations
  ~25 % in multi-agent systems.

**Tooling stack we'll use**:
- `pycocotools` — COCO eval engine (mAP, AP@IoU, AR).
- `torchmetrics.detection.MeanAveragePrecision` — Pytorch-friendly
  COCO backend wrapper.
- `supervision` (Roboflow) — high-level metric helpers and
  format conversions.
- `sahi.utils.coco` — COCO-format utilities; relevant since we already
  use SAHI in the pipeline.

### 2.2 Datasets

| Dataset | Categories | License | Why pick / not pick |
| --- | --- | --- | --- |
| **LVIS-OV** | 1,203 (base + rare) | CC-BY 4.0 | **Primary** open-vocab benchmark. Rare-class split tests novel-class generalisation — the right benchmark for our open-vocab pipeline. |
| **OpenImages V7** | 600+ | CC-BY 4.0 / CC-BY-SA | **Real-world cross-domain validation.** Furniture/household subsets large enough to sample 500–1k images cheaply. |
| **Hypersim** | ~100 indoor | CC-BY-NC 4.0 | **Synthetic, noise-free baseline.** Non-commercial license (fine for our internal eval). 3D bboxes available. |
| **COCO 2017** | 80 (~15 household) | CC-BY 4.0 | Limited indoor coverage; useful only as tooling-maturity baseline. |
| **ADE20K** | 3,000+ scenes | CC-BY-NC | Pixel masks only, not bboxes — **not directly usable** for our box-level eval. |
| **Roboflow Universe** | varies | varies | Community indoor datasets, license-transparent, useful for ad-hoc real-world test sets. |

**Recommended subset for v1**:
- LVIS-OV rare-class split as the primary novel-class benchmark.
- 500–1 000 OpenImages household-subset images for real-world validation.
- Hypersim 5–10 % subset for synthetic regression.
- The existing `eval/corpora/` 6 scenes (custom-annotated) for
  product-relevant scenes.
- Optional: 1–2 curated Roboflow Universe indoor datasets.

### 2.3 VLM-as-Judge for Detection Corroboration

- **Pattern**: send the **cropped region** to the VLM with a binary
  prompt (`"Is this region a {label}? Answer yes/no/unsure."`). VLMs
  rank well but score poorly — stick to binary classification, not
  graded confidence ([VLM Judges Can Rank but Cannot Score];
  [Prometheus-Vision]).
- **RoI expansion**: enlarge the crop by 1.5–2× before sending; this
  improves VLM accuracy 6–17 AP points ([CVPR'25 — Can VLMs Correct
  Semantic Grounding Errors]).
- **Cost** (per Roboflow's April-2026 measurement,
  4032×3024 phone photo):

  | Model | Tokens / photo | $ / 1 000 photos |
  | --- | --- | --- |
  | GPT-4o-mini (verification only) | ~2 500 | ~$3 |
  | GPT-5.5 (full vision) | 2 451 | ~$12 |
  | Claude 3.5 Sonnet | 6 636 | ~$33 |
  | Gemini 2.0 Pro | 6 192 | ~$31 |

  Crops are far smaller than full photos, so realistic cost
  per crop is roughly an order of magnitude lower.
- **Cost reductions**: prompt caching (50–90 % savings on identical
  verification prompts), batch APIs, and falling back to local
  Qwen2.5-VL for crop verification (zero API cost; ~70 % MMMU-Pro vs
  Anthropic's ~60 % — small accuracy gap, big cost gap).

**Recommendation for the harness**:
- **Local VLM judge** by default (Qwen-VL via Ollama, no API cost).
- **Cloud VLM judges** are opt-in adapters behind env-var-gated API
  keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`);
  configurable hard $-cap per run.
- Return tristate `{yes, no, unsure}` per crop, not a confidence score.
- Promote a detection to "Tier 1 corroborated" only when ≥2 of {our
  pipeline detectors} AND ≥1 VLM judge say yes.

### 2.4 Open-Vocabulary Detection Benchmarks

- **Primary benchmark**: LVIS-OV (`base + rare` split). Top open-vocab
  models report ~37–40 AP50 ([Scaling Open-Vocabulary Object Detection];
  [Grounding-DINO paper]). Grounding-DINO Tiny (which we use)
  zero-shot scores ~39 AP on LVIS-OV.
- **Cross-domain**: ODinW (Object Detection in the Wild) — 13–35
  diverse datasets; SOTA hovers around 30 AP. Performance is typically
  20–30 % below COCO, so it's the realistic "real world" number.
- **Comprehensive eval**: OVDEval — 9 sub-tasks including
  attribute / spatial / commonsense reasoning; relevant to the
  Florence-caption→Grounding-DINO chain.
- **Per-class reporting** is mandatory for open-vocab. Always report
  AP separately for **base classes** (seen in pretraining) and
  **novel classes** (unseen). Hide that distinction and you can't tell
  whether the model is generalising or memorising.

### 2.5 Tooling Recommendations Distilled

```python
# Detection metrics
from torchmetrics.detection import MeanAveragePrecision
from pycocotools.coco import COCO
from pycocotools.cocoeval import COCOeval

# Format conversion + sugar
import supervision as sv
from supervision.metrics import F1, MeanAveragePrecision as SupMAP

# SAHI helpers (already a transitive dep via the pipeline)
from sahi.utils.coco import Coco
```

---

## Part 3 — Sources

**Codebase paths cited above** are all in
`/Users/mrarindampaul/Develop/allmythings/`.

**External sources (URLs cited inline above):**
- Object Detection: Key Metrics for Computer Vision Performance in 2026 — labelyourdata.com/articles/object-detection-metrics
- Mean Average Precision (mAP) Using the COCO Evaluator — pyimagesearch.com/2022/05/02/mean-average-precision-map-using-the-coco-evaluator/
- LVIS Dataset — lvisdataset.org
- LVIS arXiv 1908.03195 — arxiv.org/abs/1908.03195
- Open-Vocabulary OD via Prompt Learning — link.springer.com/article/10.1007/s00530-025-02112-w
- Roboflow Supervision F1 — supervision.roboflow.com/develop/metrics/f1_score/
- Roboflow Object Detection Metrics — blog.roboflow.com/object-detection-metrics/
- Survey of Multimodal Hallucination Evaluation — arxiv.org/html/2507.19024v2
- Hallo3D — openreview.net/forum?id=pqi4vqBYXW
- ADE20K Dataset Ninja — datasetninja.com/ade20k
- CSAIL ADE20K GitHub — github.com/CSAILVision/ADE20K
- The Most Popular Datasets for CV in 2026 — cvat.ai/resources/blog/popular-computer-vision-datasets
- Hypersim — machinelearning.apple.com/research/hypersim
- InternScenes — github.com/InternRobotics/InternScenes
- Roboflow Universe — universe.roboflow.com
- NVIDIA VLM Prompt Engineering — developer.nvidia.com/blog/vision-language-model-prompt-engineering-guide-for-image-and-video-understanding/
- CVPR'25 — Can VLMs Correct Semantic Grounding Errors —
  openaccess.thecvf.com/content/CVPR2025/papers/Liao_Can_Large_Vision-Language_Models_Correct_Semantic_Grounding_Errors_By_Themselves_CVPR2025_paper.pdf
- Prometheus-Vision — arxiv.org/html/2401.06591v1
- LLM as a Judge 2026 Guide — labelyourdata.com/articles/llm-as-a-judge
- VLM Judges Can Rank but Cannot Score — arxiv.org/html/2604.25235
- Vision Model Token Cost — blog.roboflow.com/image-token-cost-vlm/
- BentoML Multimodal AI — bentoml.com/blog/multimodal-ai-a-guide-to-open-source-vision-language-models
- Anthropic API docs — docs.anthropic.com
- CodeSOTA — codesota.com
- HyperAI Open Vocabulary OD SOTA — hyper.ai/en/sota/tasks/open-vocabulary-object-detection
- Scaling Open-Vocabulary OD — arxiv.org/html/2306.09683v3
- Grounding DINO paper — arxiv.org/pdf/2303.05499
- Robustness of Open-Vocab Detectors — arxiv.org/html/2405.14874v3
- How to Evaluate Generalization of Detection (ODinW) — arxiv.org/html/2308.13177v2
- Bridging Object/Image Representations for Open-Vocab — hanoonar.github.io/object-centric-ovd/
- YOLO-World paper — arxiv.org/html/2401.17270v3

---

## Part 4 — Synthesis: What This Means for the Plan

1. **Build the new eval ON TOP of the existing `pipeline-service/pipeline_service/eval/`**, don't replace it. Add new modules: a ground-truth loader, IoU-matched metric calculator, reference-model adapter interface, hallucination-rate calculator. Keep the existing agreement metrics — they're orthogonal and useful.

2. **Curate a multi-source corpus**. Required:
   - LVIS-OV rare-class subset (the open-vocab benchmark gold standard).
   - 500-image OpenImages household subset.
   - Custom hand-annotated GT for the 6 existing `eval/corpora/` scenes
     (so product-relevant scenes are graded).
   - Optionally Hypersim 5 %.
   Each corpus exposes a uniform interface: image path + COCO-format GT.

3. **Reference-model adapters**: a `ReferenceModel` Protocol with a
   default local Qwen-VL judge implementation, plus optional cloud
   adapters (OpenAI, Anthropic, Gemini) gated on env vars and a per-run
   $-cap. Each returns `{box, label, score, judge_confidence}` per image.

4. **Metric pipeline**:
   - GT-based: COCO mAP@.5:.95, AP per base/novel split, label F1,
     box-aware F1.
   - Cross-model: corroboration rate (per detection, count how many
     reference models confirmed it spatially), hallucination rate
     (no-corroboration share).
   - Existing agreement metrics carry forward.

5. **Output schema**: extend `last-metrics.json` with a top-level
   `gt_metrics` and `corroboration_metrics` block. Keep existing
   `metrics`/`thresholds`/`violations`/`warnings` as-is so the CI gate
   keeps working without surprise.

6. **Threshold gates**: add new thresholds (`map_50_95_min`,
   `hallucination_rate_max`, `label_f1_min`) to `eval/thresholds.json`
   under `gating` and `warn` buckets, mirroring the existing structure.

7. **CI**: add a `make test-eval` Makefile target plus a GitHub Actions
   nightly job (`.github/workflows/eval-nightly.yml`). The cloud-VLM
   adapters are gated by repository-secret env vars; nightly defaults
   to the local-VLM-only path so PRs don't burn API budget.

8. **No hardcoded item lists** — corpora are external data files;
   the reference-model prompts are scene-aware (Florence captions feed
   them); GT category lists come from LVIS / OpenImages / annotated
   JSON files. Continues the constraint from the previous deep-plan.

9. **Test infrastructure** — unit tests under
   `pipeline-service/tests/unit/eval/` for the metric calculators and
   adapters, replay fixtures under `tests/replay/fixtures/eval/` for
   deterministic recreation, integration tests under
   `tests/integration/test_eval_e2e.py` exercising the full harness on
   a 5-image fixture corpus. Mock cloud reference models in unit tests;
   skip them at runtime when env vars are absent.
