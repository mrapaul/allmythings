# Hybrid Multi-Pass Detection Pipeline

**Date:** 2026-04-10
**Status:** Approved
**Supersedes:** 2026-04-08-multi-model-detection-ensemble-design.md

## Problem

The current detection pipeline finds 4 out of 30+ objects in cluttered interior scenes. Single-pass VLM enumeration hits a ceiling of 5-15 objects. Cloud vision APIs (Google Vision, AWS Rekognition) are biased toward dominant objects and cap at ~10 detections. Users will not use an inventory app that misses 85% of their belongings.

## Solution

A two-phase hybrid pipeline:

- **Fast pass (on-device, ~500ms):** YOLOE-11L with SAHI tiling on the Python detection service. Returns 15-20 bounding boxes with coarse labels immediately.
- **Deep pass (cloud VLM, 10-15s):** Multi-pass Gemini 2.5 Flash across 5 image regions (1 overview + 4 overlapping quadrants), with provider cascade to Gemini 2.5 Pro then Claude Sonnet 4. Returns 25-35 objects with rich attributes.

Results from both phases are fused into a single unified inventory. The mobile app displays fast-pass results immediately, then updates with enriched deep-pass results when they arrive.

**Target:** >=25 objects detected on dense interior scenes. Zero hardcoded category lists anywhere in the pipeline.

## Architecture

```
Mobile App
  ↓ POST /v1/detect (multipart image, SSE connection)
API Service (Node.js/Fastify)
  ├─ Phase 1: Fast Pass
  │   ↓ POST /detect/fast to Python detection service
  │   Python Detection Service (MLXBackend)
  │     ├─ YOLOE-11L inference on full image
  │     ├─ SAHI: 4 overlapping tiles (2x2, 20% overlap) + 1 full-image pass
  │     ├─ NMS deduplication (IoU 0.5)
  │     └─ Return detections
  │   ↑ SSE event: fast_pass → mobile app renders boxes immediately
  │
  ├─ Phase 2: Deep Pass (runs concurrently after fast pass dispatched)
  │   MultiPassVlmClassifier
  │     ├─ 5 parallel VLM calls (overview + 4 quadrants)
  │     ├─ Deduplication across passes
  │     ├─ Provider cascade: Gemini Flash → Gemini Pro → Claude Sonnet 4
  │     └─ Return enriched detections
  │   ↑ SSE event: deep_pass → mobile app updates UI
  │
  └─ Fusion: EnsembleFusionService.fuseFastAndDeep()
      ├─ Match fast-pass and deep-pass detections by spatial proximity + label similarity
      ├─ Matched: deep-pass labels/attributes + fast-pass bounding boxes
      ├─ Deep-only: keep as-is with VLM bounding box
      ├─ Fast-only: keep with coarse YOLOE label, no attributes
      └─ SSE event: done (summary stats)
```

## Phase 1: Fast Pass -- YOLOE + SAHI

### Model

YOLOE-11L, an open-vocabulary YOLO variant (~45M parameters). Runs at 30+ FPS on M-series Macs. Loaded once at service startup via `load_fast_models()`, stays resident in memory.

### Detection Prompt

Generic open-vocabulary prompt: `"object . item . thing"`

No hardcoded category lists. YOLOE produces descriptive labels from its training vocabulary (e.g., "vase", "lamp", "book") without being constrained to a predefined set.

### SAHI Tiling

- 4 tiles in a 2x2 grid with 20% overlap
- 1 full-image pass at original resolution
- Total: 5 inference runs per image (~200ms on M4 Pro)
- NMS at IoU threshold 0.5 deduplicates detections at tile boundaries

### Endpoint

`POST /detect/fast` on the Python detection service. Separate from the existing `/detect` legacy endpoint.

### Response Format

```json
{
  "detections": [
    {"box": [x, y, w, h], "label": "vase", "confidence": 0.82, "provider": "yoloe"}
  ],
  "processing_ms": 190,
  "tiles_used": 5
}
```

## Phase 2: Deep Pass -- Multi-Pass VLM Enumeration

### Pass Structure

All 5 passes fire in parallel to minimize latency:

| Pass | Input | Purpose |
|------|-------|---------|
| 1 - Overview | Full image | Enumerate every visible object |
| 2 - Top-left | Top-left 55% crop | Catch objects missed in overview |
| 3 - Top-right | Top-right 55% crop | Same |
| 4 - Bottom-left | Bottom-left 55% crop | Same |
| 5 - Bottom-right | Bottom-right 55% crop | Same |

Quadrants are 55% of the image dimension (not 50%) creating 10% overlap at boundaries to avoid missing objects that straddle quadrant edges.

### Prompt Strategy

The prompt asks the VLM to enumerate every visible object with structured JSON output. No hardcoded category list. The prompt provides the output format with a few examples but explicitly states "use any label and category that fits the object."

Quadrant prompts include: "List all objects visible in this image region."

The overview prompt includes: "Enumerate every visible object in this room. Be exhaustive -- aim for completeness over brevity."

### Provider Cascade

Within the 10-20 second latency budget:

1. Fire all 5 passes to **Gemini 2.5 Flash** in parallel (~4-8s)
2. If total unique objects < 15 after deduplication, retry the overview pass with **Gemini 2.5 Pro** (~5-8s additional)
3. If Gemini is unavailable (API error, timeout), fall back to **Claude Sonnet 4** for the same 5-pass strategy

### Deduplication Across Passes

Objects from quadrant passes are matched against the overview pass:

- **Spatial proximity:** Bounding box center distance < 15% of image dimension
- **Label similarity:** Word overlap scoring (Jaccard similarity on tokenized labels, threshold 0.3). "Ceramic lamp" and "lamp" share "lamp" → match. "Lamp" and "plant" share nothing → no match. Simple, fast, no model dependency in the fusion layer.
- **Both match:** Same object. Keep the higher-confidence version.
- **Neither matches:** New detection. Add to results.

