# Research — Detection Pipeline Structural Rewrite

Date: 2026-04-29
Spec: [2026-04-29-detection-pipeline-structural-rewrite.md](2026-04-29-detection-pipeline-structural-rewrite.md)
Sources: parallel Explore subagent (codebase) + search-specialist subagent (external).

This document is the complete research input for `claude-plan.md`. It is split
into two halves: (A) what is actually in the repo today, and (B) what the
state of the art looks like as of 2026 for each layer the rewrite must
address. The two halves are deliberately phrased so they can be cross-cut
during planning — every "gap" in (A) should map to a concrete option in (B).

---

# Part A — Codebase: Current State Map

> Source of truth: explored 2026-04-29. The CLAUDE.md mention of
> "Google Vision + AWS Rekognition + Mock" is **out of date** — those
> adapters have been removed. The live pipeline is Florence-2 + Qwen
> (via Ollama), orchestrated through Temporal. **The rewrite plan must
> work from this real state, not the CLAUDE.md description.**

## A1. HTTP routes and async contract

`api-service/src/routes/detect.route.ts`

- `POST /v1/detect` (auth-required, multipart, ≤10 MB, jpeg/png/webp).
- Idempotency: SHA-256 of the image is the Temporal `workflowId`;
  `WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY`.
- Sync window: returns **200 + `DetectResult`** if the workflow finishes
  within `httpResponseTimeoutMs` (default 90 s).
- Async window: returns **202 + `{ status:'accepted', workflowId,
  statusUrl }`** otherwise.
- `traceparent` extracted; otherwise random UUID.

`api-service/src/routes/detect-status.route.ts`

- `GET /v1/detect/status/:workflowId` → 200/202/500/404 mapped to
  `completed | running | failed/terminated/cancelled/timed_out |
  workflow_not_found`.

`api-service/src/routes/metrics.route.ts` — Prometheus `/metrics`.
`api-service/src/routes/health.route.ts` — provider health summary.
`api-service/src/routes/photos.route.ts` — static-serves saved photos.

## A2. Temporal workflow + activities (the actual orchestrator)

`api-service/src/temporal/workflows/detect-inventory.workflow.ts`
— `detectInventoryWorkflow(input: DetectInput): Promise<DetectResult>`.

Hardcoded tier chain inside the workflow:

```ts
const TIER_CHAIN = [
  { name: 'qwen7b',       model: 'qwen2.5vl:7b', timeoutSec: 20, retries: 1 },
  { name: 'qwen3b',       model: 'qwen2.5vl:3b', timeoutSec: 12, retries: 1 },
  { name: 'moondream',    model: 'moondream',     timeoutSec: 8,  retries: 0 },
  { name: 'florence-only', model: null,           timeoutSec: 5,  retries: 0 },
];
const ENRICHMENT_BUDGET_MS = 45_000;
```

Workflow steps:

1. `savePhoto(input)` — write the original to
   `~/allmythings-data/photos/{uuid}.jpg`, generate a 400-px thumbnail.
   Failure here aborts the workflow. Throws `UnsupportedMediaType` for
   non-{jpeg,png,webp} mime.
2. `florenceDetect(input)` — POST multipart to
   `${florenceUrl}/detect/florence`, returns
   `{ regions: [{ caption, x,y,w,h }], image_width, image_height }`.
   Heartbeats every 5 s. Retry policy: 3 attempts, 1 s initial, 3× backoff.
   Non-retryable: `UnsupportedMediaType`, `FlorenceBadRequestError`.
   On final failure → workflow returns empty items + recorded error
   (it does NOT abort).
3. `enrichItemsWithTierChain(...)` — for each Florence region, walk the
   tier chain until one succeeds; remaining-budget enforced; the final
   `florence-only` tier returns the caption itself with confidence 0.5.
4. `assembleResult(...)` → `DetectResult`.

