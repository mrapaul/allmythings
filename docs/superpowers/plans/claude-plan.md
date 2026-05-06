# Detection Pipeline Structural Rewrite — Implementation Plan

Date: 2026-04-29
Spec: [claude-spec.md](claude-spec.md)
Research: [claude-research.md](claude-research.md)
Interview: [claude-interview.md](claude-interview.md)
Review: [reviews/iteration-1-opus.md](reviews/iteration-1-opus.md)
Integration notes: [claude-integration-notes.md](claude-integration-notes.md)

> Read this plan in full before touching code. It is a blueprint, not a
> building — function/op signatures and contracts are specified, but no
> bodies are written. Implementation happens via the section files
> generated in step 18+ of the deep-plan workflow.

---

## 0. Executive summary

The current Visual Home Inventory pipeline (Florence-2 + Qwen-VL tier
chain via Temporal in `api-service/`) misses small/occluded items,
emits generic labels, and provides no honest signal of completeness.
This plan replaces the orchestration core with a **Dagster-driven
Python pipeline service running in-process inside a FastAPI sidecar**
while keeping the Fastify TS edge for HTTP/auth/photo storage. The new
pipeline is **multi-pass, multi-model, multi-frame**: the mobile sends
a 3-frame burst per capture; the pipeline auto-generates per-scene
class prompts via a VLM (no static taxonomies), runs an open-vocabulary
detector + segmenter alongside the existing Florence-2 / Qwen-VL stack,
computes embedding-based dedup across passes and frames, and
self-diagnoses via multi-model+multi-frame agreement to trigger
stricter reruns when coverage is low. Mobile capture is rewritten with
on-device blur/exposure gating, face redaction, multi-frame burst,
and WebP@1280 px upload. Drift on the device remains the inventory
source of truth and is rebuilt with a richer schema (no migration plan
— app is not deployed). All compute stays on the local Mac, no cloud
egress, no human-in-the-loop, no human ground truth, no latency
ceiling.

The architecture is intentionally agreement-driven, so the design
treats every signal as suspect by default: signals are grouped into
**signal classes** (first-pass detectors, tiled re-detectors, frames),
and a detection's confidence is a function of how many *independent*
classes corroborate it. Florence and Grounding DINO share a class
(both first-pass detectors); SAHI tiling is its own class; each
captured frame is its own class. This means v1's minimum viable
agreement signal comes from 3 frames × 1 first-pass-detector-class +
conditional SAHI = 3–4 independent signals per detection, which is
enough to keep the confidence sigmoid honest.

---

## 1. Architecture overview

Two services run on the Mac, advertised as a single endpoint to the
phone via existing Bonjour mDNS:

```
┌──────────────────────────────────────────────────────────────────┐
│ Phone (Flutter, mobile-app/)                                     │
│   capture screen ── 3-frame burst                                │
│                  └─ blur/exposure pre-check (per frame)          │
│                  └─ face/PII redaction (per frame, ML Kit)       │
│                  └─ WebP @1280 px, EXIF stripped (per frame)     │
│                  └─ original frames discarded after encode       │
│   Drift database (rebuilt schema v5) — sole inventory store      │
│                                                                   │
│   Upload: ALL 3 frames as multipart parts in a single POST       │
└──────────────────────────────────────────────────────────────────┘
                            │ HTTPS (Bonjour-discovered)
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ api-service/  (Fastify TS, kept)                                 │
│   /v1/detect           — multipart (N frames), auth, idempotency │
│                          (sha256 of concatenated frame hashes),  │
│                          photo persist, dispatch run             │
│                          → 200 (sync if quick) | 202 + runId     │
│                          → 503 if pipeline queue depth > limit   │
│   /v1/detect/status/   — long-poll Dagster run state             │
│                                                                   │
│   /photos/*  /health  /metrics                                   │
│                                                                   │
│   Internal: pipeline.client.ts (gated by circuit-breaker.ts —    │
│   the circuit-breaker is KEPT for this purpose, not deleted)     │
└──────────────────────────────────────────────────────────────────┘
                            │ HTTP (loopback, JSON)
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ pipeline-service/  (Python, NEW)                                 │
│   FastAPI sidecar:                                               │
│     POST /runs                  — accepts idempotency_key (sha256 │
│                                   of frames). If a run is already │
│                                   running/succeeded for this key, │
│                                   returns existing runId.         │
│     GET  /runs/:runId           — current status                  │
│     GET  /runs/:runId/wait      — long-poll: blocks up to N s on  │
│                                   Dagster instance event stream   │
│                                   then returns current state      │
│     GET  /runs/:runId/timeline  — per-op timing for UI            │
│                                                                   │
│   Dagster ops, executed IN-PROCESS via materialize() inside the  │
│   sidecar's event loop. NO Dagster daemon, NO out-of-process     │
│   runner. The Dagster webserver runs as a separate read-only UI  │
│   pointed at the same DAGSTER_HOME for run history / lineage.    │
│   Concurrent in-process runs are gated by an asyncio Semaphore   │
│   (default 1) — equivalent to QueuedRunCoordinator(max=1) but    │
│   simpler.                                                        │
│                                                                   │
│   Dagster ops (assets):                                          │
│     frame_intake (list of frames) → scene_embedding              │
│     → vlm_prompt_expansion → florence_detect, gdino_detect       │
│     → sahi_recovery → effsam_segment → box_fusion                │
│     → crop_embedding → cross_pass_dedup → cross_frame_dedup      │
│     → classification_refine → agreement_scoring                  │
│     → self_diagnosis (DynamicOut → conditional rerun branch)     │
│     → assemble_result                                            │
│                                                                   │
│   In-process FAISS index for cross-pass / cross-frame dedup,     │
│   per-run; never persisted across runs.                          │
│                                                                   │
│   Models loaded once at sidecar startup; warm-up forward pass    │
│   on a synthetic 1×1 black image at boot, blocking sidecar       │
│   readiness until done.                                          │
│                                                                   │
│   Ollama calls are serialised through a per-model asyncio        │
│   semaphore inside `models/ollama_client.py`.                    │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ Existing local services (kept):                                  │
│   detection-service/      — Florence-2 HTTP server (Python)      │
│   ollama                  — qwen2.5vl:7b/3b, moondream            │
│   LGTM stack              — Grafana / Prometheus / Tempo / Loki   │
│   Dagster webserver UI    — NEW; READ-ONLY view of DAGSTER_HOME  │
│                             at ~/allmythings-data/dagster        │
└──────────────────────────────────────────────────────────────────┘
```

`make start` brings all of these up together, in a strict order:
LGTM stack → Florence detection-service → Ollama → pipeline-service
sidecar (warm-up blocking) → Fastify → Dagster webserver UI. Each
later service health-checks the previous one before starting.

The mobile app does not learn about the split — it always talks to
Fastify on the existing Bonjour-published port. Internally, Fastify
calls the pipeline-service over loopback HTTP. This preserves the
existing auth surface and gives Dagster's UI/lineage as a first-class
operator tool without exposing it to the network.

---

## 2. Repository changes — directory map

