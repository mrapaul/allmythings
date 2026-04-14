# Inventory Architecture — Accuracy-First, Observable-First Rebuild

**Status:** Design spec, ready for implementation plan
**Date:** 2026-04-14
**Author:** Claude (synthesizing research from two subagents + local POC evaluation)
**Supersedes:** 2026-04-13-accuracy-first-three-tier-detection.md (the ad-hoc three-tier plan that led to the 30-iteration debug loop)

## Goal (One Sentence)

Photograph a room, get a structured inventory of every item with accurate labels, attributes, and counts — verifiable by an offline eval harness before anything touches the phone.

## Why This Rebuild

The previous plan worked functionally but produced a debugging nightmare: 30+ deploy-test-fail cycles on the phone. Root cause analysis from the orchestration subagent:

> **The real problem is not a missing orchestrator. It is (a) silent error swallowing in the Node.js pipeline and (b) no OTel spans on the Node.js side.** The 30-iteration debug cycle is almost entirely explained by `runFastPass` and `runDeepPass` catching all errors and returning `null` — the Ollama 500 never surfaced in any trace or visible error response.

Secondary issues that the eval loop revealed:

- `qwen2.5vl:3b` is less stable than `qwen2.5vl:7b` and slower in practice (GGML crashes → retries → 58s vs 20s)
- Default Ollama context is 128K → 30GB VRAM allocation; needs `num_ctx: 4096`
- Bounding boxes from qwen2.5vl come as pixel coords, not normalized 0-1
- Xcode-compiled CoreML is `.mlmodelc`, not `.mlpackage` (runtime lookup was wrong)
- **We are using Ultralytics YOLO11n which is AGPL-3** — a commercial-deployment blocker, per SOTA subagent

## Architecture Overview

```
┌──────────────────────────────┐
│ iPhone (Tier 1, <50ms/frame) │
│                              │
│  Camera viewfinder           │
│   ├── YOLOv10-S CoreML       │  (MIT, replaces AGPL YOLO11n)
│   └── Real-time count gauge  │  warns if >12 items in frame
│                              │
│  User taps "Capture"         │
│   └── upload image + hint    │──┐
└──────────────────────────────┘  │
                                  │
┌─────────────────────────────────▼────────────────────────────┐
│ Mac Mini server (Tier 2, 1-15s/photo)                        │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Fastify API: POST /v1/photos                            │ │
│  │  └── pg-boss.send('detect', { photoId })                │ │
│  │      creates durable job → returns 202 { photoId }      │ │
│  └──────────────┬──────────────────────────────────────────┘ │
│                 │                                             │
│  ┌──────────────▼──────────────────────────────────────────┐ │
│  │ pg-boss worker: detect handler                          │ │
│  │                                                          │ │
│  │  OTel span: detection.pipeline (photoId, retryCount)    │ │
│  │   │                                                      │ │
│  │   ├── span: open_vocab_detect                           │ │
│  │   │   OWLv2-base-ensemble (Apache, ~400ms, 0.8GB)       │ │
│  │   │   returns [box, class] per household prompt list    │ │
│  │   │                                                      │ │
│  │   ├── span: attribute_extract (per box, parallel)       │ │
│  │   │   Qwen2.5-VL-7B-MLX-4bit (Apache, ~600ms/crop, 5GB) │ │
│  │   │   returns {label, color, material, condition,       │ │
│  │   │            count, value_estimate, brand?}           │ │
│  │   │                                                      │ │
│  │   └── span: write_inventory                             │ │
│  │       drift-style per-item records, not per-photo        │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  GET /v1/photos/:id/events  (SSE)                             │
│    streams pg-boss job.completed / failed events              │
│    → phone shows live progress + final inventory              │
│                                                               │
│  Observability: HyperDX (single container, OTLP-native)       │
│    traces, logs, and job state in one UI                      │
└───────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Eval harness (offline, runs in CI or manually)               │
│                                                               │
│  eval/fixtures/*.jpg    — 4 photos + future additions         │
│  eval/oracle/*.json     — gold labels per fixture             │
│  eval/harness.mjs       — runs any model tag against fixtures│
│                          scores recall, latency, crash rate  │
│  eval/report-*.json     — leaderboard snapshot per run        │
│                                                               │
│  Used to: validate Qwen prompt changes, swap models,          │
│           catch regressions BEFORE deploying to phone.        │
└───────────────────────────────────────────────────────────────┘

Tier 3 (optional oracle, not in runtime path)
  Claude Sonnet 4.5 / Gemini 2.5 Pro — called manually from the
  eval harness to generate or refresh oracle gold labels for new
  fixture photos. Never in the user request path.
```