Activities live under `api-service/src/temporal/activities/`:
`save-photo.activity.ts`, `florence-detect.activity.ts`,
`enrich-item.activity.ts`, `assemble-result.activity.ts`.
Non-retryable error types in `enrich-item`:
`InvalidTierConfig | OllamaJsonParseError | OllamaBadRequestError` →
the chain falls forward to the next tier rather than retrying in place.

The Ollama prompt (verbatim, from `enrich-item.activity.ts`):

> "You are an expert appraiser identifying a single household item in a
> photo. Return ONLY a single JSON object with these fields (no markdown,
> no prose): { name, category, color, material, condition,
> estimated_value, description, search_tags }. The item in question is
> labeled by a vision detector as: \"{CAPTION}\""

Ollama call: `POST {ollamaBaseUrl}/api/generate`, model varies by tier,
`stream:false`, `num_ctx:4096`, `temperature:0.2`, `images:[base64]`.

## A3. Shared types

`api-service/src/temporal/shared-types.ts`:

```ts
DetectInput     { imageBase64, imageSha256, mimeType, traceId, requestId }
SavedPhoto      { photoId, photoPath, thumbnailPath, bytes }
FlorenceRegion  { caption, x, y, width, height, regionIndex }
EnrichedItem    {
  id, regionIndex, label, confidence,
  bbox: { x,y,width,height },
  enrichmentTier: 'qwen7b'|'qwen3b'|'moondream'|'florence-only',
  attributes: { name, category, color, material, condition,
                estimatedValue, description, searchTags }
}
DetectResult    { photoId, photoUrl, itemCount, items, errors,
                  traceId, processingMs }
PipelineError   { step, code, message, retryable }
```

There is **no `Detection` / `Box` / `Mask` / `Embedding` type** in shared
types. There is **no taxonomy/ontology type** of any kind.

## A4. Schemas (Zod)

`api-service/src/schemas/detection.schema.ts` defines a separate, **legacy**
shape (`BoundingBoxSchema`, `ClassifiedObjectSchema`,
`DetectionResponseSchema`) which does **not** match what the workflow
actually returns. This is dead code from the pre-Temporal era and is one
of the keep/replace/delete decisions.

## A5. Legacy providers (still on disk, not on the path)

`api-service/src/providers/florence.detector.ts` — implements an
`ObjectDetector` interface, calls Florence over HTTP. **The workflow
does NOT call this**; it calls `florenceDetectActivity` directly.
`api-service/src/providers/ollama.classifier.ts` — implements
`ObjectClassifier`. Same story; not wired.

These two files (and their interfaces in `api-service/src/providers/`) are
candidates for **delete** in the rewrite, since they double the surface
area without being invoked.

## A6. Utilities that exist but are not wired

| File | Status |
| --- | --- |
| `api-service/src/utils/circuit-breaker.ts` | Implements CLOSED/HALF_OPEN/OPEN. **Not wired into any route or activity.** |
| `api-service/src/services/image-quality.service.ts` | Returns `QualityMetrics` with `recommendedAction`. **Never called in the request path.** |
| `api-service/src/services/provider-health.service.ts` | Periodic Florence/Ollama/Temporal probes; logs only, doesn't gate routing. |

These three are dead-but-useful — they encode logic the rewrite needs but
don't apply it. Decision per item: **wire or delete.**

## A7. Configuration

`api-service/src/config/env.config.ts` exposes (excerpt):

```
FLORENCE_URL=http://localhost:14001
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5vl:7b      OLLAMA_ENABLED=true
DETECTION_TIMEOUT_MS=30000     CLASSIFICATION_TIMEOUT_MS=300000
TEMPORAL_HOST=localhost:7233   TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=inventory-pipeline (declared, hardcoded in route)
WORKFLOW_EXECUTION_TIMEOUT_MS=120000   HTTP_RESPONSE_TIMEOUT_MS=90000
ENRICHMENT_BUDGET_MS=45000
TIER_1_MODEL=qwen2.5vl:7b   TIER_2_MODEL=qwen2.5vl:3b   TIER_3_MODEL=moondream
```

