# Working Vertical Slice: End-to-End Home Inventory

**Date:** 2026-04-16
**Status:** Approved
**Goal:** Get the app fully working end-to-end so incremental improvements can start

## Problem Statement

Nothing works end-to-end. The system has ~4,200 lines of service code, a Flutter app, eval harness, and OTel instrumentation — but the actual product loop (camera -> detect -> classify -> persist -> browse) has never completed successfully. Services don't start reliably together, mDNS discovery is flaky, there's no durable photo storage, and the pipeline breaks under real usage.

## Approach: Vertical Slice

Strip to one guaranteed working path. Single `make start` launches everything. Only after this works end-to-end do we re-enable advanced features.

## Target Environment

- Local Mac only (no Docker, no cloud, no SSL)
- Physical iPhone on same WiFi as Mac
- All AI models run locally on Mac (Ollama + Python services)

## Success Criteria

1. `make start` brings up all services with health gates
2. Open app on iPhone -> point camera at room -> see detected items with labels -> edit -> save to inventory -> browse/search later
3. Photos persist across sessions
4. Pipeline handles edge cases gracefully (bad photos, timeouts, too many items)
5. Every request is traceable via trace_id across all services

---

## Detection Strategy: Florence-2 + Qwen (Zero Hardcoded Labels)

### Why This Combination

Accuracy is non-negotiable. Everything must be AI-generated — no hardcoded class lists, labels, categories, or taxonomies.

| Model | Role | Size | License | Runs on Mac |
|-------|------|------|---------|-------------|
| Florence-2 Large (`microsoft/Florence-2-large`) | Detect + caption all objects | 770M / 1.5GB | MIT | Any M-series |
| Qwen2.5-VL 7B via Ollama (upgrade to Qwen3-VL 8B when stable) | Rich structured attributes per object | 7B / ~5GB quantized | Apache 2.0 | 16GB+ M-series |

### What This Replaces

- OWLv2 with hardcoded `household-classes.txt` -> Florence-2 `<DENSE_REGION_CAPTION>` (no class list)
- YOLO11n (AGPL licensed) -> Florence-2 (MIT) — solves the license problem
- All hardcoded label files -> deleted entirely

### Detection Pipeline

```
[Photo from iPhone]
    |
    v
[Florence-2 -- <DENSE_REGION_CAPTION>]  (detection-service, ~2-3s)
    | finds all objects, generates caption per region
    | returns: [{bbox, caption: "wooden desk lamp"}, ...]
    | NO class list. AI decides what's there.
    |
    v
[Qwen 7B -- per-crop enrichment]  (Ollama, ~1-2s each)
    | input: cropped image region + Florence caption as context
    | returns structured JSON: {name, category, color, material,
    |   condition, estimated_value, description, search_tags}
    | all fields AI-generated
    |
    v
[Assembled Result]
    items: [{label: AI, category: AI, attributes: AI, bbox: AI}]
```

### Models to Benchmark via Eval Harness

| Model | Why test it |
|-------|------------|
| Florence-2 Large | Primary detector — must beat OWLv2's 77.2% recall |
| Qwen3-VL 2B | If it matches Qwen2.5-VL-7B at 3x less memory, prefer it |
| Grounding DINO Tiny | Backup detector if Florence-2 bbox precision falls short |

---

## End-to-End Product Flow

```
[iPhone Camera]
    | user takes photo
    v
[Flutter App]
    | on-device quality gate (<100ms):
    |   - resolution >= 640px
    |   - not too dark (luminance check)
    |   - not blurry (Laplacian variance)
    | rejects bad photos instantly with actionable feedback
    | compresses: max 1920px longest edge, JPEG 85%
    |
    | POST /v1/detect (multipart image upload)
    | shows spinner: "Analyzing your room..."
    v
[API Service (Node/Fastify :14000)]
    | PipelineExecutor runs:
    |   1. save-photo     -> ~/allmythings-data/photos/{uuid}.jpg
    |   2. florence-detect -> detection-service :14001
    |   3. qwen-enrich    -> Ollama (per crop, batched)
    |   4. assemble       -> response JSON
    v
[Flutter App]
    | receives: {photo_id, photo_url, items: [{label, attributes, bbox}...]}
    | presents: scrollable list of detected items
    | each item shows: label, description, editable fields
    | user edits/removes/confirms items
    | taps "Save to Inventory"
    v
[Local SQLite via Drift]
    | persists: inventory_items + photo reference
    | browsable/searchable in feed screen
```

### Response Format