## Key Decisions (with Rejected Alternatives)

### 1. Orchestration: pg-boss, not Temporal

| Option | Rejected? | Why |
|---|---|---|
| **pg-boss** | ✅ chosen | npm package, uses existing Postgres, ~15KB, retries + DLQ + replay built in |
| Temporal | reject | 5 containers, 600MB+ RAM idle, Cassandra tuning — overkill for 10-100 photos/day |
| Restate | reject | Python SDK immature, our detection-service is Python |
| Inngest | reject | Cloud-dependent in prod, breaks air-gap on home WiFi |
| DIY BullMQ/Redis | reject | We don't run Redis; adding it when Postgres already exists is strictly worse |

### 2. Observability: OTel → HyperDX, not a 5-container stack

| Option | Chosen? | Why |
|---|---|---|
| **@opentelemetry/sdk-node in api-service + HyperDX** | ✅ chosen | Single container, OTLP-native, perfect for "find what happened to photo X" |
| Jaeger + Prometheus + Grafana + Alertmanager + Loki + Promtail (current) | reject | ~600MB idle, too many UIs, fragmented |
| SigNoz | consider later | Also single container, good alternative if HyperDX UX disappoints |

**Critical fix:** the Node.js `api-service` currently emits **zero OTel spans**. The Python detection-service already does. Adding spans to the Node.js side + propagating W3C `traceparent` across the HTTP boundary gives end-to-end traces per photo — which makes the 30-iteration debug loop impossible to repeat.

### 3. On-Device Model: YOLOv10-S CoreML, not YOLO11n

| Option | Chosen? | License | Notes |
|---|---|---|---|
| **YOLOv10-S (MIT)** | ✅ chosen | MIT | 46.3 mAP COCO, ~12ms on A17, license-clean for commercial |
| YOLO11n (Ultralytics) | **reject** | **AGPL-3** | Current choice. AGPL is a blocker if we ever go commercial. |
| Apple Vision `VNRecognizeObjectsRequest` | keep as prior | SDK | ~1000 ImageNet classes, too coarse for rich inventory |
| Florence-2 CoreML | consider later | MIT | Bigger, slower, but gives captions + boxes in one pass |

### 4. VLM: Qwen2.5-VL-**7B**-MLX-4bit, not :3b

Eval results on our 4 fixture photos:

| Model | Recall | Items | Latency | Fails |
|---|---|---|---|---|
| **qwen2.5vl:7b** (Ollama) | **64.3%** | 10.5 | 19.8s | 0/4 |
| qwen2.5vl:3b (Ollama) | 57% | 10 | **58s** (GGML crashes → retries) | 0/4 |
| llava:latest | 44.6% | 10 | 11.4s | 0/4 |
| moondream:latest | 4.5% | 0.8 | 4s | 0/4 |

Counter-intuitive finding: the smaller 3B model is **slower in practice** because it crashes with `GGML_ASSERT` and our retry+warmup recovery kicks in. 7B is stable and faster end-to-end.

**Future model swap (flagged for re-benching):** Qwen2.5-VL-32B-MLX-4bit (20GB, fits in 48GB unified memory alongside OWLv2), Qwen3-VL (successor, 2025-H2), InternVL3.5.