`TIER_*_MODEL` env vars **are not read by the workflow** — the chain
constant in `detect-inventory.workflow.ts` is hardcoded. This is a real
defect: deploys cannot change the tier chain without a code change.

## A8. Persistence — server side

There is **no database on the API**. The workflow's
`DetectResult` lives only in Temporal's event history. Photos live on
disk under `~/allmythings-data/photos/`. There is **no embedding store**,
**no scene/room store**, **no inventory table**, **no query layer**.

If the rewrite wants cross-frame dedup, scene memory, or
human-in-the-loop verification, that storage layer has to be added
from scratch.

## A9. Persistence — mobile side (Drift, schema v4)

`mobile-app/lib/data/database/app_database.dart`

```
inventory_items
  id PK auto, photoPath, thumbnailPath,
  serverPhotoUrl?, detectionData (JSON),
  status ('pending'|'completed'|'failed'),
  createdAt, updatedAt
  CHECK paths/detectionData non-empty
  INDEX createdAt DESC

labels
  id PK, itemId FK, key, value, confidence (def 1.0), createdAt
  UNIQUE (itemId, key, value), CHECK len(value)<=100
  INDEX itemId, INDEX value

label_search_fts (FTS5)
  labelId FK, key, value
  triggers sync to labels on insert/update/delete
```

Migrations v1→v4 add FTS keys, `status`, `serverPhotoUrl`. There is **no
embeddings table**, **no scenes table**, **no taxonomy_nodes table**,
**no human-verification queue table** on the client either.

**Per the project rule "App not deployed, skip migrations and rewrite
schemas directly", any schema change in the rewrite is a direct rewrite,
not a migration plan.**

## A10. Mobile capture flow

`mobile-app/lib/presentation/camera/camera_capture_screen.dart`
- Live preview, single-tap capture; iOS/Android via `camera`, gallery via
  `image_picker`, macOS uses a fixture.
- **No blur/exposure/motion check** before upload.
- **No multi-frame burst.**
- Compression: gallery picker uses `imageQuality:90`; the camera path
  uploads the original.

`mobile-app/lib/application/providers/detection_providers.dart` —
`detectObjects(File)`:
1. CoreML on-device → `fastBoxes`. If non-empty, set state to
   `success(...isEnriching:true)` (optimistic UI).
2. Mac deep pass → `repository.detectObjects(imageFile)`; merge into
   state. If the network leg fails but `fastBoxes` is non-empty, fall
   back to CoreML-only with an "offline" indicator.

`mobile-app/lib/data/repositories/detection_repository.dart`:
- POST multipart `/v1/detect`.
- 200 → parse `DetectResult`.
- 202 → poll `/v1/detect/status/{workflowId}` every 2 s, ≤60 s.
- 429 / 503 → exponential backoff, up to 3 retries (1 s, 4 s, 9 s).

There is **no client-side dedup**. There is **no user-feedback / relabel
loop** wired through to the API. There is **no scene/room labelling**.

## A11. Tests that exist

API:
- Unit: providers (florence, ollama), image-quality, photo-storage,
  provider-health, telemetry, metrics, route handlers, all four
  Temporal activities, temporal client, temporal worker.
- Workflow: `detect-inventory.workflow.test.ts` (happy path + tier
  fallback in Temporal test env), `detect-inventory.replay.test.ts`
  (event-history replay for determinism),
  `record-happy-path.ts` helper.
- **Integration tests: none.**
- E2E (root): `e2e/api-vision-test.ts`, `e2e/app-e2e.ts`.

Mobile:
- `integration_test/app_test.dart`, `connectivity_test.dart`,
  `mock_detection_repository.dart`, `test_driver/integration_test.dart`.

Smoke / build:
- `build-and-test.sh`, `test-e2e.sh`, `scripts/smoke.sh` +
  `scripts/smoke-assertions.ts` (service health + warm-up + basic detection).