### Structured Output Format (per VLM call)

```json
{
  "objects": [
    {
      "label": "ceramic table lamp",
      "category": "Lighting",
      "bounding_box": [ymin, xmin, ymax, xmax],
      "confidence": 0.9,
      "material": "ceramic, fabric",
      "color": "white, beige",
      "condition": "good",
      "estimated_value_usd": 45
    }
  ]
}
```

Categories and labels are freeform, assigned by the VLM.

## Fusion: Merging Fast + Deep Results

The deep pass is the authority on what objects exist (labels, attributes). The fast pass is the authority on where objects are (precise bounding boxes).

### Merge Rules

1. For each deep-pass object, find the best matching fast-pass detection using spatial proximity (box center distance < 15%) + label similarity (semantic match)
2. **Matched pair:** Deep-pass label/attributes + fast-pass bounding box (YOLOE boxes are spatially more precise than VLM-generated boxes)
3. **Deep-pass only:** Keep as-is with VLM bounding box
4. **Fast-pass only:** Keep with coarse YOLOE label, no enriched attributes

No objects are dropped. The union of both passes is the final result.

### Implementation

New method `fuseFastAndDeep()` on `EnsembleFusionService`, separate from the existing `fuse()` method.

## API Contract

### SSE Streaming (default)

```
POST /v1/detect (multipart image)

event: fast_pass
data: {"phase": "fast", "detections": [...], "count": 17, "processing_ms": 480}

event: deep_pass
data: {"phase": "deep", "detections": [...], "count": 34, "processing_ms": 12400}

event: done
data: {"total": 34, "fast_only": 3, "deep_only": 17, "matched": 14}
```

### Blocking Mode

`POST /v1/detect?mode=full` waits for both phases, returns single JSON with fused results. For testing and non-interactive clients.

### Detection Object Schema

```json
{
  "id": "det_a1b2c3",
  "label": "ceramic table lamp",
  "category": "Lighting",
  "bounding_box": {"x": 0.42, "y": 0.15, "w": 0.08, "h": 0.12},
  "confidence": 0.87,
  "source": "matched | fast_only | deep_only",
  "attributes": {
    "material": "ceramic, fabric",
    "color": "white, beige",
    "condition": "good",
    "estimated_value_usd": 45
  }
}
```

- `source`: one of `"matched"`, `"fast_only"`, `"deep_only"`
- `attributes`: null for `fast_only` objects

## Error Handling

- Fast pass fails: skip it, wait for deep pass only
- Deep pass fails all providers: return fast pass results as final (partial but usable)
- Both fail: return error with image quality diagnostics (blur, brightness, contrast)

## Files to Create or Modify

### API Service (Node.js/TypeScript)

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/services/multi-pass-vlm.classifier.ts` | Multi-pass VLM orchestration with quadrant cropping, dedup, provider cascade |
| Modify | `src/services/detection-pipeline.service.ts` | Rewrite to orchestrate fast/deep phases and SSE streaming |
| Modify | `src/services/ensemble-fusion.service.ts` | Add `fuseFastAndDeep()` method |
| Modify | `src/routes/detect.route.ts` | SSE support, blocking mode query param |
| Modify | `src/config/env.config.ts` | Add Claude API key, multi-pass config (quadrant overlap, retry threshold) |
| Create | `src/providers/claude.classifier.ts` | Claude Sonnet 4 adapter implementing classifier interface |
| Modify | `src/providers/gemini.classifier.ts` | Remove hardcoded 9-category list, update to single-call wrapper |

### Detection Service (Python)

| Action | File | Purpose |
|--------|------|---------|
| Implement | `src/detection_service/backends/mlx_backend.py` | YOLOE-11L loading, inference, SAHI tiling, NMS |
| Create | `src/detection_service/sahi.py` | SAHI tiling utilities (tile generation, coordinate remapping, NMS) |
| Modify | `main.py` | Add `/detect/fast` endpoint routing to MLXBackend |
| Modify | `src/detection_service/config.py` | YOLOE model path, SAHI tile config |

### Tests

| Action | File | Purpose |
|--------|------|---------|
| Create | `api-service/tests/unit/multi-pass-vlm.test.ts` | Dedup logic, provider cascade, quadrant cropping |
| Create | `api-service/tests/unit/fusion-fast-deep.test.ts` | Fast+deep merge scenarios |
| Create | `api-service/tests/integration/sse-detect.test.ts` | SSE event ordering and format |
| Create | `detection-service/tests/unit/test_sahi.py` | Tile coordinates, overlap, NMS |
| Create | `detection-service/tests/integration/test_fast_detect.py` | Real YOLOE inference on test image |

## Success Criteria

- >=25 detections on `test_images/ai_interior.jpg` (currently 4)
- Fast pass results visible in under 1 second
- Deep pass completes within 20 seconds
- Zero hardcoded category lists in the pipeline
- Existing API tests pass (backward compatible via blocking mode)
- No hallucinated objects on sparse scenes (5-10 real objects)

## Test Images

- `test_images/ai_interior.jpg` -- dense room, 30+ objects (primary benchmark)
- Add sparse room image (5-10 objects) -- verify no hallucinations
- Add kitchen scene -- many small items on counters
- Add bookshelf scene -- many similar objects tightly packed

## Cost Estimates

Per image at steady state:
- Fast pass (on-device): $0
- Deep pass (5x Gemini Flash): ~$0.015-0.04
- With Pro retry (~20% of images): ~$0.02-0.06 average

At 1000 images/day: $20-60/day for cloud VLM costs.