### 5. Hybrid Pipeline: OWLv2 (boxes) → Qwen-VL (attributes)

Current Ollama-only path has a hard accuracy ceiling (~64% recall) because the VLM is doing detection + attribute extraction in one shot. Splitting:

1. **OWLv2-base-ensemble** (Apache, 0.8GB, ~400ms): open-vocab detection against a **household prompt list** (~200 classes we define: sofa, floor lamp, throw pillow, potted plant, …). Emits boxes.
2. **Qwen2.5-VL-7B** on each cropped box (~600ms/crop, parallelized): extracts attributes as structured JSON.

Expected wall-clock for 8-item room photo: 0.4s OWLv2 + 8×0.6s (parallel batch) ≈ 3-4s. Down from current 13-28s.

Expected recall gain: OWLv2 catches items the VLM's "list everything" prompt misses because OWLv2 is explicitly trained for open-vocab detection.

### 6. Data Model: Per-Item Records, Not Per-Photo with Labels

**Current:** `inventory_items` table stores one row per photo with a JSON blob of detections → can't search, count, or edit individual items. A single photo card on the feed represents many things.

**New:**

```sql
-- Photos are sources; items are the first-class objects.
CREATE TABLE photos (
  id UUID PRIMARY KEY,
  captured_at TIMESTAMPTZ,
  thumbnail_path TEXT,
  original_path TEXT,
  detection_job_id TEXT,  -- pg-boss job FK
  status TEXT  -- 'pending' | 'processing' | 'done' | 'failed'
);

CREATE TABLE items (
  id UUID PRIMARY KEY,
  photo_id UUID REFERENCES photos(id),
  label TEXT NOT NULL,
  category TEXT,
  colors TEXT[],
  materials TEXT[],
  condition TEXT CHECK (condition IN ('excellent','good','fair','poor')),
  count INT NOT NULL DEFAULT 1,
  estimated_value_low NUMERIC,
  estimated_value_high NUMERIC,
  brand TEXT,
  model TEXT,
  -- Cropped thumbnail for this specific item
  thumbnail_path TEXT,
  -- Normalized bbox within the source photo
  bbox_x NUMERIC, bbox_y NUMERIC, bbox_w NUMERIC, bbox_h NUMERIC,
  -- User overrides
  user_confirmed_at TIMESTAMPTZ,
  user_edited BOOLEAN DEFAULT FALSE
);

CREATE INDEX items_label_fts ON items USING gin(to_tsvector('english', label || ' ' || category));
```

Mobile UI changes: inventory feed shows **items**, not photos. Tapping an item opens edit view. Tapping the source photo shows all items detected in it.

### 7. Real-Time Camera Limits

On iPhone viewfinder (YOLOv10-S running every frame):
- Count visible objects
- If `count > 12`, show banner: *"Too many items in frame — step closer or frame fewer items for better accuracy."*
- Capture button disabled at `count > 20` (hard cap) with message *"Split into multiple photos."*

This keeps each photo under the VLM's reliable detection ceiling.

### 8. Error Propagation (THE critical fix)

**Current code pattern (the real culprit):**

```typescript
// detection-pipeline.service.ts
private async runFastPass(image: Buffer) {
  try {
    return await this.fastDetector.detect(image);
  } catch (error) {
    logger.warn({ error }, 'Fast pass failed');
    return null;  // 💥 caller sees null, no idea why
  }
}
```

**New pattern:**

```typescript
type StepResult<T> =
  | { ok: true; value: T; durationMs: number }
  | { ok: false; error: { code: string; message: string; retryable: boolean; cause?: unknown }; durationMs: number };

private async runFastPass(image: Buffer): Promise<StepResult<FastPassDetections>> {
  const span = tracer.startSpan('detection.fast_pass');
  const start = Date.now();
  try {
    const value = await this.fastDetector.detect(image);
    span.setStatus({ code: SpanStatusCode.OK });
    return { ok: true, value, durationMs: Date.now() - start };
  } catch (error) {
    const coded = classifyError(error);
    span.recordException(error as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: coded.message });
    return { ok: false, error: coded, durationMs: Date.now() - start };
  } finally {
    span.end();
  }
}
```