**There is no labelled-scene evaluation set anywhere in the repo. There
are no recall / precision / mAP / calibration metrics in CI. The
"prove accurate, reliable, resilient" claim from the spec is currently
unprovable.**

## A12. Observability stack

- `api-service/src/telemetry/otel-init.ts` — OTel SDK bootstrap, exports
  to a local LGTM (Tempo + Prometheus + Loki + Grafana) stack via
  docker-compose.
- `api-service/src/telemetry/metrics.ts` — `timed(name, labels, fn)`
  wraps activities with histograms. Emits `enrichmentTierUsedTotal`
  (per-tier counter) — **the closest thing to a quality signal in the
  current build.**
- `api-service/src/telemetry/trace-context.ts` — traceparent injection
  into outbound HTTP.
- `make start` brings up the LGTM stack alongside the services.

## A13. Prior plans — what landed, what didn't

| Plan | Landed | Visible signal |
| --- | --- | --- |
| 2026-03-12 full-rewrite | Mostly yes | Temporal workflow + activities, Bonjour, schema v4 |
| 2026-04-08 scaffolding fast pass | Partial | Python `detection-service/` skeleton |
| 2026-04-10 hybrid multipass | **No** | No SAHI tiling, no OWLv2 in code |
| 2026-04-13 accuracy-first three-tier | Partial | CoreML mobile path, Bonjour, tier chain in workflow, image-quality service exists but unused |
| 2026-04-14 observability + eval + hybrid | Partial | OTel/LGTM landed; **no eval harness, no OWLv2** |
| 2026-04-16 working vertical slice | Yes | Florence + Qwen tiers, photo persistence, `make start`, Drift inventory |
| 2026-04-21 production-grade Temporal | Mostly yes | Temporal workflows, client/worker, observability, health service. **Legacy providers not yet deleted.** |
| 2026-04-29 (this spec) | n/a | Not yet executed |

## A14. Concrete keep / replace / delete bias coming out of A1–A13

(These are *biases* feeding the plan, not decisions — the plan section
will commit.)

- **KEEP** Temporal as orchestrator; the workflow + activities + replay
  test scaffolding are real assets.
- **KEEP** photo save/serve, mobile retry/poll loop, OTel/LGTM stack,
  Drift inventory shell.
- **REPLACE** the workflow's hardcoded tier-chain with a config- or DB-
  driven pipeline definition; the goal is multi-pass / multi-model,
  not multi-tier-of-the-same-thing.
- **REPLACE** Florence-only detection with an ensemble whose **first**
  pass is open-vocabulary and whose **second** pass is promptable
  segmentation, optionally with SAHI tiling for small-object recall.
- **REPLACE** the `EnrichedItem` flat shape with a richer
  `Detection / Item / SceneObservation` model that records per-detector
  provenance, embeddings, and a calibrated confidence field.
- **REPLACE** the legacy `BoundingBoxSchema/ClassifiedObjectSchema/
  DetectionResponseSchema` (dead code from pre-Temporal era).
- **REPLACE** the static `confidence:0.9 default` and `0.5 fallback`
  with a real calibration step.
- **REPLACE** the unused `image-quality.service.ts` with a real,
  *applied* gate at the route or in the workflow.
- **DELETE** the legacy provider interfaces in
  `api-service/src/providers/` (`ObjectDetector`, `ObjectClassifier`,
  `florence.detector.ts`, `ollama.classifier.ts`) once the workflow
  doesn't depend on their types.
- **ADD** server-side persistence (detections + embeddings + ground
  truth + verification queue), an evaluation harness, an ontology table.

---

# Part B — External best practices (2026)

> Source: search-specialist subagent. Citations in each section.
> Synthesis biased toward what fits a Node/Fastify + Temporal + Flutter
> stack on a single GPU host (A10G/L4 class).

## B1. Detection: open-vocabulary + promptable segmentation

