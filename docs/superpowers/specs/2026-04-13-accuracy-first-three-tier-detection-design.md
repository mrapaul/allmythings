# Accuracy-First Three-Tier Detection Design

**Date:** 2026-04-13
**Status:** Approved
**Supersedes:** 2026-04-10-hybrid-multipass-detection-design.md
**Priority:** Accuracy is paramount — every design choice is evaluated against detection completeness and attribute quality

---

## Problem Statement

The mobile app always fails on physical iPhone with an exclamation mark. Root cause: `AppConfig.apiBaseUrl` returns `http://localhost:14000` on iOS, which resolves to the phone itself rather than the Mac. Beyond this immediate failure, the current pipeline produces generic coarse labels with many objects undetected — unacceptable for a home inventory app where completeness and specificity matter.

---

## Architecture Overview

```
iPhone (Flutter App)
├── Tier 1 — On-device CoreML (instant, ~50ms, always available, offline)
│     YOLO11n.mlpackage on Neural Engine
│     Shows bounding boxes immediately
│
└── Tier 2 — Mac local network (deep pass, ~8–15s, LAN only)
      ┌─ Discovery: mDNS resolves allmythings-server.local automatically
      ↓
      API Service (Node.js :14000)
      │
      ├── Detection Service (Python :14001)
      │     YOLOE + SAHI 3×3 tiling — spatial precision, precise boxes
      │
      └── Ollama + MLX (:11434)
            Qwen2.5-VL:7b — multimodal VLM
            Full image + per-region crops → rich attributes
            (brand, model, colors, materials, condition, estimated value)
            Gemma 4 = one-line swap when available in Ollama

            ↑ fallback if Mac unreachable ↑
            Tier 3 — Gemini 2.5 Flash (cloud, only when Mac not found)
```

**Detection flow:**
1. User takes photo → CoreML runs immediately on-device → bounding boxes appear (~50ms)
2. App simultaneously attempts mDNS discovery of Mac (2s timeout)
3. If Mac found: image sent to detection service → YOLOE+SAHI refines boxes → Qwen2.5-VL enriches with attributes
4. Results stream back via SSE — UI updates in place as each object finishes
5. If Mac not found within 2s: Gemini 2.5 Flash fires instead (same SSE interface)
6. If Gemini also fails: CoreML results shown with "offline mode" badge — no exclamation mark

---

## Immediate Fix

**File:** `mobile-app/lib/core/config/app_config.dart`

Replace the hardcoded `http://localhost:14000` iOS fallback with mDNS resolution:

```dart
static Future<String> resolveApiBaseUrl() async {
  const String envUrl = String.fromEnvironment('API_URL');
  if (envUrl.isNotEmpty) return envUrl;
  if (kIsWeb) return 'http://localhost:14000';
  if (Platform.isAndroid) return 'http://10.0.2.2:14000';
  // iOS physical device: resolve via mDNS
  final resolved = await MacServerDiscovery.resolve(timeout: Duration(seconds: 2));
  return resolved ?? _geminiFallbackUrl;
}
```

---

## Tier 1: On-Device CoreML (iPhone)

**Model:** `yolo11n.pt` (already in repo) converted to `yolo11n.mlpackage` using `coremltools`. Bundled inside the Flutter app — no download, no network.

**Integration:** Swift `MethodChannel` in `mobile-app/ios/Runner/`:
- Accepts image bytes from Flutter
- Runs `VNCoreMLRequest` on the Neural Engine
- Returns bounding boxes + coarse labels as JSON

**Accuracy tuning:**
- Confidence threshold: `0.3` (wide net — VLM prunes false positives downstream)
- Fast pass result is a **candidate list**, not a final answer

**Required iOS entitlement:** None (CoreML is unrestricted).

**Output shape:**
```json
[
  {"label": "chair", "confidence": 0.91, "box": [x, y, w, h]},
  {"label": "lamp",  "confidence": 0.87, "box": [x, y, w, h]}
]
```

---

## Tier 2: Mac Deep Pass

### 2a. Network Discovery (mDNS / Bonjour)

**Mac side:** API service registers a Bonjour service on startup:
- Service: `allmythings-server._http._tcp.local`
- Hostname: `allmythings-server.local`
- Port: `14000`
- Package: `bonjour` (Node.js), called once at server start

**iPhone side:** Swift platform channel (`MacServerDiscovery`) uses `NSNetServiceBrowser` to resolve `allmythings-server.local`:
- Timeout: 2 seconds
- Result cached for the app session
- If not found: returns `null` → caller falls back to Gemini

**`Info.plist` addition:**
```xml
<key>NSLocalNetworkUsageDescription</key>
<string>Used to find the detection server on your local network.</string>
<key>NSBonjourServices</key>
<array>
  <string>_http._tcp</string>
</array>
```

**`make dev` change:** mDNS advertisement starts alongside the API server.

### 2b. Detection Service — YOLOE + SAHI (Python :14001)

**Accuracy tuning:**
- SAHI grid: **3×3 (10 passes)** instead of 2×2 — catches small/occluded objects
- Overlap ratio: `0.3` — objects at tile edges are never missed
- Open-vocabulary prompts from `prompts_catalog` in Postgres — vocabulary grows as users correct labels
- Output: precise bounding boxes with coarse labels, passed to VLM for enrichment

### 2c. Ollama + MLX — Qwen2.5-VL:7b (Mac :11434)

**Setup:** `ollama pull qwen2.5-vl:7b` — runs automatically via MLX on Apple Silicon.