Every step's success or failure becomes a first-class value with a span. The pipeline's outermost caller aggregates `StepResult`s into a `PipelineResult` that includes which steps ran, which failed, and structured error reasons.

## Implementation Phases

### Phase 1 — Observability + Error Propagation (2-3h, highest leverage)
Fix the root cause of the 30-iteration debug loop. No model changes, no new infra.

- Add `@opentelemetry/sdk-node` to `api-service`
- Wrap each pipeline step (`runFastPass`, `runDeepPass`, `fuse`) in a span with photoId, retry attempt, backend, error code
- Propagate `traceparent` to the Python detection-service (already emits spans; we just need to link)
- Replace `catch → return null` with `StepResult<T>` union everywhere
- Swap Jaeger + 5-component stack for single HyperDX container
- **Definition of done:** a photo that fails shows up as a red trace in HyperDX with the exact failing step and error code visible.

### Phase 2 — Eval Harness, Production-Grade (1-2h)
Promote today's prototype to a first-class test suite.

- Move `eval/` from throw-away scripts to a versioned harness with:
  - `eval:oracle` — updates oracle labels using Claude/Gemini API (when keys provided)
  - `eval:candidates` — runs all configured models against all fixtures
  - `eval:report` — generates markdown + JSON leaderboard
  - `eval:ci` — fails CI if recall regresses below baseline
- Add fixture photos as the project accumulates them (pull from `devicectl` automation)
- Wire into `make test` so every PR runs the eval

### Phase 3 — Swap Qwen 3b → 7b + prompt refinement (1-2h)
Measured accuracy win: 57% → 64% recall. Stability improvement: 0 crashes vs. ~20% crash rate.

- `OLLAMA_MODEL=qwen2.5vl:7b` in `.env`
- Re-tune prompt using eval harness iteratively (target 75%+ recall on current fixtures)
- Document baseline recall in the spec below; CI fails if a PR regresses it

### Phase 4 — Hybrid OWLv2 + Qwen (4-6h)
The big accuracy step: split detection from attribute extraction.

- Stand up OWLv2-base-ensemble in a new container (`detection-service` Python can host it; already has transformers ecosystem)
- Define household prompt list (~200 household categories) as a config file
- Rewrite `detection-pipeline.service.ts`:
  1. OWLv2 yields N boxes
  2. Crop each box via `sharp`
  3. Parallel-batch Qwen2.5-VL-7B on all crops
  4. Deduplicate, write items
- Target: ≥85% recall on fixture set, <6s p95 wall-clock for an 8-item room

### Phase 5 — pg-boss, durable jobs (3-4h)
Photo upload becomes a durable job, not a blocking HTTP call.

- Add `pg-boss` to `api-service`
- New route `POST /v1/photos` — enqueues job, returns `202 { photoId, jobId }` immediately
- Worker subscribes to `detect` queue, runs pipeline, writes items
- New route `GET /v1/photos/:id/events` — SSE stream of job state transitions
- Mobile app: upload, then subscribe to SSE; show live progress
- **DLQ behavior:** failed jobs stay in `pgboss.job` with status=failed; mobile shows "retry" button

### Phase 6 — iPhone model swap + real-time count (3-4h)
- Export YOLOv10-S to CoreML (replaces AGPL YOLO11n)
- Wire into viewfinder for real-time count
- Show count gauge + "too many items" banner at >12 objects
- Capture disabled at >20
- Remove the current blocking three-tier flow — replaced by SSE from server

### Phase 7 — New Data Model + UI (6-10h)
The big UI/DB change. Must land AFTER Phase 5 so the durable job writes the new shape from the start.