Goal: high recall on arbitrary household objects across scales,
occlusion, clutter.

**Pattern:** two-stage cascade — coarse open-vocab pass on 640–768 px,
then promptable segmentation on confirmed ROIs, with SAHI tiling on
low-recall regions.

| Model | Strengths | Weaknesses | License | Latency on A10G |
| --- | --- | --- | --- | --- |
| Grounding DINO 1.5 Edge (TensorRT) | Natural-language prompts, strong on occlusion, 36.2 AP LVIS, ~75 FPS | Slower than YOLO-World; prompt engineering needed for fine-grained classes | Apache 2.0 | 50–70 ms |
| YOLO-World | Real-time, ~52 FPS V100 | AGPL-3.0 (commercial-deployment risk); recall gaps <20 px objects | AGPL 3.0 | 40–60 ms |
| OWLv2 | Best long-tail / rare classes after self-training | Slower (~250–400 ms), large model | Apache 2.0 | 250–400 ms |

| Segmenter | Use when | Notes |
| --- | --- | --- |
| EfficientSAM-Ti | Default for chained det→seg | ~50 ms per crop, Apache 2.0, ~35 MB |
| FastSAM | Highest speed, lowest mask quality | AGPL-3.0 |
| SAM 2 | When mask quality matters more than latency | Apache 2.0; 400 MB+ |

**Multi-pass / small-object pattern:** SAHI (Slicing Aided Hyper
Inference) — 512×512 tiles with ~50 px overlap, applied selectively to
regions where the coarse pass returned low confidence or low coverage.
Recovers the "spoon, plug, key, charger" tail that single-pass detectors
drop.

**Recommendation for this project:** Grounding DINO 1.5 Edge as primary,
EfficientSAM-Ti chained on confirmed boxes, SAHI as a conditional
second pass for low-recall regions. OWLv2 as an optional long-tail
specialist invoked only when coverage on rare classes matters
(e.g., niche kitchen tools).

Citations:
- arXiv:2405.10300 (Grounding DINO 1.5)
- arXiv:2401.17270 (YOLO-World)
- arXiv:2306.09683 (OWLv2 / Scaling Open-Vocab)
- arXiv:2410.04960 (EfficientSAM survey)
- encord.com/blog/slicing-aided-hyper-inference-explained (SAHI)

## B2. Fusion, dedup, calibration

**Box fusion.** Prefer **Weighted Boxes Fusion (WBF)** over NMS / Soft-NMS
when ensembling two or more detectors. WBF preserves all detections
weighted by confidence and produces a fused box per cluster. Hyperparams
that work in practice: `iou_thr=0.5`, `skip_box_thr=0.0`. Library:
`ZFTurbo/Weighted-Boxes-Fusion` (MIT). Soft-NMS is the middle ground if
WBF over-clusters distinct objects in clutter.

**Cross-frame / cross-pass dedup.** Take crop embeddings with **DINOv2
ViT-L/14** (CC-BY-4.0; pose/lighting robust; ~50 ms per crop) and index
them in **FAISS** (IVFFlat for ≤100 k vectors, HNSW for very small
indexes; MIT). Cosine similarity ≥0.85 → "same physical object across
passes". Combine with class-label sanity check (don't merge a "couch"
crop with a "rug" crop even if pixels are similar).

A reasonable alternative is **SigLIP-2** for slightly cheaper embedding
(~35 ms) at the cost of geometric precision; useful when latency budget
is tight.

**Confidence calibration.** Two-pass approach:

1. **Per-detector temperature scaling**: fit a single scalar `T` per
   model on a held-out validation set; divide logits by T. Reduces ECE
   by 10–30 %.
2. **Post-fusion isotonic regression** on the WBF-fused confidences.
   Reduces ECE by another 20–40 %, especially correcting non-linear
   miscalibration.

Track Brier score and ECE; reliability diagrams should be in CI dashboards.