```json
{
  "photo_id": "uuid",
  "photo_url": "/photos/uuid.jpg",
  "item_count": 12,
  "items": [
    {
      "id": "uuid",
      "label": "Brass desk lamp",
      "confidence": 0.87,
      "bbox": {"x": 0.12, "y": 0.34, "width": 0.15, "height": 0.22},
      "attributes": {
        "name": "Brass desk lamp",
        "category": "lighting",
        "color": "gold/brass",
        "material": "metal",
        "condition": "good",
        "estimated_value": "40-60 EUR",
        "description": "Modern brass desk lamp with adjustable arm",
        "search_tags": ["brass", "lamp", "desk", "lighting", "metal"]
      }
    }
  ],
  "errors": [],
  "trace_id": "abc123",
  "processing_ms": 8420
}
```

---

## Edge Case Handling

| Scenario | Handling |
|----------|----------|
| Bad photo (blurry, dark, too small) | On-device quality gate rejects instantly. Message: "No items detected. Try a clearer photo with better lighting." |
| API unreachable | Health check on app launch. If Mac server not found via mDNS: "Can't find server. Make sure both devices are on the same WiFi." Retry button. |
| Too many items (>30 objects) | Cap Qwen enrichment at 25 items sorted by confidence. Remaining items show Florence caption only. User can tap to enrich individually. |
| Qwen timeout/crash on one item | Pipeline continues for remaining items. Failed items show Florence label only with "Retry enrichment" option. |
| Duplicate detections | Florence NMS + overlap dedup at API layer (IoU > 0.5 = merge). |
| Photo persistence fails | Fail the entire request — no orphan metadata without photos. |
| Zero detections | Show message: "No items found. Try photographing from a different angle or with better lighting." |
| Ollama not running | `make start` health gate catches this. API /v1/health reports ollama: down. App shows server health warning. |

---

## Startup Automation

### `make start` — Sequential with Health Gates

```
make start
    |
    +-- 1. Start detection-service (Python/FastAPI on :14001)
    |     wait: GET /health returns 200
    |     timeout: 60s (first run downloads Florence-2 model ~1.5GB)
    |
    +-- 2. Start Ollama + ensure qwen2.5vl:7b is pulled
    |     wait: ollama list shows model loaded
    |     timeout: 120s (first run downloads ~5GB model)
    |
    +-- 3. Start api-service (Node/Fastify on :14000)
    |     wait: GET /v1/health returns 200
    |           AND health.detection_service = "up"
    |           AND health.ollama = "up"
    |     timeout: 30s
    |
    +-- 4. Advertise via Bonjour/mDNS
    |     iPhone discovers "allmythings._http._tcp.local"
    |
    +-- "All services ready. Open the app on your iPhone."

make stop
    +-- kills all three processes cleanly (SIGTERM, wait, SIGKILL)
    +-- PID files: /tmp/allmythings-{service}.pid

make status
    +-- shows: detection-service ok/down, ollama ok/down, api-service ok/down

make logs
    +-- tails combined structured logs from all services
```

Implementation: shell script `scripts/start-all.sh` using background processes with PID tracking. No Docker, no Compose.

---

## Photo Persistence & Inventory Storage

### Server-Side Photo Storage

```
~/allmythings-data/
    photos/
        {uuid}.jpg          <- original photo from iPhone
        {uuid}_thumb.jpg    <- 400px thumbnail for feed
```

- API service saves original upload before any processing
- Generates thumbnail for mobile feed
- Serves photos via Fastify static file serving
- Photo save is pipeline step 1 — if it fails, nothing else runs

### Mobile Inventory Storage (Drift/SQLite)

```sql
inventory_items
    id              TEXT PRIMARY KEY
    photo_id        TEXT (FK to photos)
    label           TEXT (AI-generated, user-editable)
    category        TEXT (AI-generated, user-editable)
    description     TEXT (AI-generated, user-editable)
    color           TEXT
    material        TEXT
    condition       TEXT
    estimated_value TEXT
    search_tags     TEXT (comma-separated, AI-generated)
    bbox_x          REAL
    bbox_y          REAL
    bbox_w          REAL
    bbox_h          REAL
    confidence      REAL
    created_at      INTEGER
    updated_at      INTEGER

photos
    id              TEXT PRIMARY KEY
    local_path      TEXT (on-device cached copy)
    server_path     TEXT (Mac server path)
    width           INTEGER
    height          INTEGER
    created_at      INTEGER
```

All labels, categories, descriptions, and search tags are AI-generated and user-editable. No enums, no fixed taxonomies.