```
allmythings/
├── api-service/                   # KEEP (Fastify TS); cleanup pass
│   ├── src/
│   │   ├── routes/
│   │   │   ├── detect.route.ts             # KEEP (replace client call,
│   │   │   │                                  add 503 backpressure path)
│   │   │   ├── detect-status.route.ts      # KEEP (replace client call)
│   │   │   ├── photos.route.ts             # KEEP
│   │   │   ├── health.route.ts             # KEEP (gain pipeline health)
│   │   │   └── metrics.route.ts            # KEEP
│   │   ├── clients/
│   │   │   └── pipeline.client.ts          # NEW — HTTP client to pipeline-service
│   │   ├── services/
│   │   │   ├── provider-health.service.ts  # KEEP, rewire targets
│   │   │   ├── image-quality.service.ts    # DELETE (image quality moves to mobile)
│   │   │   ├── vision-orchestrator.service.ts  # DELETE if present
│   │   │   ├── ensemble-fusion.service.ts      # DELETE if present
│   │   │   └── translation/                # NEW — temporary legacy-shape
│   │   │                                     translator (Phase 6 → Phase 5
│   │   │                                     window only; deleted in Phase 5)
│   │   ├── temporal/                        # DELETE entirely (Phase 5,
│   │   │                                       AFTER mobile is on new shape)
│   │   ├── providers/                       # DELETE entirely (legacy)
│   │   ├── schemas/
│   │   │   └── detection.schema.ts         # DELETE (legacy dead code)
│   │   ├── types/
│   │   │   └── pipeline.ts                 # NEW — shared types for Dagster contract
│   │   ├── utils/
│   │   │   ├── bonjour-advertiser.ts       # KEEP
│   │   │   └── circuit-breaker.ts          # KEEP — wire around pipeline.client
│   │   ├── telemetry/                       # KEEP (gain log redactors)
│   │   └── config/
│   │       └── env.config.ts               # KEEP (drop TIER_* + Temporal vars;
│   │                                          add PIPELINE_URL, DAGSTER_HOME)
│   └── tests/
│       ├── unit/
│       │   ├── routes/                     # KEEP detect / detect-status with new fixtures
│       │   ├── clients/pipeline.client.test.ts   # NEW
│       │   └── temporal/                   # DELETE (Phase 5)
│       └── integration/                     # NEW — Fastify ↔ mocked pipeline-service
│
├── pipeline-service/              # NEW (Python + Dagster, in-process)
│   ├── pyproject.toml             # uv-managed
│   ├── uv.lock
│   ├── pipeline_service/
│   │   ├── __init__.py
│   │   ├── dagster_defs.py        # Definitions(): assets, schedules, sensors, jobs
│   │   ├── api/
│   │   │   ├── server.py          # FastAPI: POST /runs, GET /runs/:id,
│   │   │   │                         GET /runs/:id/wait (long-poll)
│   │   │   └── schemas.py         # Pydantic models for request/response
│   │   ├── ops/
│   │   │   ├── frame_intake.py
│   │   │   ├── scene_embedding.py
│   │   │   ├── vlm_prompt_expansion.py
│   │   │   ├── florence_detect.py
│   │   │   ├── grounding_dino_detect.py
│   │   │   ├── sahi_recovery.py
│   │   │   ├── effsam_segment.py
│   │   │   ├── box_fusion.py
│   │   │   ├── crop_embedding.py
│   │   │   ├── cross_pass_dedup.py
│   │   │   ├── cross_frame_dedup.py
│   │   │   ├── classification_refine.py
│   │   │   ├── agreement_scoring.py
│   │   │   ├── self_diagnosis.py             # uses DynamicOut for reruns
│   │   │   └── assemble_result.py
│   │   ├── models/
│   │   │   ├── florence_client.py            # HTTP to existing detection-service
│   │   │   ├── ollama_client.py              # HTTP to Ollama, per-model semaphore
│   │   │   ├── grounding_dino.py             # ONNX/CoreML or MLX-based loader
│   │   │   ├── effsam.py                     # EfficientSAM-Ti loader
│   │   │   ├── dinov2.py                     # DINOv2 ViT-B/14 (768-d) via MLX
│   │   │   └── label_encoder.py              # all-MiniLM-L6-v2 sentence-transformers
│   │   ├── storage/
│   │   │   ├── faiss_index.py                # in-memory per-run only
│   │   │   ├── prompt_cache.py               # cache of vlm_prompt_expansion outputs
│   │   │   │                                    keyed by hash(round(scene_emb, 3 dp)).
│   │   │   │                                    BYPASSED when scene.embedding_failed.
│   │   │   └── retention.py                  # nightly Dagster schedule: prune
│   │   │                                        DAGSTER_HOME run history > 200
│   │   ├── log_redaction.py                  # structured-log filter for VLM outputs
│   │   ├── types.py                          # Pydantic dataclasses, mirror TS contract
│   │   └── config.py                         # env-driven thresholds
│   ├── eval/
│   │   ├── run_eval.py                       # entry — pipeline on local corpus
│   │   ├── metrics.py                        # agreement-coverage, etc.
│   │   ├── thresholds.json                   # CI-gating thresholds
│   │   └── corpora/                          # gitignored; populated in Phase 7
│   └── tests/
│       ├── conftest.py                       # fixtures: fake model HTTP responders
│       ├── unit/
│       │   └── ops/                          # one test file per op
│       ├── integration/
│       │   └── test_full_run.py              # end-to-end with fake model HTTP
│       └── replay/
│           ├── README.md                     # what op-replay means here
│           ├── fixtures/                     # golden op-input/output JSON
│           └── test_op_replay.py             # rerun ops with golden inputs,
│                                                assert byte-equal outputs
│
├── mobile-app/                    # UPDATE
│   ├── lib/
│   │   ├── presentation/camera/
│   │   │   └── camera_capture_screen.dart     # REWRITE for burst + on-device gating
│   │   ├── application/providers/
│   │   │   └── detection_providers.dart       # SIMPLIFY — drop CoreML branch
│   │   ├── services/
│   │   │   ├── image_quality.dart             # NEW — Laplacian + histogram
│   │   │   ├── face_redaction.dart            # NEW — ML Kit binding
│   │   │   ├── burst_capture.dart             # NEW — 3-frame burst, send all 3
│   │   │   └── upload_encoder.dart            # NEW — WebP @1280; original
│   │   │                                          frames discarded after encode
│   │   ├── data/
│   │   │   ├── repositories/detection_repository.dart  # types updated, multipart payload
│   │   │   └── database/                       # REWRITE schema v5 (see §5.3)
│   │   └── domain/                              # types updated
│   ├── ios/
│   │   └── Runner/                              # CoreML deletion targets:
│   │                                              - CoreMLDetector.swift
│   │                                              - CoreMLPlugin.swift
│   │                                              - CoreMLBridge.m/.h
│   │                                              - any *.mlpackage / *.mlmodel resources
│   │                                              (Phase 6 task: enumerate + delete; commit
│   │                                              shows full diff)
│   └── android/                                 # equivalent on-device detector code:
│                                                   - any TFLite *.tflite assets
│                                                   - any kotlin/java OnDeviceDetector class
│                                                   (Phase 6 task)
│
├── detection-service/             # KEEP (Florence-2 HTTP)
│
├── docs/superpowers/plans/        # this directory
│
├── scripts/
│   ├── smoke.sh                   # UPDATE — assert pipeline-service health
│   ├── smoke-assertions.ts        # UPDATE — pipeline contract assertions
│   └── start-pipeline.sh          # NEW — health-checks Florence + Ollama before
│                                      starting Dagster sidecar; blocks until
│                                      sidecar warm-up completes
│
└── Makefile                       # UPDATE — `make start` orders services strictly
```

---

## 3. The pipeline — op-by-op contracts

Each Dagster op (asset) has a single deterministic contract: given a
typed input, produce a typed output, with named retry/timeout policy.
Ops are pure-ish — the only side effects they may have are writing
photo bytes (frame_intake) or building the in-process FAISS index
(crop_embedding / cross_*_dedup). Ops that call models do so through
thin HTTP/process clients in `pipeline_service/models/`, which makes
them mockable in tests.

This section defines each op's contract. Op bodies are NOT specified
here; they go in section files.

### 3.0 Cross-cutting op concerns

- **Empty-set semantics.** Every op that produces numeric output
  defines its behaviour for empty input (no frames, no detections,
  empty embedding set). Coverage and precision over an empty set are
  defined as `0.0`, never `NaN`. Each op's contract restates this
  where it matters.

- **Deterministic ordering.** Every op that aggregates lists sorts its
  inputs by an explicit, stable key before processing. Specifically:
  per-frame fused boxes are sorted `(detector_class, frame_id, label,
  x, y)`; embedding lookups sort detection IDs lexicographically.
  No reliance on Python dict order or set iteration order.