**Two-stage VLM prompting strategy:**

*Stage 1 — whole-image sweep:*
```
"List every distinct object visible in this image. 
Be exhaustive — include small items, items partially obscured, 
and items in the background. Return a JSON array of object names only."
```

*Stage 2 — per-region enrichment (one call per bounding box crop):*
```
"What is this object? Provide: specific_name, brand (if visible or 
inferrable), model (if visible), primary_color, material, 
condition (excellent/good/fair/poor), estimated_resale_value_usd. 
If unsure about a field, set uncertain: true. Respond as JSON only."
```

**Cross-reference:** Objects identified in Stage 1 but not in any YOLOE bounding box are added as `unlocated: true` detections — still inventoried, just without precise coordinates.

**Accuracy tuning:**
- Temperature: `0` — deterministic, no hallucinated creativity
- Crop padding: 20% around each bounding box — context improves identification
- Uncertain fields marked `uncertain: true` — UI renders them differently (italic, question mark)

**Gemma 4 swap:** Change `OLLAMA_MODEL=gemma4:vision` (or Ollama's naming) when available — no other code changes required.

### 2d. Provider Cascade in API Service

Current: Gemini primary → Ollama fallback
**New:** Ollama primary → Gemini fallback (only when Mac unreachable, i.e., Tier 3)

The existing `OllamaClassifier` (`ollama.classifier.ts`) is promoted to primary. No new code required — config change only.

---

## Tier 3: Gemini 2.5 Flash (Cloud Fallback)

Fires only when Mac is unreachable (mDNS resolution failed or timed out).

**Same two-stage prompting strategy as Qwen2.5-VL** — consistent output shape regardless of which VLM ran.

**Accuracy tuning:**
- `response_schema` set to exact JSON shape — forces structured output, eliminates parsing failures
- Gemini's quadrant cropping approach (from existing design) retained

**Timeout:** 20 seconds max.

---

## Fusion

The existing `EnsembleFusionService` handles merging. Rules:
- Full confidence: object confirmed by spatial pass (YOLOE box) **and** semantic pass (VLM label)
- `unlocated: true`: VLM-identified, no bounding box — included but flagged
- `uncertain: true`: specific attribute the VLM wasn't confident about
- NMS deduplication at IoU `0.5` for overlapping boxes

---

## Error Handling & Degradation Ladder

```
Tier 1 (CoreML) — always fires, never fails (no network dependency)

Tier 2 (Mac):
  Mac not found within 2s → skip to Tier 3
  Mac found, detection service down → skip to Tier 3
  Ollama not running → return YOLOE boxes only (no attributes), UI shows "limited mode"
  Ollama times out (>30s) → partial results returned via SSE, remaining attributes skipped

Tier 3 (Gemini):
  Gemini error → show Tier 1 results + "offline mode" badge
  Gemini timeout (>20s) → same as above

CoreML failure (model file missing):
  → show exclamation mark with actionable message ("Tap to retry")
```

**UI states:**

| State | What user sees |
|---|---|
| CoreML done, Mac pending | Boxes with labels, shimmer on attribute chips |
| Mac deep pass streaming | Attributes fill in progressively as SSE events arrive |
| Mac complete | All attributes filled, shimmer gone |
| Mac unreachable, Gemini running | "Enhancing with cloud…" badge |
| Gemini complete | Full results, small "cloud mode" indicator |
| Offline (Tier 1 only) | Boxes + coarse labels, "Add details later" prompt |

**Timeout values:**

| Step | Timeout |
|---|---|
| mDNS discovery | 2s |
| YOLOE fast pass | 3s |
| Qwen2.5-VL deep pass | 30s (streams progressively) |
| Gemini fallback | 20s |

---

## Changes Per Layer

| Layer | What changes |
|---|---|
| `mobile-app/lib/core/config/app_config.dart` | Replace `localhost` with mDNS resolution |
| `mobile-app/ios/Runner/` | Add `MacServerDiscovery.swift` (mDNS) + `CoreMLDetector.swift` (MethodChannel) |
| `mobile-app/ios/Runner/Info.plist` | Add `NSLocalNetworkUsageDescription` + `NSBonjourServices` |
| `mobile-app/lib/data/repositories/detection_repository.dart` | Handle Tier 1 result + merge with deep pass SSE stream |
| `api-service/src/` | Promote Ollama to primary, demote Gemini to fallback; add Bonjour advertisement |
| `detection-service/src/detection_service/backends/` | No change to MLXBackend; add `OllamaVlmBackend` for deep pass |
| `detection-service/src/detection_service/config.py` | SAHI grid 3×3, overlap 0.3, confidence threshold 0.3 |
| `detection-service/src/detection_service/` | Two-stage VLM prompt logic, cross-reference whole-image + crop results |
| `scripts/` or `Makefile` | `make dev` starts Bonjour advertisement alongside API server |
| `yolo11n.pt` → `yolo11n.mlpackage` | One-time conversion script using `coremltools` |

---

## Testing

- **Unit:** CoreML platform channel returns correct JSON shape; mDNS resolution mock; VLM prompt templates produce valid JSON
- **Integration:** Full pipeline on physical iPhone connected to Mac — measure detection count on reference room photo (target: ≥25 objects)
- **Degradation:** Kill Ollama mid-test → verify Gemini fires; kill Mac entirely → verify offline mode shows Tier 1 results without crash
- **Accuracy benchmark:** Same reference photo run through Tier 2 (Qwen) vs Tier 3 (Gemini) — compare detection count and attribute completeness