---

## Pipeline Orchestration

### PipelineExecutor Pattern

```typescript
PipelineExecutor.run("detect-inventory", {
  steps: [
    { name: "save-photo",     fn: savePhoto,       retry: 0, timeout: 5_000  },
    { name: "florence-detect", fn: florenceDetect,  retry: 2, timeout: 30_000 },
    { name: "qwen-enrich",    fn: qwenEnrichBatch, retry: 1, timeout: 60_000 },
    { name: "assemble",       fn: assembleResult,   retry: 0, timeout: 2_000  },
  ],
  onStepError: "continue",   // partial results OK
  trace: true,               // OTel spans per step
})
```

Each step:
- Has explicit timeout and retry count
- Returns `StepResult<T>` (existing Ok | Err union)
- Gets its own OTel span (existing `withSpan` helper)
- Logs entry/exit with timing via structured Pino logs

### Retry Policy

| Step | Retries | Backoff | Rationale |
|------|---------|---------|-----------|
| Photo save | 0 | -- | Local filesystem; if it fails, something is very wrong |
| Florence detect | 2 | 1s, 3s | Network call to detection-service; transient failures possible |
| Qwen enrich (per item) | 1 | 2s | Ollama can crash on bad input; one retry usually works |
| Qwen enrich (batch) | 0 | -- | Individual items retry; batch doesn't re-run successes |

---

## Observability

### Request Tracing

Every request gets a `trace_id` that flows through all services:

```
Flutter app (shows trace_id in error UI)
  -> API service (Pino logs with trace_id)
    -> Detection service (Python logs with trace_id)
    -> Ollama (request logged with trace_id)
```

Debug any failure: `make logs | grep <trace_id>`

### Lightweight Observability Stack

| Concern | Tool | Notes |
|---------|------|-------|
| Request tracing | OTel -> HyperDX (optional single container) | Web UI at localhost:8080 |
| Structured logs | Pino (Node) + Python logging | JSON, queryable |
| Pipeline failures | `errors[]` in response + log aggregation | Error type, retry count, duration, trace ID |
| Health dashboard | `make status` + GET /v1/health | CLI + API-queryable |

### Eval Gating

Existing eval harness (`make eval-ci`) gates commits against baseline recall. Florence-2 must be benchmarked and baselined before replacing OWLv2.

---

## Architecture Diagram

```
+---------------------------------------------------+
|                  iPhone (WiFi)                     |
|                                                    |
|  Flutter App                                       |
|  +-- Camera -> on-device quality gate              |
|  +-- POST /v1/detect -> Mac server via mDNS        |
|  +-- Edit results screen (list view, editable)     |
|  +-- Save to Drift SQLite (offline inventory)      |
|  +-- Browse/search inventory feed                  |
|                                                    |
+------------------------+---------------------------+
                         | HTTP (mDNS discovered)
                         v
+---------------------------------------------------+
|              Mac (all local processes)              |
|                                                    |
|  api-service (Node/Fastify :14000)                 |
|  +-- POST /v1/detect                               |
|  |   PipelineExecutor:                             |
|  |   1. save-photo    -> ~/allmythings-data/photos  |
|  |   2. florence-detect -> detection-service        |
|  |   3. qwen-enrich    -> Ollama (per crop)        |
|  |   4. assemble       -> response JSON            |
|  +-- GET /v1/health (aggregated)                   |
|  +-- GET /photos/{id}.jpg (static serving)         |
|  +-- OTel spans + Pino structured logs             |
|  +-- Bonjour/mDNS advertisement                    |
|                                                    |
|  detection-service (Python/FastAPI :14001)          |
|  +-- POST /detect/florence                         |
|  |   Florence-2 <DENSE_REGION_CAPTION>             |
|  |   returns: [{bbox, caption}...]                 |
|  +-- GET /health                                   |
|  +-- OTel + structured logging                     |
|                                                    |
|  Ollama (:11434)                                   |
|  +-- qwen2.5-vl:7b (or qwen3-vl when stable)      |
|                                                    |
|  Optional: HyperDX container (:8080)               |
|  +-- traces + logs dashboard                       |
|                                                    |
+---------------------------------------------------+
```

---

## Explicitly Out of Scope

- Docker/cloud deployment
- SSE streaming (synchronous request/response for v1)
- Ensemble fusion / multi-provider fallback
- CoreML on-device detection (future optimization with Apple FastVLM)
- Android support
- User authentication
- Real-time bounding box preview