**Conflict resolution.** When detectors disagree on category (DINO says
"sofa", OWLv2 says "couch"), keep both labels with their confidences and
let either (a) the user via HITL or (b) a downstream LLM reconciler
decide. Don't silently drop one.

Citations:
- arXiv:1910.13302 (WBF)
- ICLR 2025 GETS (ensemble temperature scaling)
- DINOv2 model card (Meta)
- FAISS (faiss.ai)
- Jina AI 2025 vision-encoder survey (DINOv2 vs CLIP vs SigLIP)

## B3. Taxonomy + evaluation harness

**Ontology.** Build a hierarchical taxonomy:

```
Furniture / Seating / { Dining Chair, Office Chair, Armchair, Sofa, ... }
Furniture / Tables / { Coffee Table, Dining Table, Side Table, ... }
Kitchen Appliances / { Large, Countertop, Small Utensils, ... }
Lighting / Electronics / Storage / Textiles / ...
```

Base it on **Open Images V7** (~600 classes, ~150 directly relevant to
household; CC-BY-4.0 + commercial OK), augment with **HomeObjects-3K**
(2025; 12 base categories with fine-grained sub-types) and add
project-specific classes for niche items the literature won't cover
(humidifier, smart speaker, robot vacuum, etc.). Use **Visual Genome**'s
relationship vocabulary ("on", "in", "behind") if/when scene-graph
queries become useful.

The taxonomy must support both:
- **Coarse prompt mode** for the open-vocab detector
  (prompt list = leaf class names).
- **Hierarchical metric mode** for evaluation
  (mAP at coarse level, fine level, per-room).

**Datasets for held-out evaluation.**

| Dataset | Use | Size | License |
| --- | --- | --- | --- |
| SUN RGB-D | Indoor real-world generalisation | 10.3 k images | unrestricted research |
| Hypersim | Stress-test small / dense scenes (~127 obj/scene) | 77.4 k images | CC-BY-4.0 |
| LVIS | Long-tail / rare classes | 164 k | CC-BY-4.0 |
| Objects365 | OOD robustness | 630 k | CC-BY-4.0 |
| ScanNet | Cross-dataset robustness | huge | restricted (academic) |
| Custom user-home set | Primary regression | 200–300 images | own |

**Custom labelling protocol.**
- Tooling: **Label Studio (self-hosted)** or **CVAT**. Label Studio wins
  on hierarchical labels and active-learning hooks; CVAT wins on box-IoU
  agreement tracking.
- Two annotators per image; resolve via 3rd-annotator majority vote.
- Targets: median bbox IoU ≥0.75; Cohen's κ ≥0.80 coarse, ≥0.70 fine.
- Stratify: room type × clutter level × lighting; multi-angle of the
  same room to test cross-frame dedup.
- Effort: ~2–3 hours per 50-image room.

**Metrics (and CI gates).**

| Metric | Target | Gate |
| --- | --- | --- |
| mAP@0.5 (coarse) | ≥0.75 | block merge if below |
| Recall@conf=0.5 | ≥0.72 | block |
| Coverage (unique-instance recall after dedup) | ≥0.80 | block |
| ECE | ≤0.10 | warn |
| Brier | ≤0.15 | warn |
| Small-object recall (<50 px²) | ≥0.50 | warn |
| Per-room mAP (kitchen ≥0.78, bedroom ≥0.72, closet ≥0.65) | as listed | block |
| Dedup precision | ≥0.88 | block |

**Coverage** is the metric the spec specifically asks for and most
projects don't track: "of the unique physical objects in this scene,
what fraction did we end up with after fusion + dedup?" — it's
recall@scene-instance, not recall@detection. Worth defining explicitly.

Citations:
- storage.googleapis.com/openimages/web/factsfigures_v7.html
- docs.ultralytics.com/datasets/detect/homeobjects-3k/
- arXiv:2401.03470 (FurniScene)
- rgbd.cs.princeton.edu (SUN RGB-D)

## B4. Mobile capture quality + HITL UX