- Drift migration: new `photos` + `items` tables (no migration of old data — app not deployed)
- Update `inventory_repository.dart` to query items
- Rework inventory feed: grid of items, not photos
- Item detail view with inline edit of label/color/material/condition/count/value
- "Show source photo" links back to the photo + all sibling items

### Phase 8 (optional) — Qwen2.5-VL-32B swap
If Phase 4 (OWLv2 + 7B) doesn't hit 85% recall, swap Qwen 7B → 32B (MLX-4bit, 20GB). Both 32B and OWLv2 fit in 48GB unified memory simultaneously.

## Success Criteria

| # | Criterion | How Verified |
|---|---|---|
| 1 | Any photo that fails in production shows up as a red trace in HyperDX with the failing step and error code visible within 30 seconds | Manual: kill Ollama mid-request, upload photo, check HyperDX |
| 2 | Eval harness runs in <5 minutes end-to-end against all current fixtures and all configured candidate models | `time node eval/harness.mjs ...` |
| 3 | ≥85% average recall against oracle on fixture set | Eval report |
| 4 | Zero Ollama GGML_ASSERT crashes in 50 consecutive eval runs | `for i in $(seq 1 50); do ...` |
| 5 | p95 pipeline latency <6s for photos with ≤12 items | OTel metrics |
| 6 | Mobile app never shows "failed" when CoreML found items (fallback works even when Mac is unreachable) | Airplane-mode test on phone |
| 7 | Inventory feed shows per-item records, not per-photo; search finds items by label or attribute | Manual UI test |
| 8 | No AGPL-licensed model in production bundle (iOS or server) | `grep -r "ultralytics\|AGPL" .` |

## Platform Strategy: iPhone First, Android-Ready

The mobile architecture targets both iPhone and Android; iPhone ships first. Choices that keep Android viable:

- **Tier 1 model format:** YOLOv10-S gets exported to **both** CoreML (iPhone) and TFLite or ONNX Runtime Mobile (Android). The Dart `CoreMLDetector` becomes `OnDeviceDetector` with platform-specific handlers behind one MethodChannel interface. Apple Vision remains iPhone-only as a platform-specific enhancement.
- **API surface is platform-agnostic:** SSE streaming + JSON works identically on both platforms. The `DetectionRepository` already uses Dio (cross-platform).
- **mDNS service discovery:** the Mac server's Bonjour broadcast is consumed by iPhone's `NetServiceBrowser`; Android uses `NsdManager` — same service name (`allmythings-server`), same `_http._tcp.` type, different native APIs behind one Dart interface.
- **Local network permission prompts:** iOS has `NSLocalNetworkUsageDescription`; Android 12+ needs `android.permission.ACCESS_WIFI_STATE` + runtime prompt for local network. Both wrapped in one `permissions_handler` flow.
- **Drift ORM:** already works identically on both platforms.
- **Camera:** the `camera` Flutter plugin supports both. Real-time YOLO inference runs via MethodChannel to native code on each platform.

Android-specific work deferred to a follow-up plan after iPhone ships: TFLite conversion, Android native handlers for both MethodChannels, Android manifest permissions, Play Store submission. No architecture decision in this spec should require rework for Android; if one does, call it out during review.

## What's Explicitly Out of Scope

- Multi-user / multi-tenant (this is a personal-use home inventory)
- Real-time video analysis (only still photos)
- Voice input or smart assistant integration
- Cloud sync (local-first; backup is a later question)
- Fine-tuning a custom LoRA (may come later, not phase 1-8)

## References

- `/tmp/research_vlm.md` — full SOTA VLM survey (subagent output)
- `/tmp/research_orchestration.md` — full orchestration survey (subagent output)
- `eval/report-2026-04-14-16-40-05.json` — baseline eval leaderboard
- `eval/oracle/*.json` — oracle gold labels for fixture photos
- `eval/harness.mjs` — prototype eval harness

---

*Design spec ready. Next step: `superpowers:writing-plans` to create the implementation plan.*