- **Replay tests.** "Replay" in this codebase means **op-level pytest
  replay**: golden JSON I/O fixtures under
  `pipeline-service/tests/replay/fixtures/`, deterministic
  re-invocation of the op with the recorded input asserting byte-equal
  output. This is NOT Dagster-native event-history replay (Dagster
  has no equivalent of Temporal's replay-test). The fixture set is
  refreshed only on intentional contract changes; refresh is a
  dedicated PR with metric-impact analysis.

- **Ollama serialisation.** All Ollama calls go through
  `models/ollama_client.py` which holds a per-model `asyncio.Semaphore(1)`.
  This eats parallelism (intentional — Ollama serialises on a single
  Mac GPU anyway) and prevents memory thrash from concurrent model
  swaps.

- **Log redaction.** VLM outputs (`vlm_prompt_expansion.PromptList`,
  `classification_refine.vlmStructuredAttributes`) may include text
  inferred from in-frame content (e.g., text on documents). Loggers
  redact these to structural shape only: `len(prompts)=N,
  sample_first_3=[...lowercased noun heads only...]`. Full content
  is available in Dagster asset metadata (kept on the local Mac, not
  emitted to Loki) for debugging.

### 3.1 frame_intake

**Input:** request payload `{ frames: list[{photoBytes: bytes,
sha256: str, frameId: str, mimeType: str}], idempotency_key: str,
trace_id: str, request_id: str }` (from FastAPI sidecar). v1 sends
exactly **3 frames** (the burst); the op's input shape is a list so
v2 multi-burst doesn't need a contract change.

**Output:** `list[Frame]` where each `Frame` has `frame_id, rgb_tensor
(H,W,3, uint8), exif, captured_at`.

**Behaviour:** for each input, decode (jpeg/png/webp), strip EXIF
except orientation, write the bytes to
`~/allmythings-data/photos/{sha256}.{ext}`, emit `Frame`. If any single
frame fails decoding, emit it as `Frame(decoding_failed=True)` and
continue — the run can still proceed with the remaining frames; the
agreement signal will simply be lower.

**Failure:** if **all** frames fail decoding → raise
`UnsupportedMediaTypeError` (non-retryable; aborts the run). If at
least one frame is usable, the op succeeds with partial input.

### 3.2 scene_embedding

**Input:** `list[Frame]`.

**Output:** `list[SceneEmbedding(frame_id, vector_768_f16, embedded_at,
embedding_failed: bool)]`.

**Behaviour:** **DINOv2 ViT-B/14** (768-d, float16) via the official
MLX port on Apple Silicon. Input crop is the centre-square 224 × 224
of each frame. Output vectors are L2-normalised. The "scene embedding"
is computed per-frame; downstream `vlm_prompt_expansion` uses the
median-by-distance frame's embedding as the cache key.

**Failure:** retry 3× with exponential backoff. On final fail, return
`SceneEmbedding(vector=zero_vector, embedding_failed=True)`. The
pipeline continues; downstream cache lookups are bypassed for failed
embeddings (see §3.3) so we do not collide all failed scenes onto one
prompt list.

### 3.3 vlm_prompt_expansion

**Input:** `list[Frame], list[SceneEmbedding]`.

**Output:** `PromptList(prompts: list[str], cached: bool,
source_models: list[str], degraded: bool)`.

**Behaviour:**

1. If **any** frame has `embedding_failed`, **bypass the cache** and
   run prompt expansion live. (Otherwise all failed scenes would alias
   onto the same cached prompt list.)
2. Otherwise look up the prompt cache by
   `hash(round(median_scene_embedding, 3 decimal places))`. On hit,
   return cached prompt list with `cached=True`.
3. On miss, run **two independent prompt seeds in parallel** to
   reduce model-monoculture circularity (a real risk flagged by
   review §2b):
   - **Seed A:** ask `qwen2.5vl:7b` (Ollama) the question:
     > "Look at this room photo. List every kind of household object
     > that is visible OR likely to be visible in similar photos.
     > Return one noun-phrase per line, lowercase, no commentary."
   - **Seed B:** take the captions emitted by `florence_detect` for
     the same frames as a flat noun list (no LLM involvement).
   The output prompt list is the **union** of A and B, deduplicated.
   `source_models=['qwen2.5vl:7b', 'florence-2']`. `cached=False`.
4. Sanitise: split on lines, trim, lowercase, dedupe, drop empties,
   drop items > N tokens, cap to top M (default M=80).
5. Cache result keyed by the median scene embedding (so similar
   scenes re-use the prompt list across captures, but failed
   scenes never poison the cache).

**Why this matters:** the review correctly noted that if Qwen-VL
seeds the prompts and Qwen-VL also classifies, we have circularity.
Running Florence captions as a parallel seed gives us a non-Qwen
ontology source.

**Failure:** retry 3× per seed (Ollama 5xx / parse error). If both
seeds fail, fall back to a small set of generic noun heads emitted
from any successful Florence run on these frames; if Florence is
also unavailable, emit `PromptList(prompts=[], degraded=True)` and
let downstream agreement-scoring flag the run as `single_source_run`
(see §3.13).

### 3.4 florence_detect

**Input:** `list[Frame]`.

**Output:** `list[FrameDetections(detector="florence", frame_id, ...)]`
where each `RawDetection = {bbox, label, raw_confidence: Optional[float],
frame_id}`. Florence returns no confidence; `raw_confidence=None`.

**Behaviour:** HTTP POST to existing detection-service
`/detect/florence` per frame. Multipart upload. Heartbeats every 5 s.
The op normalises Florence's `{regions:[{caption,x,y,w,h}]}` into
`RawDetection` records with `label = caption`, `raw_confidence = None`
(explicit absence — see §5.1).

**Important:** Florence and Grounding DINO together count as **one
signal class** in agreement scoring (§6.1). They're both first-pass
detectors trained on broadly overlapping data; treating them as
independent inflates confidence artificially. This is enforced in
`agreement_scoring`, not here.

**Failure:** retry 3× per frame. On final fail per frame, emit
`FrameDetections(detector_error=True, detections=[])` for that frame.
If all frames fail, the run continues with gdino/SAHI signals only;
agreement coverage will drop and self-diagnosis will react.

### 3.5 grounding_dino_detect

**Input:** `list[Frame], PromptList`.

**Output:** `list[FrameDetections(detector="gdino", frame_id, ...)]`.

**Behaviour:** Run Grounding DINO 1.5 Edge against each frame using
each prompt in the list. For each prompt, emit detections above
`config.thresholds.gdino_score_thr` (default 0.30).
`RawDetection.label = prompt`, `raw_confidence = model_score`.

**Apple-Silicon viability is the highest-risk model in this plan**
— see §11.1 for the spike acceptance criteria. If the spike fails,
the fallback is OWLv2-Base via ONNX-Runtime CoreML EP or
YOLO-World-S int8; the *contracts* don't change.

**Failure:** retry 3× per frame. On final fail per frame, emit
`FrameDetections(detector_error=True, detections=[])` for that frame.

### 3.6 sahi_recovery

**Input:** `list[Frame], list[FrameDetections]` (per-detector).

**Output:** additional `FrameDetections(detector="gdino-sahi",
frame_id, detections=..., tile_errors: list[TileError])`, **only if**
the first-pass detection density on that frame falls below
`config.thresholds.sahi_trigger_density` (default 5 detections per
megapixel).

**Behaviour:** Tile each triggered frame into 512 × 512 windows with
64-px overlap, rerun Grounding DINO on each tile against the same
prompt list, re-project boxes to full-frame coordinates, IoU-filter
duplicates of first-pass detections, emit the survivors.

`tile_errors` records any tile that failed all retries:
`TileError(tile_index, code, message)`. If `len(tile_errors) /
total_tiles > 0.5`, agreement_scoring elevates the run to a warning
state.

**Failure:** retry 3× per tile. Tile-level failures become
`tile_errors`; the op itself succeeds.

### 3.7 effsam_segment

**Input:** `list[Frame], FusedFrame[]` (depends on box_fusion).

**Output:** per-detection `Mask(rle_bytes)` for boxes that succeeded.

**Behaviour:** Run EfficientSAM-Ti on each fused box. Mask quality is
best-effort; if mask IoU with the input box is < 0.4 the mask is
dropped. **Important latency note:** EfficientSAM's prompt-encoder
runs once per box, not per frame. For a 30-box scene this is
non-trivial — measured end-to-end in the §11.1 spike.

**Failure:** if EfficientSAM is unavailable, the op succeeds with
empty masks; downstream ops handle absent masks (the bbox is used
for cropping in §3.9).

### 3.8 box_fusion

**Input:** `list[FrameDetections]` per frame (all detectors that
emitted boxes for that frame).

**Output:** `FusedFrame(frame_id, fused: list[FusedDetection])`.

**Behaviour:** Apply Weighted Boxes Fusion (WBF) per frame across all
detectors. Inputs are sorted `(detector, frame_id, label, x, y)`
before fusion to guarantee determinism (Python dict / set iteration
order is not relied upon). Hyperparameters in `config.box_fusion`:

```
iou_thr               = 0.5
skip_box_thr          = 0.0
detector_weights      = { florence: 0.5,
                          gdino:    1.0,
                          gdino-sahi: 0.8 }
```

Florence's weight is intentionally low because it emits no real
confidence (`raw_confidence=None` is treated as 0.5 for weighting
purposes); gdino's weight is highest because it returns a meaningful
score.

Different-detector / different-label boxes that overlap are clustered
together; the cluster keeps the highest-weighted-confidence label as
`primary_label` and the others as `alternates: list[(label, conf)]`.
`contributing_signals` records the underlying `(detector, frame_id,
raw_confidence)` tuples.

**Empty-set:** input with no frames or no detections per frame →
`FusedFrame(frame_id, fused=[])`.

**Determinism:** WBF is deterministic given the sort + tied seed on
the WBF library's internal RNG (set at module import).

### 3.9 crop_embedding

**Input:** `Frame, FusedFrame` per frame.

**Output:** `EmbeddedFrame(frame_id, embeddings: dict[detection_id →
1024-byte int8 vector])`.

**Behaviour:** Crop each fused box to a square padded crop, resize to
224 × 224, run **DINOv2 ViT-B/14** (768-d). Output is L2-normalised
float16 server-side and **quantised to int8** before being shipped to
the device (768 B/vector instead of 1.5 KB). Cropping respects
EfficientSAM mask edges if a mask exists (else uses bbox).

**Failure:** retry 3× per crop. Detections without an embedding are
flagged `embedding_unavailable=True`; they are still emitted but
excluded from cross-frame dedup (since dedup needs the embedding).

**Empty-set:** input with no fused detections → `EmbeddedFrame(frame_id,
embeddings={})`.

### 3.10 cross_pass_dedup

**Input:** `FusedFrame, EmbeddedFrame` for a single frame, post-SAHI.

**Output:** `DedupedFrame(frame_id, detections: list[FusedDetection])`.

**Behaviour:** within one frame's detections, merge two boxes if
`(IoU > 0.7) AND label_text_compat(a.primary_label, b.primary_label)`,
or if `(cosine(crop_embedding) ≥ θ_pass=0.88) AND
label_text_compat(a, b)`. The merge keeps the detection with the
highest `len(contributing_signals)`; the discarded signals are
appended to the survivor's `contributing_signals`.

`label_text_compat(a, b)` is defined in §3.11.

**Empty-set:** input `FusedFrame.fused=[]` → `DedupedFrame(frame_id,
detections=[])`.

### 3.11 cross_frame_dedup

**Input:** `list[DedupedFrame]` for the burst (v1: exactly 3 frames).

**Output:** `SceneObservation` with a single dedup'd detection set
across the burst.

**Behaviour:** Maintain a FAISS in-memory index for the run, per-run
only (no persistence across runs). For each frame's detections, look
up the K=3 nearest neighbours from already-seen detections. Merge if
**all three** of these hold:

1. `cosine(crop_embedding) ≥ θ_scene=0.85`
2. `label_text_compat(primary_label_a, primary_label_b) == True` (text
   similarity used as a **negative gate**, not a positive trigger)
3. The two detections come from **different frames** (we never merge
   two detections from the same frame in this op — that's
   cross_pass_dedup's job).

On merge, the merged detection's `contributing_signals` includes the
previously-unseen frame as a corroborating signal — this is where
multi-frame agreement_score growth comes from, and is the primary
reason v1 sends all 3 burst frames.

`label_text_compat(a, b)`:
- Encode both labels with `sentence-transformers/all-MiniLM-L6-v2`
  (384-d, runs CPU/MPS, ~3 ms per pair). Cache encodings within the
  run.
- Returns `True` iff `cos(emb_a, emb_b) ≥ 0.6`. The threshold is a
  **negative gate**: it blocks merges of clearly different items
  (e.g., "table"/"chair" → ~0.4, blocked). It does NOT collapse
  unrelated nouns — the dominant merge signal remains crop-embedding
  similarity.
- Adversarial-pair test fixtures committed at
  `pipeline-service/tests/replay/fixtures/label_compat_pairs.json`:
  `("sofa","couch")→True, ("table","chair")→False,
  ("lamp","light")→True, ("plant","vase")→False`, etc.

**Empty-set:** input `[]` → `SceneObservation(detections=[])` with
all metrics = 0.

### 3.12 classification_refine

**Input:** `SceneObservation` (after dedup).

**Output:** `SceneObservation` with `vlmStructuredAttributes` populated
on each detection.

**Behaviour:** This is the existing Qwen-VL tier chain logic, lifted
out of the Temporal workflow. For each dedup'd detection (not each
Florence region!), call qwen2.5vl:7b with the existing prompt; on
timeout/parse failure, fall back to qwen2.5vl:3b, then moondream,
then leave `vlmStructuredAttributes = {}` (no fake `florence-only`
synthetic attribute set — present-without-enrichment is OK; lying
with a default attribute set is not).

Deduping first cuts Qwen-VL calls (~30 s saved on a busy room) and
prevents conflicting attributes for the same physical object.

All Ollama calls go through the per-model semaphore in
`models/ollama_client.py` (§3.0).

### 3.13 agreement_scoring

**Input:** `SceneObservation`.

**Output:** `SceneObservation` with `agreement_score`, `confidence`,
`scene.agreement_coverage`, `scene.agreement_precision`, and
`scene.flagged + scene.flag_reason` populated.

**Behaviour:**

1. For each detection, compute
   `signal_classes = unique({signal_class_of(s) for s in contributing_signals})`
   where:
   - `signal_class_of(florence)   = "first_pass"`
   - `signal_class_of(gdino)      = "first_pass"`  ← **same class as Florence**
   - `signal_class_of(gdino-sahi) = "tiled"`
   - `signal_class_of(<frame_id>) = f"frame:{frame_id}"`
2. `agreement_score = len(signal_classes)`. v1 maxima:
   - `first_pass` (1) + `tiled` (0–1) + `frame:F1, frame:F2, frame:F3`
     (3) = up to 5.
3. `confidence = clip01(sigmoid((agreement_score - K_baseline) / σ))`
   with defaults `K_baseline=2, σ=1`. So 1 signal class → ~0.27,
   2 → 0.5, 3 → 0.73, 4 → 0.88, 5 → 0.95. Tunable in config.
4. **Empty-detection-set:** if `len(detections) == 0`,
   `agreement_coverage = 0.0, agreement_precision = 0.0` (NOT NaN,
   NOT 1.0). `scene.flagged = True, scene.flag_reason =
   "empty_detection_set"` if `norm(scene_embedding) > ε` (i.e.,
   the scene is not a blank/black image — no detections from a
   real scene is itself a failure mode).
5. **Single-source-run detection:** if every detection in the run has
   `len(signal_classes) == 1` AND that one class is
   `"first_pass"`-only (i.e., gdino degraded to Florence-only AND no
   SAHI fired AND only one frame was usable), emit
   `scene.flagged = True, scene.flag_reason = "single_source_run"`
   regardless of coverage. This catches the failure mode where
   Florence is the only thing actually contributing.
6. Scene metrics:
   - `agreement_coverage = mean(1{score ≥ 2})`
   - `agreement_precision = mean(1{score ≥ 3})`

These are CI-gating metrics (with thresholds tuned in §6.3). They
replace mAP/recall@IoU, which need human ground truth we deliberately
do not have.

### 3.14 self_diagnosis

**Input:** `SceneObservation`, current rerun depth.

**Output:** Dagster `DynamicOut` — either yields nothing (terminal,
the scene is good enough or budget exhausted), or yields one element
that triggers a sub-graph re-running ops at higher strictness, with
its output fed back into a final `assemble_result`.

**Implementation note (review feedback):** Dagster has no concept of
"sub-runs" producing parent results. The right primitive is
**DynamicOut**: `self_diagnosis` is itself a graph node whose dynamic
output spawns the rerun branch in the same DAG. Lineage is visible in
the Dagster UI as a fan-out from `self_diagnosis` to the rerun ops.
No daemon required.

**Trigger logic:**

- If `agreement_coverage < τ_cov` (default 0.70) OR
  `agreement_precision < τ_prec` (default 0.40) OR
  `flag_reason == "empty_detection_set"`:
  yield a `RerunDirective` at the next strictness level
  (§6.4). Cap at `MAX_RERUNS=2`.
- If `flag_reason == "single_source_run"`: same trigger — try to
  recover gdino with paraphrased prompts.
- **No-improvement bail-out:** if the previous rerun's metrics did
  NOT improve over the rerun before it
  (`coverage(rerun_k) ≤ coverage(rerun_{k-1})`), terminate
  immediately. Emit the **previous** rerun's result, not the latest
  (which by definition has not helped). This prevents the
  pathological "more knobs loosened = more low-quality detections"
  spiral.
- If `rerun_depth ≥ MAX_RERUNS`: emit current observation,
  `scene.flagged = True, scene.flag_reason =
  "diagnosis_budget_exhausted"`.

**Output paths:**
- **Terminal:** yield `Out(SceneObservation)` directly to
  `assemble_result`.
- **Rerun:** yield `DynamicOut(RerunDirective)`; downstream
  `rerun_branch` op reruns gdino_detect / sahi_recovery /
  classification_refine with overridden config, then re-feeds into
  `agreement_scoring → self_diagnosis (depth+1)`.

### 3.15 assemble_result

**Input:** final `SceneObservation` (post-rerun if any).

**Output:** the JSON shape returned via the FastAPI sidecar to
Fastify (see §4.2).

**Behaviour:** Pure transformation — no model calls, no I/O. Wraps
its body in `try / except` so a Pydantic validation error or an
unexpected None reference produces a **minimal valid** SceneObservation
with `flagged=True, flag_reason="assemble_failed"` and the exception
summary in `errors[]` rather than raising into Dagster's job-failed
state. The mobile must be able to render *something* even if the
last op blew up.

---

## 4. Service contracts

### 4.1 Mobile ↔ Fastify

Multipart `POST /v1/detect`. v1 multipart payload contains **3 file
parts** (the burst), each with the encoded WebP bytes of one redacted
frame. 200 with result if pipeline finishes within
`httpResponseTimeoutMs` (default 90 s, kept). 202 with
`{runId, statusUrl}` otherwise. **503** with `Retry-After` if the
pipeline-service queue depth exceeds the limit (mobile already retries
503 with backoff).

`GET /v1/detect/status/:runId` returns 200 (completed), 202 (running),
500 (failed/cancelled), 404 (unknown).

Result body shape changes to `SceneObservation` (richer; see §5.1) but
the contract (status codes, status fields) is preserved so the mobile
retry loop in `detection_repository.dart` is untouched apart from
type parsing.

### 4.2 Fastify ↔ pipeline-service (loopback HTTP, JSON)

```
POST /runs
  Request:
    {
      idempotency_key:  string,              // sha256 of concatenated frame hashes
      photo_paths:      string[],            // server-local paths, op loads from these
      trace_id:         string,
      request_id:       string,
      config?:          PipelineConfig (optional override)
    }
  Response:
    202 { run_id: string, started_at: ISO8601, idempotent_hit: false }
    200 { run_id: string, started_at: ISO8601, idempotent_hit: true,
          status: "running" | "succeeded", result?: SceneObservation }
    503 { error: "queue_full", queue_depth: int, retry_after_s: int }

GET /runs/:runId
  Response:
    200 {
      run_id, status: "running"|"succeeded"|"failed"|"cancelled"|"timed_out",
      started_at, finished_at?,
      result?: SceneObservation,
      error_code?: string, error_message?: string
    }

GET /runs/:runId/wait?timeout_s=N
  // long-poll: sidecar subscribes to Dagster instance event stream
  // for this run and resolves as soon as the run reaches a terminal
  // state (or after timeout_s, whichever comes first).
  Response: same shape as GET /runs/:runId

GET /runs/:runId/timeline
  Response:
    200 {
      run_id,
      ops: [
        { name, status, started_at, duration_ms, retry_count,
          dynamic_outputs?: int }    // self_diagnosis fan-out count
      ]
    }
```

**Idempotency:** if a run already exists for `idempotency_key` in
`running` state → return its `run_id, status="running",
idempotent_hit=true`. If it exists in `succeeded` state with cached
result → return the result, `idempotent_hit=true`. If it failed →
allow a fresh run (the existing Temporal contract had
`ALLOW_DUPLICATE_FAILED_ONLY`; we preserve it).

**Backpressure:** sidecar tracks queue depth (in-process semaphore
+ pending request count). Configurable `max_queue_depth` (default 4).
Above the limit, return 503 with `retry_after_s` based on a moving
average of run duration.

**Inter-service auth:** sidecar binds to `127.0.0.1` only. No auth
between Fastify and FastAPI in v1; **explicitly accepted** because
the threat model is a single-user Mac (anyone with shell access has
already bypassed every other gate). Documented as a non-goal in §11.

`PipelineConfig` is the typed override surface for thresholds; in
production it's almost always omitted and Dagster's run-config defaults
apply. For replay tests the integration tests pass explicit config to
pin behaviour.

### 4.3 Replacement of the Temporal client

`api-service/src/clients/pipeline.client.ts` exposes:

```ts
interface PipelineClient {
  /** Launch a Dagster run for previously persisted photo(s). */
  launchRun(args: {
    idempotencyKey: string;          // sha256 of concatenated frame hashes
    photoPaths: string[];
    traceId: string;
    requestId: string;
    config?: Partial<PipelineConfig>;
  }): Promise<{ runId: string; startedAt: string; idempotentHit: boolean;
                status?: 'running' | 'succeeded'; result?: SceneObservation }>;

  /** Poll the current state of a run. */
  getRun(runId: string): Promise<RunStatus>;

  /**
   * Wait for a run to complete with a deadline.
   * Implementation: long-poll loop using GET /runs/:id/wait?timeout_s=N
   * with N = min(remaining_deadline, 25 s) per call. Falls back to
   * short-poll (250 ms → 2 s exponential, capped) if /wait is
   * unavailable. Caps total polling RPS at 5/s/run.
   */
  waitForCompletion(runId: string, deadlineMs: number): Promise<RunStatus>;
}
```

`detect.route.ts` calls `launchRun()`, then if `idempotentHit && status === 'succeeded'`
returns 200 immediately with the cached result; else
`waitForCompletion()` with `deadline = httpResponseTimeoutMs - bufferMs`;
on deadline-exceeded returns 202.

The whole `PipelineClient` is wrapped by the existing
`circuit-breaker.ts` (which we explicitly **keep**, not delete): if
the sidecar repeatedly fails, the breaker opens and Fastify returns
503 fast instead of timing out per-request.

`detect-status.route.ts` uses `getRun()` directly.

---

## 5. Data model & types

### 5.1 Shared TypeScript types (`api-service/src/types/pipeline.ts`)

```ts
type FrameId = string;          // UUID per uploaded frame (v1: 3 per capture)
type RunId   = string;          // Dagster run id
type SceneId = string;          // UUID per dedup'd scene observation
type DetectionId = string;      // UUID per dedup'd detection within a scene

interface PipelineConfig {
  thresholds: {
    detectionConfidenceMin: number;
    sahiTriggerDensity: number;          // detections / 1MP below = trigger SAHI
    crossPassEmbeddingTheta: number;     // dedup within frame (default 0.88)
    crossFrameEmbeddingTheta: number;    // dedup across frames (default 0.85)
    labelTextCompatTheta: number;        // negative gate (default 0.6)
    agreementCoverageMin: number;        // self-diagnosis trigger (default 0.70)
    agreementPrecisionMin: number;       // self-diagnosis trigger (default 0.40)
    maxReruns: number;                   // bound on self_diagnosis recursion (default 2)
  };
  enabledDetectors: ('florence' | 'gdino' | 'gdino-sahi')[];
  classificationTierForcing?: 'qwen7b' | 'qwen3b' | 'moondream';
  boxFusion: {
    iouThr: number;                      // default 0.5
    skipBoxThr: number;                  // default 0.0
    detectorWeights: { florence: number; gdino: number; 'gdino-sahi': number };
                                          // default { 0.5, 1.0, 0.8 }
  };
}

interface ContributingSignal {
  detector: 'florence' | 'gdino' | 'gdino-sahi';
  frameId: FrameId;
  rawConfidence: number | null;          // null for Florence (no score)
}

interface TileError {
  tileIndex: number;
  code: string;
  message: string;
}

interface PipelineDetection {
  id: DetectionId;
  bbox: { x: number; y: number; width: number; height: number };
  maskRleB64?: string;
  cropEmbeddingB64?: string;             // int8 quant on device, 768 B
  primaryLabel: string;
  alternateLabels: { label: string; confidence: number }[];
  vlmStructuredAttributes: Record<string, unknown>;
  agreementScore: number;
  contributingSignals: ContributingSignal[];
  confidence: number;                     // calibrated by agreement
}

interface SceneObservation {
  sceneId: SceneId;
  runId: RunId;
  frameIds: FrameId[];
  detections: PipelineDetection[];
  agreementCoverage: number;
  agreementPrecision: number;
  selfDiagnosisTriggered: boolean;
  rerunDepth: number;
  flagged: boolean;
  flagReason?: 'empty_detection_set' | 'single_source_run' |
               'diagnosis_budget_exhausted' | 'assemble_failed' | string;
  processingMs: number;
  errors: { op: string; code: string; message: string }[];
  tileErrors: TileError[];               // aggregated across frames
}

interface RunStatus {
  runId: RunId;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out';
  startedAt: string;
  finishedAt?: string;
  result?: SceneObservation;
  errorCode?: string;
  errorMessage?: string;
}
```

The TS types live in `api-service/`; the Python types in
`pipeline-service/pipeline_service/types.py` mirror them exactly via
Pydantic — the integration test in
`api-service/tests/integration/pipeline_contract.test.ts` round-trips
JSON between them to keep the two in sync.

`EnrichedItem` and `DetectResult` (current shared-types) are deleted
once mobile is updated (Phase 6 ships before Phase 5).

### 5.2 Python Pydantic types (`pipeline-service/pipeline_service/types.py`)

Mirror of §5.1, plus internal-only types not exposed across the
boundary:

```python
class Frame:
    frame_id: FrameId
    rgb: NDArray[np.uint8]                # H, W, 3
    exif_orientation: int
    captured_at: datetime
    decoding_failed: bool = False

class SceneEmbedding:
    frame_id: FrameId
    vector: NDArray[np.float16]            # (768,)
    embedded_at: datetime
    embedding_failed: bool = False

class PromptList:
    prompts: list[str]
    cached: bool
    source_models: list[str]               # e.g. ["qwen2.5vl:7b", "florence-2"]
    degraded: bool

class RawDetection:
    detector: Literal['florence', 'gdino', 'gdino-sahi']
    frame_id: FrameId
    bbox: BBox
    label: str
    raw_confidence: Optional[float]        # None for Florence

class FrameDetections:
    detector: str
    frame_id: FrameId
    detections: list[RawDetection]
    detector_error: bool = False
    tile_errors: list[TileError] = []      # populated by sahi_recovery only

class FusedDetection:
    detection_id: DetectionId
    frame_id: FrameId
    bbox: BBox
    primary_label: str
    alternates: list[tuple[str, float]]
    contributing_signals: list[ContributingSignal]

class FusedFrame:
    frame_id: FrameId
    detections: list[FusedDetection]

class EmbeddedFrame:
    frame_id: FrameId
    embeddings: dict[DetectionId, NDArray[np.float16]]  # 768-d server-side

class DedupedFrame:
    frame_id: FrameId
    detections: list[FusedDetection]                    # post-merge

class SceneObservation:                                  # mirror of TS shape
    ...

class RerunDirective:                                    # self_diagnosis output
    next_depth: int
    strictness_level: int
    overrides: PipelineConfig
    reason: Literal['empty_detection_set', 'low_coverage', 'single_source_run']
```

### 5.3 Mobile Drift schema v5 (rewrite, no migration)

```dart
// inventory_items — KEPT, simplified (no sceneId; one item ≡ one scene)
TextColumn  id              // PK = sceneId (one row per scene)
TextColumn  photoPath       // representative frame's path on device
TextColumn  thumbnailPath
TextColumn  serverPhotoUrl?
TextColumn  status          // 'pending' | 'completed' | 'failed' | 'flagged'
DateTimeColumn createdAt
DateTimeColumn updatedAt
BoolColumn  isFlagged

// scenes — NEW
TextColumn  id PK
TextColumn  captureSessionId
RealColumn  agreementCoverage
RealColumn  agreementPrecision
BoolColumn  selfDiagnosisTriggered
IntColumn   rerunDepth
TextColumn  flagReason?
DateTimeColumn createdAt
// NOTE: proposedPromptList is intentionally NOT stored on device
// (debug data; lives in Dagster asset metadata only).

// detections — NEW
TextColumn  id PK
TextColumn  sceneId   FK scenes.id    // canonical FK; no inventory_items.sceneId
TextColumn  bbox      // JSON {x,y,width,height}
BlobColumn  maskRle?
BlobColumn  cropEmbeddingI8           // 768 bytes int8 quantised
RealColumn  agreementScore
TextColumn  contributingSignals       // JSON [{detector, frameId, rawConfidence}]
TextColumn  vlmStructuredAttributes    // JSON Record<string, unknown>
TextColumn  primaryLabel
RealColumn  confidence

// detection_labels — NEW (denormalised so FTS works on alternateLabels)
TextColumn  detectionId   FK detections.id
TextColumn  label
RealColumn  confidence
BoolColumn  isPrimary

// labels — KEPT (free-form structured-attribute index)
//   (unchanged; primary inventory label lives on detections.primaryLabel)

// label_search_fts — KEPT, REWIRED
//   FTS5 over detection_labels.label  (NOT over JSON columns —
//   Drift FTS5 doesn't index JSON paths)
```

Schema bumps directly to **v5**. On first launch with on-disk version
< 5, the existing DB file is dropped and recreated. **Storage budget
target: < 50 MB for 1000 detections** (1 KB row + 768 B embedding +
~50 B label_text per row).

---

## 6. Self-diagnosis & agreement scoring math

The agreement-scoring scheme is the heart of "no human ground truth,
no human-in-the-loop". It must be right or the whole architecture
collapses into noise.

### 6.1 Per-detection agreement_score

A signal class is one of:
- `"first_pass"` — Florence and Grounding DINO together (they share
  this class because they're both first-pass open-vocab detectors
  with overlapping training data)
- `"tiled"` — Grounding DINO via SAHI (orthogonal because tiling
  exposes objects the first pass dropped)
- `"frame:<frame_id>"` — each captured frame independently

A detection's `agreement_score = len(unique signal classes contributing)`.

v1 maxima: `first_pass + tiled + 3 frames = 5`. Realistic v1 detection
scores cluster at 3–4 (most objects appear in all 3 frames and at
least one detector class).

### 6.2 Confidence calibration

```
confidence = clip01(sigmoid((agreement_score - K_baseline) / σ))
defaults:    K_baseline = 2,  σ = 1
```

| signals | confidence |
| --- | --- |
| 1 | 0.27 |
| 2 | 0.50 |
| 3 | 0.73 |
| 4 | 0.88 |
| 5 | 0.95 |

Single-class detections do not vanish — they surface with low
confidence so the mobile can show them dimmed or under "less certain"
sections.

### 6.3 Scene-level metrics

- `agreement_coverage = mean(1{score ≥ 2})`
  *"What fraction of detections have at least one corroborator from
  a different signal class?"*
- `agreement_precision = mean(1{score ≥ 3})`
  *"What fraction have strong cross-class corroboration?"*

CI gating thresholds (initial defaults; tuned per eval-rig results
once the corpus exists in Phase 7):

| Metric | Target | Gate? |
| --- | --- | --- |
| agreement_coverage | ≥ 0.70 | block merge |
| agreement_precision | ≥ 0.40 | warn |
| self_diagnosis_trigger_rate | ≤ 0.30 | warn |
| processing_p50 / p95 | informational | no gate |
| op_failure_rate | ≤ 0.05 | block |
| empty_detection_set rate | ≤ 0.02 | warn |
| single_source_run rate | ≤ 0.05 | warn |

### 6.4 Self-diagnosis directive (rerun strictness ladder)

| Level | Changes (each level *adds* to the previous) |
| --- | --- |
| 1 | (a) Lower `gdino_score_thr` by `min(0.10, current * 0.30)`. (b) Force SAHI on whole frame regardless of trigger density. (c) Re-run `vlm_prompt_expansion` with a paraphrased Qwen seed (different temperature, different phrasing) and union with previous prompt list. (d) Force `qwen7b` for classification_refine. |
| 2 | (a) Add a paraphrase-pass: re-run gdino with a synonym-rephrased prompt list from a second VLM tier (qwen3b) — **different model** for prompt seeding. (b) Lower `crossFrameEmbeddingTheta` additively: `θ_new = max(θ - 0.05, 0.7)` (NOT halved — the original "halve" was a bug). |
| 3+ | `MAX_RERUNS=2` cap reached → emit `flagged=True`, `flag_reason="diagnosis_budget_exhausted"`. |

**No-improvement bail-out:** if `coverage(rerun_k) ≤
coverage(rerun_{k-1})`, terminate immediately and emit the previous
rerun's result (which by definition was at least as good). This stops
the "more knobs loosened = more low-quality detections" spiral.

Each rerun is materialised as a **DynamicOut** fan-out from
`self_diagnosis` in the same DAG (no daemon, no sub-runs). Lineage in
the Dagster UI shows `self_diagnosis → rerun_1 → ... → assemble_result`
as a flat fan-out at the same depth, not a nested run.

---

## 7. Eval rig

`pipeline-service/eval/run_eval.py` is the single command that
executes the pipeline against a corpus and emits a metrics JSON.
CI calls it via `make eval`.

### 7.1 Corpus

Locally captured by the user during Phase 7 of execution. Stored under
`pipeline-service/eval/corpora/` and gitignored. Each "scene" is a
folder with **3-frame bursts** of the same physical scene captured
at slightly different angles. The corpus has no human labels — only
the bursts themselves.

**Starter corpus protocol (Phase 7 first task):** 5 rooms × 3 angles
× 2 captures = 30 scenes. Each scene = one 3-frame burst.

### 7.2 Metrics

```python
def agreement_coverage(observation: SceneObservation) -> float: ...
def agreement_precision(observation: SceneObservation) -> float: ...

def multi_frame_stability(scene_a: SceneObservation,
                          scene_b: SceneObservation) -> float:
    """Jaccard overlap of detection embeddings (≥0.85 cosine) between
    two captures of the same scene. Pure consistency metric — no labels."""

def self_diagnosis_trigger_rate(observations: list[SceneObservation]) -> float:
    """Fraction of runs that triggered at least one rerun."""

def op_failure_rate(observations: list[SceneObservation]) -> float:
    """Fraction of ops with detector_error or embedding_unavailable per run,
    averaged."""

def single_source_run_rate(observations: list[SceneObservation]) -> float:
    """Fraction of runs flagged single_source_run."""

def empty_detection_set_rate(observations: list[SceneObservation]) -> float:
    """Fraction of runs flagged empty_detection_set despite non-blank scenes."""
```

These are the only metrics. They are deterministic given pipeline
outputs, so the eval-rig functions themselves get unit tests against
synthetic SceneObservations.

### 7.3 CI integration

`make eval` runs the rig against the local corpus, writes
`pipeline-service/eval/last-metrics.json`, and exits non-zero if any
gating threshold (in `thresholds.json`) is violated. Until the corpus
exists (Phase 7 first task), `make eval` reports metrics without
gating — non-zero exit only on missing corpus or genuine pipeline
errors.

`make smoke` (existing, updated) calls `make eval` against a tiny
fixed corpus baked into the repo (one synthetic scene with 3 known
frames) so smoke remains fast and deterministic.

---

## 8. Observability + Dagster runbook

### 8.1 Observability stack

Kept as-is: LGTM (Grafana / Prometheus / Tempo / Loki) on
docker-compose. Both services emit OTel traces with the `traceId`
from the inbound `traceparent` header (Fastify already does;
pipeline-service uses the OpenTelemetry Python SDK).

### 8.2 Dagster UI

The Dagster webserver runs on `localhost:3001` and is accessible
from the developer Mac (not exposed to the network). It is configured
as a **read-only viewer** pointed at the same `DAGSTER_HOME` the
sidecar uses:

```
DAGSTER_HOME=/Users/<you>/allmythings-data/dagster
```

The webserver is a separate process from the FastAPI sidecar. The
sidecar materialises runs in-process and writes their event history
into `DAGSTER_HOME`'s instance storage; the webserver reads that
storage and renders the UI. There is no Dagster daemon.

The UI provides:
- **Runs view** — every pipeline run, status, duration.
- **Asset lineage** — visualises the op graph.
- **DynamicOut fan-out for self-diagnosis** — reruns appear as
  fan-out from `self_diagnosis` in the same DAG.
- **Asset metadata** — full VLM prompt lists / structured attributes
  here (NOT in Loki, where they're redacted).

Dagster run-tagging is used to tag runs with `traceId, requestId,
photoSha256` so traces in Tempo and runs in Dagster are
cross-navigable.

**Run-history retention.** A Dagster schedule
(`storage/retention.py::prune_runs`) runs nightly and deletes run
records older than the most-recent-200. Run threshold is config.

### 8.3 Log redaction

VLM-derived text is the most likely PII source (text on documents
in frame, etc.). Both services apply structured-log redactors:

- **Fastify (Pino):** redact paths `*.result.detections.*.vlmStructuredAttributes`
  in any logged response object — replace with
  `<redacted len=N keys=[...]>`.
- **Pipeline-service (Python logger):** in `log_redaction.py`, the
  `vlm_prompt_expansion` and `classification_refine` ops use
  `logger.info("...", extra={"_redact": True, ...})` and the
  redactor formats only `len, sample_first_3=[lowercased noun heads]`
  — never the full content.

Full content remains visible in Dagster asset metadata (local Mac
only) and op-replay fixtures (committed only with explicit author
review).

### 8.4 Runbook

| Symptom | Where to look | Likely cause |
| --- | --- | --- |
| `/v1/detect` 5xx | Fastify logs (Loki) | pipeline-service unreachable; circuit-breaker open; check sidecar process |
| `/v1/detect` 503 with Retry-After | Fastify logs | pipeline-service queue full; OK to wait |
| Run sits in `running` forever | Dagster UI runs view | one op stuck — open op log; check Ollama semaphore deadlock |
| Agreement coverage low across all scenes | `make eval`; Dagster lineage | a detector failing silently; check `op_failure_rate`; check signal class mix |
| `single_source_run` flag rate spiking | Dagster lineage | gdino degraded to Florence-only; check Grounding DINO model load + Apple-Silicon spike state |
| Self-diagnosis recurses to cap | Dagster sub-graph fan-out | scenes are under-detected; lower thresholds or improve prompt list — but check the no-improvement bail first; if it kept going, the metrics are improving even though they end at cap, which is fine |
| Mobile gets 202 but never resolves | Fastify + pipeline-service correlation by traceId | sidecar crashed after launching run; check process supervisor; circuit-breaker should open |
| First capture after `make start` slow | normal | model warm-up; subsequent captures are fast |
| Dagster UI shows runs but sidecar is dead | systems issue | webserver reads DAGSTER_HOME; sidecar writes to it. Restart sidecar. |

`provider-health.service.ts` is rewired to ping pipeline-service
(`/health`), Florence (`/detect/florence/health` if it exists, else
HEAD to root), Ollama (`/api/tags`), and the Grounding-DINO loader
status (exposed by sidecar `/health`). Its summary feeds `/v1/health`.

---

## 9. Mobile capture changes

### 9.1 Capture screen rewrite (`camera_capture_screen.dart`)

Three new on-device passes before upload:

1. **Multi-frame burst** (`burst_capture.dart`) — the user taps once;
   the camera plugin captures **3 frames** at ~100 ms intervals into
   an in-memory buffer.
2. **Quality gating** (`image_quality.dart`) — Laplacian variance for
   blur and RGB histogram for exposure, computed per frame. Frames
   below the blur threshold are kept (we send all 3 anyway) but
   the burst as a whole is rejected if **all** frames fail blur — the
   UI prompts the user to retake.
3. **Face/PII redaction** (`face_redaction.dart`) — ML Kit on-device
   face detector → blur each face's bbox before encoding. Run per
   frame.

**v1 sends all 3 frames in the multipart upload** — this is what makes
multi-frame agreement_score growth real (review §2d). The mobile no
longer "best-frame picks" before sending; the pipeline does the
agreement work across all 3.

**Original-frame disposal:** immediately after WebP encoding, the
original raw frame is overwritten with zeros and the buffer
de-allocated. Only the redacted-and-encoded WebP bytes are retained
in memory until the upload completes. Bbox blur is otherwise
reversible if the original is preserved — this disposal is mandatory.

### 9.2 Upload encoder (`upload_encoder.dart`)

Per-frame: resize (longest edge 1280 px, preserve aspect), encode WebP
at 75 % quality, strip EXIF except orientation. Replaces the current
`image_picker`-only `imageQuality:90` path. After encoding, the original
frame is zeroed (§9.1).

### 9.3 Detection provider simplification (`detection_providers.dart`)

The current state machine has two branches (CoreML on-device + server).
The CoreML branch is removed entirely (per interview Q4). The provider:

- Marks state `loading` (no fast path).
- Calls `repository.detectObjects(burstFiles)` with the 3-frame list.
- Repository handles 200 / 202+poll / retries (kept; multipart now
  carries 3 file parts).
- On `SceneObservation` arrival, persists to Drift v5 schema (§5.3).

CoreML files in `mobile-app/ios/Runner/` and Android equivalents are
deleted as a Phase 6 task. Specific deletion targets:

- `ios/Runner/CoreMLDetector.swift`
- `ios/Runner/CoreMLPlugin.swift`
- `ios/Runner/CoreMLBridge.{m,h}`
- Any `*.mlpackage`, `*.mlmodel` assets under `ios/Runner/Resources/`
- Equivalent Android `*.tflite` assets and `OnDeviceDetector` class
- Any `MethodChannel("coreml/*")` registrations
- The Dart shim that calls them in `detection_providers.dart` (the
  `fastBoxes` branch)

Phase 6 lists this enumeration as an explicit task with a discovery
spike (`grep -r CoreML mobile-app/ios`) to avoid missing platform-
channel boilerplate.

### 9.4 Inventory persistence

Drift v5 schema (§5.3) is rebuilt on first launch. The detection
repository writes per scene:

- one `inventory_items` row (id = sceneId)
- one `scenes` row
- N `detections` rows
- N+ `detection_labels` rows (one per primary + alternate label)
- existing free-form `labels` entries for VLM structured attributes

The FTS index covers `detection_labels.label` so search works
out-of-the-box.

### 9.5 Mobile UI null-handling audit (Phase 6 task)

`item_detail_screen.dart` and any other screen rendering attribute
fields must be audited for `null / empty` handling on every field
in `vlmStructuredAttributes` — because the new contract allows that
field to be `{}` when classification_refine fails through to no
fallback. Checklist item committed as part of Phase 6.

---

## 10. Cleanup / cutover sequencing

The cutover must never leave the system in a half-working state because
the pipeline is the product. Sequencing is updated from the initial
plan: **Phase 5 (delete Temporal) now happens AFTER Phase 6 (mobile
rewrite)** to remove the type-mismatch regression window.

### Phase 1 — pipeline-service skeleton (no model calls)

- Stand up `pipeline-service/` with FastAPI sidecar + Dagster
  Definitions running in-process.
- Implement `frame_intake` (accepts list of frames) and
  `assemble_result` ops only; all middle ops are pass-through stubs
  with explicit empty-set semantics (`box_fusion(empty)→FusedFrame[]`,
  `agreement_scoring(empty)→coverage=0,precision=0`, etc.).
- `POST /runs` accepts a request and returns a working `runId`;
  `GET /runs/:id/wait` long-polls correctly; idempotency works.
- 503 backpressure path tested.
- Model-warm-up startup task in place but stubbed (loads no models
  yet).
- `start-pipeline.sh` health-checks Florence + Ollama before starting.
- DAGSTER_HOME = ~/allmythings-data/dagster; webserver UI runs and
  shows the empty Phase-1 runs.
- Add unit + integration tests for the sidecar contract.

### Phase 2 — wire Fastify to pipeline-service in parallel with Temporal

- Add `pipeline.client.ts` wrapped by `circuit-breaker.ts`.
- Add a feature flag `USE_PIPELINE_SERVICE` (env var on api-service,
  read at startup; mobile is unaffected).
- When the flag is on, `detect.route.ts` uses pipeline.client; when
  off, current Temporal client.
- Smoke test both paths via `make smoke`.
- Lint rule added: dual code paths must be removed in Phase 5;
  CI fails the merge if `USE_PIPELINE_SERVICE` lingers past Phase 5
  acceptance.

### Phase 3 — implement legacy-equivalent ops

- `florence_detect` (HTTP shim of existing detection-service).
- `classification_refine` (Qwen-VL tier chain ported from Temporal,
  Ollama semaphore wired).
- Per-op tests with model fakes.
- Side-by-side regression check on a tiny shared corpus: criterion is
  **same set of primary labels per scene at IoU≥0.5 and roughly
  equivalent count** (NOT metric parity — Temporal's `EnrichedItem`
  lacks `contributingSignals`, so coverage/precision aren't comparable).

At this point the Dagster path produces results equivalent to today's
Temporal path on a single Florence + Qwen tier chain. Run both paths
against the eval corpus; compare label-set Jaccard and detection count.

### Phase 4 — add the new ops (split into 4a/4b/4c/4d)

**4a. Embedding + prompt plumbing.** `scene_embedding`,
`vlm_prompt_expansion`, `crop_embedding`. Verifies DINOv2 + Qwen +
prompt-cache work; includes the embedding-fail / cache-bypass logic.

**4b. Apple-Silicon-risky models.** `grounding_dino_detect`,
`sahi_recovery`, `effsam_segment`. Begins with the §11.1 spike — if
spike fails, alternatives chosen here, contracts unchanged.

**4c. Fusion logic.** `box_fusion`, `cross_pass_dedup`,
`cross_frame_dedup`, label-text-compat encoder + adversarial fixtures.

**4d. Gating math.** `agreement_scoring` (signal-class grouping,
single-source-run flag, empty-set math) + `self_diagnosis` (DynamicOut,
strictness ladder, no-improvement bail-out).

After each sub-phase: rerun `make eval`; record metric movements in a
log committed to the repo at `pipeline-service/eval/changelog.md`.

### Phase 5 — flip the flag, delete Temporal

**Gating preconditions:**

- Phase 6 mobile rewrite is **complete** and the mobile is on the new
  `SceneObservation` shape.
- `make eval` against the captured corpus has been **green for two
  consecutive runs** (Phase 7 corpus exists).

Then:

- `USE_PIPELINE_SERVICE=true` becomes the only path; the flag is
  removed from the codebase.
- Delete `api-service/src/temporal/` and tests.
- Delete `api-service/src/providers/`.
- Delete `api-service/src/schemas/detection.schema.ts`.
- Delete `api-service/src/services/image-quality.service.ts` (image
  quality is now mobile-only).
- Delete `api-service/src/services/translation/` (legacy-shape
  translator no longer needed once mobile is on new shape).
- Drop `TEMPORAL_*` and `TIER_*` env vars.
- **Keep** `api-service/src/utils/circuit-breaker.ts` — wired around
  `pipeline.client.ts`.

**Irreversibility:** Phase 5 is irreversible without a code revert.
The two-consecutive-green-eval gate is the brake.

### Phase 6 — mobile rewrite (happens BEFORE Phase 5)

- Implement `image_quality.dart`, `face_redaction.dart`,
  `burst_capture.dart`, `upload_encoder.dart`.
- Rewrite `camera_capture_screen.dart` for 3-frame burst.
- Simplify `detection_providers.dart` (drop CoreML branch).
- Drift schema rebuild to v5.
- **Audit `item_detail_screen.dart`** for null/empty
  `vlmStructuredAttributes` handling on every field.
- Delete CoreML on-device detector code (enumerated list in §9.3).
- During Phase 6 execution, Fastify keeps the legacy-shape translator
  active so the Temporal path (still alive) can continue serving
  any old mobile builds in the field; once the new mobile build is
  the only one, Phase 5 starts.

### Phase 7 — eval-driven tuning

**Phase 7's first task is "capture starter corpus".** 30 scenes across
5 rooms × 3 angles × 2 captures, each scene = one 3-frame burst.

Then:

- Tune thresholds in `pipeline-service/eval/thresholds.json` and
  `PipelineConfig`.
- Activate CI gating on the corpus's stable subset (until corpus
  exists, `make eval` runs without gating).
- After two green runs in a row, Phase 5 may proceed.

Phases 1–4 can overlap with Phase 6 (different files); Phases 5 and 7
have hard ordering dependencies.

---

## 11. Risks, non-goals, and open decisions

### 11.1 Apple-Silicon viability of new models — spike acceptance criteria

A 1-day spike at the start of Phase 4b verifies all three new models
on a 16 GB M-series Mac. Spike acceptance criteria:

| Model | Acceptance criteria |
| --- | --- |
| Grounding DINO 1.5 Edge | Latency: per-frame inference (image + text encoder) ≤ 2 s on M2 Pro / M3 Pro at 768 px input. Memory: resident ≤ 3 GB. Path: ONNX-Runtime CoreML EP for image encoder; if CPU fallback for BERT text encoder is the only viable route, latency ceiling rises to 3 s before fallback. |
| EfficientSAM-Ti | End-to-end (NOT per-crop): for a 30-box scene at 640 px, total ≤ 2 s. Memory: resident ≤ 1 GB. Mask quality: median IoU with bbox ≥ 0.5 on a hand-curated 5-image fixture set. |
| DINOv2 ViT-B/14 | Per-crop embedding ≤ 80 ms via MLX port. Memory: resident ≤ 1.5 GB. |
| **Total stack ceiling** | (Florence + gdino + EffSAM + DINOv2 + sentence-transformers) total resident memory ≤ 6 GB on a 16 GB Mac (leaves room for Ollama 7b + OS). |

If **any** spike fails, fallbacks (no contract changes):
- Grounding DINO → OWLv2-Base ONNX or YOLO-World-S int8.
- EfficientSAM-Ti → MobileSAM (lower mask quality, simpler).
- DINOv2 ViT-B/14 → DINOv2 ViT-S/14 (384-d, drop the typed dim back to
  384 in `pipeline.ts` and `types.py`).

### 11.2 Agreement-as-truth being self-confirming

Two detectors with overlapping training data will agree on what they
*both* miss. Mitigations:

- **Multi-frame.** v1 sends all 3 burst frames. Each frame is its own
  signal class; they expose different views, lighting, occlusion.
- **Prompt perturbation.** Self-diagnosis Level 1 re-runs prompt
  expansion with a paraphrased Qwen seed; Level 2 uses a different
  Qwen tier (qwen3b) — different model for prompt seeding,
  reducing model monoculture in the prompt set.
- **Multi-class.** Florence + gdino share a class (correct — they're
  both first-pass), but SAHI + frames are independent classes.
- **Single-source-run flag** in agreement_scoring (§3.13) catches the
  pathological case where all the supposed corroboration came
  from one source.
- **Empty-detection-set flag** catches the "coverage=1.0 because no
  detections" case at runtime, not just in eval.
- **Two-seed prompt expansion** (Florence captions + Qwen expansion)
  reduces circularity between prompt source and classifier.

### 11.3 VLM prompt-expansion drift

`vlm_prompt_expansion`'s output is non-deterministic across model
restarts even at low temperature. The plan caches by scene-embedding
hash so similar scenes get the same prompt list, with cache **bypass**
when scene embedding fails. Replay tests pin the cache to make Dagster
runs reproducible.

### 11.4 Self-diagnosis recursion

Bounded by `MAX_RERUNS=2`, `DynamicOut`-materialised in the same DAG
(no daemon, no nested runs), with no-improvement bail-out. Cost ceiling
per scene is documented; eval rig measures `processing_p95` for runs
that recurse vs those that don't.

### 11.5 Drift schema rewrite breaks local data

Per stored memory: app not deployed; acceptable. Rebuild logic deletes
the local DB on first launch when schema version >= 5 is detected and
on-disk version is < 5. No data export needed.

### 11.6 Dagster as in-process vs daemon

**Decision: in-process via FastAPI sidecar.** No Dagster daemon. The
sidecar imports the Dagster `Definitions` and runs jobs via
`materialize()` inside its event loop. Concurrency is gated by an
asyncio Semaphore (default 1). The webserver runs separately as a
read-only UI pointed at the same `DAGSTER_HOME`. This removes a
process from the topology, simplifies `make start`, and still gives
us the lineage UI.

Tradeoffs:
- Pro: simpler ops; no daemon to supervise; faster cold start.
- Con: if the sidecar crashes mid-run, the run shows as "failed" in
  the UI but has no daemon to restart it. The circuit-breaker on the
  Fastify side handles this — Fastify returns 503 fast; sidecar
  is restarted manually or by an external supervisor (out of v1 scope).

### 11.7 Cleanup vs churn

Deleting Temporal removes ~2 k lines of working code with passing
tests. Mitigated by Phase 5/6 ordering and the two-green-eval gate.

### 11.8 Non-goals (explicit)

- **Cross-device sync.** Inventory is mobile-only by user choice
  (interview Q3). A user who reinstalls the app loses local inventory.
- **On-device similarity search.** Drift stores `cropEmbeddingI8` for
  future use, but v1 has no on-device FAISS or brute-force search.
  Re-photographing an existing object will be detected as new;
  the dedup we have is per-capture only.
- **Inter-service auth.** Loopback only between Fastify and FastAPI.
  Single-user Mac threat model.
- **Mobile multi-frame upload optimisation.** v1 sends 3 frames as 3
  multipart parts. v2 may compress them as a single AVIF sequence or
  similar. Not in scope.
- **HEVC / HEIC server-side decoding.** Server expects WebP; iOS HEIC
  is transcoded on device.
- **Service supervisor.** No launchd / systemd integration in v1; the
  `make start` script + manual restart is enough. Scriptable later.
- **Web admin / desktop UI.** Mobile is the only client.

---

## 12. What "done" looks like

When the plan is fully implemented:

1. `make start` brings up Fastify + pipeline-service (with warm-up) +
   Florence-2 + Ollama + LGTM stack + Dagster webserver UI in the
   right order.
2. The phone takes a picture; the burst captures 3 frames; on-device
   blur/exposure pre-check, face redaction, WebP encoding, original
   discard; Mac receives all 3 frames; pipeline runs the full DAG;
   the phone shows the resulting inventory with per-detection
   agreement-calibrated confidence and per-scene "flagged" badges
   where self-diagnosis bailed out.
3. Dagster UI shows lineage from `frame_intake` through
   `assemble_result`, including any DynamicOut self-diagnosis
   fan-out.
4. `make eval` against the local 30-scene corpus prints
   agreement-coverage / agreement-precision / multi-frame-stability /
   self-diagnosis-trigger-rate / op-failure-rate /
   single-source-run-rate / empty-detection-set-rate, and either
   passes or fails per `thresholds.json`.
5. The mobile app's burst capture + on-device gates + face redaction
   + WebP@1280 + multi-frame upload are all live.
6. Drift v5 schema is in place; inventory items have richer detection
   records with int8-quantised embeddings, agreement scores, and
   denormalised `detection_labels` table for FTS.
7. `api-service/src/temporal/`, `api-service/src/providers/`,
   `api-service/src/schemas/detection.schema.ts`, and
   `api-service/src/services/image-quality.service.ts` no longer
   exist. `api-service/src/utils/circuit-breaker.ts` IS kept and
   wired around `pipeline.client.ts`.
8. The CLAUDE.md description of the API service is corrected to
   reflect the new architecture.

---

End of plan.