**Pre-upload gating** (Flutter, on-device):
- **Blur:** Laplacian variance via OpenCV; gate `< ~100`.
  Sharp household photos at 1 m on a recent iPhone sit ~200–400.
- **Exposure:** histogram check; flag if >5 % saturated white or >5 %
  saturated black.
- **Motion:** `sensors_plus` gyroscope; capture only when |ω| < 0.5 rad/s
  for 0.5 s. Show green/red indicator in viewfinder.
- **Multi-frame:** optional; capture 3 frames at ~100 ms apart, pick
  sharpest. Recommend deferring to v2 — adds ~500–800 ms latency.
- **Depth:** iOS LiDAR on iPhone 12 Pro+ via ARKit; ARCore Depth on
  Android (~87 % device support as of late 2025). Useful for
  occlusion-aware confidence; defer to v2.

**Compression + resize.**
- Target longest edge **1280 px** (kitchens with dense small items
  benefit from detail).
- iOS: capture HEIC, transcode to **WebP @75 %** before upload (~1.0 MB).
- Android: native WebP @75 % (~1.2 MB).
- Strip GPS + timestamps from EXIF; preserve orientation.

**Privacy / on-device pre-filter.**
- Face redaction: ML Kit face detection + blur (~80–150 ms on-device).
- PII text redaction (emails, phone numbers): defer to v2 unless legal
  requires it.
- Per-image consent prompt + on-device audit log of timestamp + image
  hash + destination + consent state.

**HITL queue patterns.**
- Surface only **uncertain** detections to the user.
  Priority = `entropy(class_probs) + diversity_bonus(embedding_distance
  from already-confirmed crops)`.
- Batch 5–10 per review session. Cap at 10 % of total detections per
  capture so the user never feels punished for a busy room.
- Confirmation UI: top-3 candidates with confidence; tap to accept,
  swipe to cycle, "skip" for unsure. "Review later" defers to a
  background queue.
- Feedback loop: user confirmations + corrections feed back into the
  per-detector temperature-scaling refit, ideally per-session for the
  first 1 000 captures, daily after that.
- Partial state in the app: show confirmed detections immediately,
  pending detections dimmed with spinners, counts updating
  ("12/15 confirmed"). The mobile app already has 202+poll
  scaffolding — surface it visually.

Citations:
- pub.dev/packages/sensors_plus
- developer.apple.com/arkit/ (depth)
- cloudinary.com/blog/advanced-image-formats-and-when-to-use-them
- encord.com/blog/active-learning-machine-learning-guide

## B5. Recommended target stack (synthesised)

A defensible 2026 starting point for this project:

| Layer | Choice | Rationale |
| --- | --- | --- |
| Capture pre-filter | Laplacian blur + histogram exposure + gyro motion + face blur | All on-device, sub-200 ms |
| Transport | WebP @75 %, 1280 px longest edge, EXIF stripped | Mobile-friendly bandwidth |
| Coarse detection | Grounding DINO 1.5 Edge (TensorRT) | Open-vocab, fast, Apache 2.0 |
| Long-tail specialist (optional) | OWLv2 | Apache 2.0, only when coverage requires |
| Small-object recovery | SAHI (512 px tiles, 50 px overlap) on low-recall regions | Recovers tail items |
| Segmentation | EfficientSAM-Ti chained on confirmed boxes | Speed/quality balance |
| Box fusion | WBF (`iou_thr=0.5`) | Preserves info vs NMS |
| Embedding | DINOv2 ViT-L/14 | Pose/lighting robust |
| Index | FAISS IVFFlat | Production-grade |
| Calibration | Per-model temperature + post-fusion isotonic regression | Realistic confidences |
| Classification refinement | Existing Qwen2.5-VL tier (kept, but invoked on dedup'd crops, not raw Florence regions) | Reuse existing infra |
| Orchestration | Temporal (kept) — but with multi-pass workflow and ensemble activities | Reuse existing infra |
| Storage | PostgreSQL + pgvector for detections / embeddings / ground truth / verification queue | New layer |
| Eval | SUN RGB-D + Hypersim + custom labelled set; Label Studio; mAP/recall/coverage/ECE in CI | New |

**Latency budget per image (single A10G):** ~600–800 ms typical;
+400–600 ms when SAHI tiling triggers. The spec doesn't pin a latency
budget — the interview should.

---

# Part C — Cross-cut: gaps the rewrite must close

Mapping (A) gaps to (B) options:

| Gap in current code (Part A) | Concrete fix from Part B |
| --- | --- |
| Single Florence pass, no multi-pass (A2) | Grounding DINO + SAHI + EfficientSAM cascade (B1) |
| No NMS / no fusion (A6 absent) | WBF (B2) |
| No embedding dedup (A8 absent) | DINOv2 + FAISS (B2) |
| Hardcoded tier chain (A2, A7) | Config- or DB-driven pipeline definition (B5) |
| Static confidence (0.9 / 0.5) (A2) | Temperature + isotonic calibration (B2) |
| No taxonomy (A4 dead schema, A8 free-text) | Open Images V7 + HomeObjects-3K + project-specific (B3) |
| No labelled eval set, no CI gates (A11) | Label Studio + SUN RGB-D + custom set, CI metrics gates (B3) |
| No server-side persistence (A8) | Postgres + pgvector for detections/embeddings/ground-truth/HITL (B5) |
| Image-quality service exists but unused (A6) | Wire it server-side as a route gate, plus client pre-filter (B4) |
| Circuit breaker exists but unused (A6) | Wire per-provider in workflow OR delete (decision in plan) |
| No HITL queue (A8 absent) | Active-learning + uncertainty UI (B4) |
| Mobile single-frame, no quality gate (A10) | Blur+exposure+gyro pre-filter (B4) |
| `EnrichedItem` flat shape (A3) | Replace with `Detection / Item / SceneObservation` carrying per-detector provenance + embeddings + calibrated confidence |
| Legacy `providers/` dead code (A5) | Delete after rewrite cuts over |
| Legacy `schemas/detection.schema.ts` dead code (A4) | Delete after rewrite cuts over |

These are the questions the **interview** in step 8 should resolve:
- Mobile-first or server-first inventory?
- Single GPU host vs. cloud burst for SAHI / OWLv2 long-tail?
- Synchronous (≤2 s) or async (Temporal-async, current default) UX?
- Latency / cost ceiling per image?
- Privacy policy on uploaded photos (face blur required? PII text? cloud OK?)
- How much labelled data does the user already have (or can acquire)?
- Is on-device CoreML detection a hard constraint or a fallback?
- Acceptable HITL volume (max % of detections we'll ask the user about)?
- Deployment status: still pre-deploy (per memory), so schemas can be
  rewritten directly?

These plus capture/multi-frame appetite drive the actual plan.

---

# Part D — Testing strategy notes

Captured for `claude-plan-tdd.md` (step 16):

- The repo already uses **Vitest** for API unit + Temporal workflow
  tests (`detect-inventory.workflow.test.ts`,
  `detect-inventory.replay.test.ts`). The rewrite must preserve the
  Temporal `record-happy-path.ts` + replay-test discipline — every new
  workflow shape needs its own recorded event history.
- Mobile uses `flutter test` + `integration_test`. New Drift schema
  needs migration tests (or, per the no-deploy rule, schema-rebuild
  tests).
- For the eval harness specifically, treat metrics computation as
  unit-testable (deterministic, no model calls) — write the metric
  functions first, golden-test them, then plug in real predictions.
- For ensemble/fusion logic, write tests **per detector** with fixed
  fixtures, then a test for the fusion that uses synthesised detector
  outputs (no model calls in tests).
- Embedding dedup logic is testable with stored fixture embeddings; do
  not rebuild DINOv2 in CI.

---

End of research.
