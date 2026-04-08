# Multi-Model Detection Ensemble & Continuous Learning — Design Spec

**Status:** Draft for review
**Date:** 2026-04-08
**Author:** brainstorm session (Claude Code, Arindam)
**Supersedes (in part):** `2026-03-12-visual-home-inventory-full-rewrite-design.md` §detection pipeline
**Tracking task:** benchmark `test_images/ai_interior.jpg` — current pipeline detects only 4 of 30+ visible items

## Problem statement

The current detection pipeline (`detection-service/main.py`) uses YOLO11n + Florence-2-base with a single dense-region-caption pass. On `test_images/ai_interior.jpg` (1200×1059, ~30+ visible household items) it returns ~4 objects. The `api-service` then applies a broad hard-coded exclude list (`florence.classifier.ts::isInventoryObject`) that drops legitimate items like anything containing "wall ", plus a 20-word color regex and 20-word material regex that miss anything not in the list.

This is the wrong architecture for a home-inventory app aimed at thousands of users × hundreds of photos each. We need:

1. **Recall ≥30 items** on dense interior scenes (`ai_interior.jpg` is the headline test)
2. **Hybrid UX** — fast provisional result (<10 s) then background enrichment (<90 s)
3. **Continuous improvement** — every user correction makes the system smarter without code edits
4. **Zero hard-coded vocabulary** — models generate, users correct, taxonomy emerges
5. **Dev on M4 Pro Mac → prod on separate machine/cloud** — single codebase, swappable inference backend
6. **Full observability** — SLOs, traces, per-model contribution dashboards from day one
7. **Free/open source** — dev cost $0 today, scale path to paid only when monetized
8. **Reject non-interior photos** at the edge

## Non-goals

- Fully on-device detection on iPhone today (deferred — FastVLM for "quick peek" only)
- Training new base models from scratch (we LoRA-fine-tune upstream open-weight models)
- Pinterest / web image scraping (deferred; legal risk and not needed at current scale)
- Real-time video inventory (single-photo inventory only)
- Multi-language UI/prompts (English only v1)

## Constraints

- **Dev hardware:** M4 Pro Mac (48 GB unified memory, daily driver — cannot peg GPU during work hours)
- **Prod hardware:** starts at $0, targets Modal.com free tier ($30/mo credit → ~10 h A10G / ~5 h H100), grows to dedicated Hetzner GPU when monetized
- **Dev stack:** Docker Compose on Mac for stateless FOSS infra; native macOS processes for inference (Docker cannot access Metal/ANE)
- **Data plane:** Postgres + pgvector, MinIO, NATS JetStream — all self-hostable
- **Budget ceiling:** $0 for cloud services until revenue; all components must have generous free tiers or run locally
- **Privacy:** all interior photos; GDPR deletion must cascade through data lake and be excluded from next retrain
- **No hard-coded lists:** no vocab files, no exclude lists, no category enums. Only prompts and thresholds.

## Load targets

- 10,000 active users
- ~100 photos/user lifetime, ~5 photos/user/day peak
- Peak ingestion: ~50 K photos/day (sustained ~35/min, burst ~200/min)
- Fast-pass p95 ≤ 10 s
- Deep-pass p95 ≤ 90 s
- Deep-pass recall ≥ 30 items on `ai_interior.jpg` and equivalent dense scenes

## The principle

**Models generate. Users correct. Taxonomy emerges.**

No file in this repo contains a list of object names, category names, color/material vocab, or "is this furniture?" logic. The only hard-coded artifacts allowed are **prompts** (model instructions, not data) and **thresholds** (numbers, not items). Five prompt files total under `prompts/`, each versioned, each A/B-testable, all seed values imported into a Postgres `prompts_catalog` that is the runtime source of truth.

Trust the VLMs. If something is wrong, fix the prompt or feed the correction loop — never add a regex or a vocab file.

---

## 1. Architecture

### 1.1 Five planes

```
1. INGRESS & API PLANE
   Flutter → Tailscale → api-service (Fastify, Node 20)
     ├── auth (JWT with tenant_id)
     ├── quota check (Redis counter in Postgres)
     ├── image → MinIO (tenant-scoped prefix, KMS envelope encryption)
     ├── pHash dedup cache (skip pipeline on hit)
     └── publish to NATS queue

2. INFERENCE PLANE
   NATS JetStream (durable, two subjects: fast.q, deep.q)

   Fast Pool                  Deep Pool
   ─────────                  ─────────
   - Tier-0 gatekeeper (CLIP zero-shot)
   - YOLOE-11L + SAHI tiling
   - CLIP ViT-L/14 memory-bank retrieval
   ~5–8 s p95                 - Qwen2.5-VL-32B enumerate (bbox + category)
                              - Molmo-7B-D point corroboration / rescue
                              - Fusion (IoU + point-in-box + NMS)
                              - Batched attribute call (composite image)
                              - Memory-bank write-back (candidate TTL 30d)
                              ~56 s hot p95

3. DATA PLANE
   Postgres 16 + pgvector (tenants, jobs, detections, corrections,
                            memory_bank HNSW, taxonomy, audit log)
   MinIO (images, MLflow artifacts, Iceberg tables)
   ClickHouse (event analytics, per-tenant cost metering)

4. MLOPS PLANE
   MLflow OSS (model registry: staging → canary → prod; prompt experiments)
   Label Studio Community (human review for active learning)
   Prefect OSS (training DAGs, drift daily, memory-bank GC,
                gatekeeper-prompt optimization)
   Evidently OSS (data + output drift)
   DVC (golden eval set versioning)

5. OBSERVABILITY PLANE
   OpenTelemetry SDK everywhere → Tempo (traces), Prometheus (metrics),
                                   Loki (logs), Grafana (dashboards)
   SLO burn-rate alerts via Prometheus rules → PagerDuty / webhook
```

### 1.2 Dev / prod topology

#### Dev / staging — M4 Pro Mac (daily driver)

```
Docker Compose (profile: dev)
  Postgres + pgvector, MinIO, NATS, Prometheus, Tempo, Loki,
  Grafana, MLflow, Label Studio, Prefect, Evidently

Native processes (Overmind or launchd)
  api-service            (Node, Fastify, port 14000)
  detection-service      (Python, INFERENCE_BACKEND=mlx, port 14001)
  detection-deep-worker  (Python, on-demand during work hours; continuous off-hours)

Models resident (MLX + Core ML):
  Fast pool  ~3 GB  — CLIP ViT-B/32 (gatekeeper, ANE), YOLOE-11L (Core ML),
                      CLIP ViT-L/14 (Core ML, shared with deep pass)
  Deep pool ~23 GB  — Qwen2.5-VL-32B Q4 MLX (~18 GB), Molmo-7B-D Q4 MLX (~5 GB)
  Total     ~26 GB (of 48 GB)  leaves ~22 GB for OS + Docker stack + user apps

iPhone app reaches api-service via Tailscale (any network, zero config)
```

**Daily-driver rules:**
- Fast pool always resident (small footprint, always-on)
- Deep pool lazy-loads on first job after idle; **unloads after 5 min idle** to free RAM
- Deep pool **does not auto-load during work hours (09:00–18:00)** unless explicitly triggered by CLI
- Deep queue accumulates; off-hours worker drains

#### Production — upgrade ladder

| Tier | Cost/mo | Infra | Inference | Capacity |
|---|---|---|---|---|
| **P0** | ~$0 | Any Linux box + Modal.com free tier ($30 credit) | `modal_backend` wraps deep pass in a Modal function; fast pass runs on the Linux box CPU or small GPU | ~500–2 000 deep passes/mo |
| **P1** | ~$50 | Hetzner CX22 (€4) + Modal pay-as-you-go (~$1.50/h A10G) | Same | A few hundred active users |
| **P2** | ~$200–500 | Hetzner GEX44 or vast.ai 4090 | Local `cuda_backend` with vLLM; Modal as burst fallback | ~5 000 daily photos |
| **P3** | $$$$ | Managed k8s + autoscaled GPU pool | `cuda_backend` horizontally scaled; Qwen3-VL-235B becomes viable | Full 50 K photos/day SLO |

**Key property:** the same Python code runs on the M4 Pro today (MLX backend) and on a rented Modal H100 in production (Modal backend), with **zero refactoring**. Scaling is deployment configuration, not re-architecting.

### 1.3 `InferenceBackend` abstraction — portability is the whole design

All model calls go through one protocol, implemented three ways:

```python
class InferenceBackend(Protocol):
    def load_models(self, config: ModelConfig) -> None: ...
    def gatekeeper(self, image: PIL.Image) -> GatekeeperResult: ...
    def fast_detect(self, image: PIL.Image) -> list[FastDetection]: ...
    def vlm_enumerate(self, image: PIL.Image) -> list[VLMDetection]: ...
    def vlm_points(self, image: PIL.Image) -> list[VLMPoint]: ...
    def vlm_attributes(self, image: PIL.Image, boxes: list[Box]) -> list[ItemAttributes]: ...
    def embed(self, image_or_crop: PIL.Image) -> np.ndarray: ...
```

```
detection-service/backends/
├── base.py              InferenceBackend ABC
├── mlx_backend.py       mlx-vlm + Core ML (Mac)
├── cuda_backend.py      vLLM + PyTorch + ONNX Runtime (Linux/NVIDIA)
└── modal_backend.py     wraps cuda_backend in @app.function() (remote)
```

Selected by `INFERENCE_BACKEND={mlx|cuda|modal}` env var. **All fusion, memory-bank lookup, SAHI tiling, attribute post-processing, taxonomy resolution, active-learning hooks live in `detection-service/pipeline/` and are backend-agnostic.** Swapping backends is an env var change plus a model artifact name in MLflow (`qwen2.5-vl-32b-mlx-q4` vs `qwen2.5-vl-32b-awq`).

### 1.4 Data flow

1. Flutter → `POST /v1/detect` with `jobId` + `tenant_id` + image
2. api-service: auth → quota → upload to MinIO → pHash dedup lookup (hit: return cached result)
3. On miss, publish to `nats://fast.q` with trace context and return 202 + `jobId`
4. Fast worker: pulls → Tier-0 gatekeeper → YOLOE+SAHI → CLIP memory-bank relabel → persist provisional `ClassifiedObject[]` → publish `fast.complete` event + enqueue on `deep.q`
5. api-service subscribes to `fast.complete` → pushes provisional result via SSE under `jobId`
6. Deep worker: pulls → Qwen enumerate → Molmo points (sequential on M4 Pro; parallel on CUDA) → fuse → batched attributes → memory-bank write-back → publish `deep.complete`
7. api-service pushes enriched result via SSE → mobile UI progressively updates cards (4 → 18 → 30+ items)

### 1.5 Multi-tenancy & GDPR

- Postgres **row-level security** on `tenant_id` for every table
- MinIO keys prefixed `tenants/{id}/images/{yyyy}/{mm}/{hash}.jpg`; KMS envelope encryption with per-tenant CMK
- Right-to-be-forgotten: cascaded FK delete across `images → detections → feedback_events → memory_bank → active_learning_queue`; Iceberg training snapshot gets a tombstone row; next retrain excludes; KMS key destroyed
- Audit log append-only, streamed to ClickHouse
- Per-tenant `contribute_to_training` boolean — tenant-only corrections always, global training opt-in
- pHash dedup at ingress saves compute but respects tenant boundaries (cache key includes `tenant_id`)

---

## 2. Fast pass

**Latency budget (p95, M4 Pro 48 GB, MLX): 8 s total**

| Stage | p95 | Notes |
|---|---|---|
| HTTP + MinIO upload + pHash | 500 ms | api-service |
| pHash cache hit? return | 20 ms | skip pipeline |
| Tier-0 gatekeeper (CLIP ViT-B/32) | 80 ms | Core ML ANE |
| SAHI slicing (CPU) | 40 ms | |
| YOLOE-11L ×(tiles + full) | 4 500 ms | ONNX via Core ML EP, batched |
| Slice NMS + merge | 60 ms | |
| Per-crop CLIP embed (ViT-L/14) | 900 ms | batched ≤10 crops |
| pgvector HNSW query + label resolve | 150 ms | |
| Persist + emit `fast.complete` | 100 ms | |
| **Total** | **~6.4 s** | headroom under 8 s SLO |

### 2.1 Tier-0 gatekeeper — reject non-interior at the edge

CLIP ViT-B/32 Core ML ANE-optimized (INT8 palettized, ~120 MB disk, ~600 MB RAM). Runs on the Apple Neural Engine — leaves the GPU free for YOLOE.

**Prompts** (seed in `prompts/gatekeeper_interior.v1.yaml`, runtime-overridable via `prompts_catalog` table):

```yaml
accept:
  - "a photo of a home interior"
  - "a photo of furniture and household objects"
  - "a photo of a room with decor and belongings"
  - "a close-up photo of household items"
reject:
  - "a photo of a person or people"
  - "a selfie"
  - "a photo of an outdoor scene or landscape"
  - "a document, receipt, or screenshot"
  - "a photo of food or a meal"
  - "a meme or text image"
  - "a photo of a vehicle"
  - "a photo of an animal"
  - "a chart, graph, or diagram"
```

**Decision rule:**
```
margin = max(softmax(accept_logits)) - max(softmax(reject_logits))
margin < 0.10 → 422 NonInteriorRejected
margin < 0.25 → proceed, flag low_confidence for weekly review
margin ≥ 0.25 → proceed
```

Failed appeals feed the weekly `gatekeeper_prompt_optimize.flow` — prompts evolve with user behavior, never hand-curated beyond the seed.

**Failure policy:** fail open (log warn, proceed). Gatekeeper is an optimization, not a safety boundary.

### 2.2 YOLOE-11L + SAHI — the single biggest change from the current pipeline

Model: [THU-MIG/yoloe](https://github.com/THU-MIG/yoloe) (ICCV 2025) in prompt-free mode. 1200+ classes from LVIS + Objects365 baked in; we do **not** maintain this list. When THU-MIG releases YOLOE v2, we pull the new ONNX weights and get more classes for free.

**SAHI config:**
```python
SliceParams(
    slice_height=640,
    slice_width=640,
    overlap_height_ratio=0.2,
    overlap_width_ratio=0.2,
    postprocess_type="NMS",        # not NMM — preserves adjacent distinct items
    postprocess_match_metric="IOU",
    postprocess_match_threshold=0.5,
    postprocess_class_agnostic=False,
)
```

For a 1200×1059 image this yields 4 overlapping tiles + 1 full pass = 5 batched inferences. 1920×1080 → 10 inferences.

**Confidence threshold: `0.15`** (vs current `0.25`) — SAHI + lower threshold is the combination that lifts dense-scene recall. False positives are absorbed by the memory bank and deep pass.

**Two-pass NMS:** class-aware NMS (IoU 0.5) across tiles, then class-agnostic NMS (IoU 0.85) to collapse "cup vs mug" duplicates on the same pixels — higher-confidence wins, the other survives as a `candidate_label`.

### 2.3 CLIP memory-bank relabeling

For each surviving box: crop +10% padding → CLIP ViT-L/14-336 embed → pgvector HNSW query scoped by `tenant_id`:

```sql
SELECT id, item_label, category_canonical, attributes,
       status, embedding <=> $1 AS distance
FROM memory_bank
WHERE tenant_id = $2
  AND status IN ('candidate','confirmed')
  AND embedding <=> $1 < 0.25
ORDER BY embedding <=> $1
LIMIT 3;
```

**Label resolution (no hard-coded categories):**
```python
top = results[0] if results else None
if top is None or top.distance >= 0.25:
    return yoloe_label  # raw fallback

if top.distance < 0.15 and labels_semantically_compatible(yoloe_label, top.item_label):
    return top.item_label, relabeled_by="memory_bank"

# 0.15 ≤ distance < 0.25
return yoloe_label, candidate_labels=[top.item_label]  # UI shows suggestion chip
```

`labels_semantically_compatible()` is **pure semantic similarity** on CLIP text embeddings: `cosine(text_embed(a), text_embed(b)) > 0.7`. No COMPATIBLE matrix, no category enum.

The 0.7 threshold is tuned weekly by `retrain.flow` against the user-correction rate (false-relabel rate).

### 2.4 Fast-pass output — label + box + category (if memory-bank hit) only

**No attribute stub.** No `extract_colors()`, no `extract_materials()`. Fast pass returns the minimum viable detection:

```typescript
interface FastDetection {
  label: string;                    // YOLOE raw label or memory-bank override
  boundingBox: BoundingBox;
  category: string | null;          // only if memory-bank hit resolved it
  confidence: number;
  enrichment_state: "fast";         // UI renders shimmer on attribute fields
  candidate_labels: string[];       // memory-bank suggestions not auto-applied
  corroborated_by: string[];        // ["yoloe"], ["yoloe","memory_bank"]
}
```

Colors, materials, brand, model, condition, estimated value — all come from deep pass ≤60 s later, pushed over SSE. Mobile UI shimmer is the UX contract.

### 2.5 Error handling

| Failure | Behavior |
|---|---|
| CLIP gatekeeper model fails to load | Fail open, log WARN, proceed to YOLOE |
| YOLOE model fails to load | **Fail hard**, return 503; fast pass is non-functional |
| pgvector query timeout > 500 ms | Skip memory bank, return raw YOLOE labels |
| Single SAHI tile inference fails | Skip tile, log WARN, continue |
| Image decode fails | 400 InvalidImage |
| NATS `fast.complete` publish fails | Persist to Postgres anyway; mobile polls `GET /v1/jobs/:id` |
| Deep-pass enqueue fails | Log ERROR, still return fast result |

### 2.6 Observability

```
fast_pass_e2e_seconds{tenant}                                  histogram
fast_pass_stage_seconds{stage=gatekeeper|sahi|yoloe|clip|pgvector|persist}
fast_pass_detections_total{source=yoloe|memory_bank}           counter
fast_pass_memory_bank_hit_rate{tenant}                          gauge   # rolling 1h
fast_pass_boxes_per_image                                       histogram
fast_pass_rejected_gatekeeper_total                             counter
gatekeeper_margin_bucket{bucket=0-0.1|0.1-0.25|0.25+}           histogram
yoloe_slice_count                                               histogram
```

**Grafana panel "Fast Pass Health":** p50/p95/p99, boxes/image, gatekeeper rejection rate, memory-bank hit rate trend.

### 2.7 Tests

- **Unit:** SAHI slice → merge correctness on synthetic images
- **Unit:** gatekeeper rule on curated 100-image set (50 interior, 50 non-interior) → **must be ≥95% correct** to pass CI
- **Unit:** memory-bank label resolution every branch (distance < 0.15, 0.15–0.25, ≥ 0.25, incompatible semantics)
- **Integration:** `test_images/ai_interior.jpg` → fast pass → **must return ≥15 detections** (fast-pass-alone floor; deep pass owns 30+)
- **Integration:** all 7 room folders under `test_images/` → each ≥10 detections
- **E2E:** Flutter → Tailscale → api-service → detection-service fast pass → SSE → UI render, full trace captured in Tempo
- **Load:** k6 at 200 photos/min → fast p95 holds ≤10 s, no 5xx, NATS drains within 60 s of load end

---

## 3. Deep pass — Qwen2.5-VL + Molmo ensemble (2-model, no vocab)

Two models, not three. Grounding DINO was removed from the ensemble because its value requires a maintained vocab list and we refuse to maintain one. Qwen + Molmo remain: bbox + point paradigms, orthogonal failure modes.

**Latency budget (p95, M4 Pro 48 GB, MLX, hot): 60 s**

| Stage | Hot p95 | Notes |
|---|---|---|
| Qwen2.5-VL-32B enumerate (bbox JSON) | 25 s | MLX Q4, ~18 GB loaded |
| Molmo-7B-D points | 8 s | MLX Q4, ~5 GB loaded |
| Fusion (CPU) | 0.5 s | pure Python |
| Batched attribute call (composite image) | 18 s | one Qwen call |
| Memory-bank write-back + persist + NATS | 1 s | |
| **Total hot** | **~52 s** | headroom under 90 s SLO |
| **Cold** | ~95 s | +20 s model load |

**Dev-Mac keep-alive policy:** lazy-load on first job, unload after 5 min idle, never load during work hours (09:00–18:00) unless explicitly triggered. Off-hours: stay hot, drain queue.

**Prod:** Modal `@app.function(gpu="A10G", keep_warm=1)` keeps container hot; no idle eviction.

### 3.1 Models

| Model | Role | Disk | RAM | Backend |
|---|---|---|---|---|
| Qwen2.5-VL-32B Instruct MLX Q4 | Primary bbox + label + attribute | ~18 GB | ~18 GB | mlx-vlm |
| Molmo-7B-D MLX Q4 | Point corroboration + rescue | ~4 GB | ~5 GB | mlx-vlm |
| CLIP ViT-L/14 (shared with fast pass) | Memory-bank reuse | ~0.9 GB | shared | Core ML ANE |

**Prod equivalents:** `Qwen/Qwen2.5-VL-32B-Instruct-AWQ` via vLLM; `allenai/Molmo-7B-D-0924` via vLLM. Same backend interface. When A100/H100 becomes available, swap the MLflow artifact name to `Qwen2.5-VL-72B-AWQ` or `Qwen3-VL-235B-A22B-FP8` — zero code change.

### 3.2 Stage A — Qwen dense enumeration

Prompt in `prompts/qwen_enumerate.v1.txt`, runtime source is `prompts_catalog` table:

```
You are an exhaustive home inventory assistant. Detect and enumerate EVERY
visible object in the image that could be an inventory item (furniture, decor,
electronics, textiles, kitchenware, plants, storage, personal items, tools,
small gadgets). Include items that are small, distant, partially occluded, or
stacked with other items.

IGNORE these (do not return):
- walls, floor, ceiling, architectural details
- windows and doors (unless they have decorative treatments like curtains)
- people, pets
- text overlays, watermarks

For each object return one JSON object with these exact fields:
  "label": specific descriptive noun phrase — prefer "brown leather armchair"
    over "chair"; prefer "vintage brass desk lamp" over "lamp".
  "category": a concise category name of your choice (free-form; the system
    learns a canonical taxonomy from your outputs over time).
  "box_2d": [ymin, xmin, ymax, xmax] normalized 0-1000, integer values
  "confidence": float 0.0-1.0

Return ONLY a JSON array. No markdown, no prose, no code fences.
Aim for COMPLETENESS. A room with many items should return many detections;
return 30+ items when they are visible.
```

Key points:
- `[ymin,xmin,ymax,xmax]/1000` is exactly what Qwen2.5-VL was tuned on — do not deviate
- "Aim for COMPLETENESS. Return 30+ when visible" is load-bearing; without it Qwen truncates at ~15 on dense scenes
- **Category is free-form** — no enum. The weekly `taxonomy_learn.flow` clusters these into an emergent taxonomy stored in Postgres
- Inventory filter is prompt-only; there is no `isInventoryObject()` in the codebase

**Post-processing:** strict JSON parse → on failure retry once with `"Return ONLY valid JSON, no other text, no markdown."` → on second failure regex-extract `[\d+,\d+,\d+,\d+]` → on total failure drop Qwen contribution, mark `degraded_mode=true`. Drop boxes with area < 0.2 % of image or `confidence < 0.3`.

### 3.3 Stage B — Molmo point corroboration

Model trained on a pointing task; its failure modes are orthogonal to bbox VLMs. Consistently finds small items on cluttered shelves that Qwen misses.

Prompt in `prompts/molmo_points.v1.txt`:

```
Point to every home inventory item visible in this photo: furniture, decor,
electronics, textiles, kitchenware, plants, storage, personal belongings.
Do not point to walls, floor, ceiling, windows, people, or pets.
Return a point for each distinct item.
```

Parse Molmo's `<point x="..." y="..." alt="label"/>` XML format with a strict parser. Ignore malformed entries.

### 3.4 Stage C — Fusion

```python
def fuse(qwen: list[QwenDet], molmo_pts: list[MolmoPoint]) -> list[ClassifiedObject]:
    merged: list[FusedBox] = [FusedBox.from_qwen(q) for q in qwen]

    # Molmo corroborates existing boxes or rescues missed items
    for pt in molmo_pts:
        containing = [i for i, m in enumerate(merged)
                      if m.box.contains_point(pt.xy)]
        if containing:
            closest = min(containing,
                          key=lambda i: merged[i].box.center_dist(pt.xy))
            merged[closest].molmo_corroborated = True
            # Distant = CLIP text cosine(a, b) < 0.5 (roughly: not the same item).
            # Threshold is tuned weekly by retrain.flow against correction rate.
            if labels_semantically_distant(merged[closest].label, pt.label, threshold=0.5):
                merged[closest].candidate_labels.append(pt.label)
                merged[closest].disagreement_flag = True
        else:
            # Rescue: Molmo saw something Qwen missed
            rescue = molmo_rescue(image, pt)
            if rescue is not None:
                merged.append(rescue)

    # Class-agnostic NMS at IoU 0.9 — kill exact duplicates only
    merged = nms_class_agnostic(merged, iou_threshold=0.9,
                                 prefer=lambda d: (d.molmo_corroborated, d.confidence))

    # Confidence boost for corroborated items
    for m in merged:
        if m.molmo_corroborated:
            m.confidence = min(1.0, m.confidence + 0.10)

    return [m.to_classified_object() for m in merged]


def molmo_rescue(image, pt) -> FusedBox | None:
    """Crop a 256 px region around the point, call Qwen on the crop for a
    label + tight box, add as a new detection."""
    crop_box = box_around(pt.xy, size=256)
    crop = image.crop(crop_box)
    result = qwen_vl.describe_crop(crop, prompt=MOLMO_RESCUE_PROMPT)
    if result.confidence < 0.4:
        return None
    return FusedBox.from_rescue(crop_box, result, pt)
```

**What the fusion algorithm deliberately does NOT do:**
- No inventory filter / exclude list (the prompt already told Qwen to ignore non-inventory)
- No category membership check (categories are free-form, taxonomy emerges)
- No hard-coded label translation

### 3.5 Stage D — Batched attribute enrichment

Single Qwen call on a composited image. PIL draws red rectangles + white-on-black numbers over each fused box. Then one call with:

```
The image shows numbered red bounding boxes around home inventory items.
For EACH numbered box, return a JSON object in a single JSON array, in order:

{
  "label": specific label, max 5 words,
  "category": concise free-form category,
  "brand": brand name or null,
  "model": model name/number or null,
  "colors": array of 1-3 color names,
  "materials": array of 1-2 material names,
  "condition": one of ["excellent","good","fair","poor"],
  "estimated_value_usd": integer or null (conservative retail guess),
  "description": one-sentence inventory description, max 20 words
}

Return ONLY the JSON array with exactly {N} entries.
```

Results parsed and zipped back to fused boxes by index. Parse failures per-entry → fall back to label-only from Stage A.

Scales to ~50 boxes before context limit. Beyond that, chunk into calls of 30.

### 3.6 Memory-bank write-back

```sql
INSERT INTO memory_bank (tenant_id, embedding, embedding_hash, item_label,
                         category_raw, attributes, status, expires_at)
VALUES (...)
ON CONFLICT (tenant_id, embedding_hash) DO UPDATE
SET seen_count = memory_bank.seen_count + 1,
    last_seen = NOW(),
    expires_at = CASE WHEN memory_bank.status = 'confirmed'
                      THEN NULL
                      ELSE NOW() + INTERVAL '30 days' END;
```

`embedding_hash` is an 8-byte product-quantization code — prevents the same chair in 12 photos from producing 12 memory-bank rows.

Only detections with `confidence ≥ 0.75` write back as candidates.

### 3.7 Output contract

```typescript
interface ClassifiedObject {
  label: string;
  category_canonical: string | null;   // resolved from taxonomy
  category_raw: string;                 // Qwen's original free-form output
  boundingBox: BoundingBox;
  attributes: {
    brand: string | null;
    model: string | null;
    colors: string[];
    materials: string[];
    condition: "excellent" | "good" | "fair" | "poor";
    estimated_value_usd: number | null;
    description: string;
  };
  confidence: number;
  enrichment_state: "fast" | "deep" | "enriched";
  corroborated_by: string[];            // ["qwen","molmo","memory_bank"]
  candidate_labels: string[];
  disagreement_flag: boolean;
  model_version: string;                // "deep-v0.3.1"
  prompt_version: string;               // "qwen_enumerate.v1"
}
```

Every detection is traceable back to the exact model + prompt that produced it — essential for the weekly retrain to know which detections came from which version.

### 3.8 Error handling

| Failure | Behavior |
|---|---|
| Qwen OOM | Retry with batch=1; if still fails, unload Molmo, retry; if still fails, drop to Qwen-7B fallback with quality warning |
| Qwen JSON parse fails twice | Regex-extract bbox coords; if that fails, drop Qwen contribution and return Molmo-only (degraded) |
| Molmo fails | Continue with Qwen only; lose corroboration signal; increment `deep_pass_molmo_unavailable` |
| Both VLMs fail | Mark `enrichment_state="fast"` permanently for this job; publish `deep.failed`; incident-level error |
| Attribute call fails (batched) | Retry once with batch size 30; on second failure, keep Stage A labels only, no attributes |
| Memory-bank write fails | Log ERROR, do not fail the job — next photo will write again |
| Modal cold start + timeout (prod) | Retry once; if still failing, fall back to local backend (dev) or fail the job (prod) |
| Deep job > 180 s | Kill worker, mark failed, requeue with `priority=low` once |

### 3.9 Observability

```
deep_pass_e2e_seconds{tenant,model_version}                histogram
deep_pass_stage_seconds{stage=qwen_enum|molmo|fusion|attrs|persist}
deep_pass_model_proposal_count{model=qwen|molmo}           histogram
deep_pass_model_unique_contribution{model}                 gauge
deep_pass_detections_final_count                           histogram
deep_pass_molmo_corroboration_rate                         gauge   # rolling 1h
deep_pass_molmo_rescue_rate                                gauge   # per image
deep_pass_vlm_json_parse_failures_total                    counter
deep_pass_model_load_seconds{model}                        histogram
deep_pass_model_memory_gb{model}                           gauge
deep_pass_fallback_events_total{reason}                    counter
deep_pass_disagreement_rate                                gauge
```

**Grafana panel "Deep Pass Health":** per-model contribution stacked bar (key diagnostic), corroboration rate trend, JSON parse failure rate, model memory.

**Grafana panel "Model Contribution":** if either model drops below 10 % unique contribution for 7 consecutive days, the ensemble is failing — alert fires and Sunday retrain proposes investigation.

### 3.10 Tests

- **Unit:** fusion algorithm on synthetic qwen boxes + molmo points covering every branch (match, mismatch, rescue, NMS dedup)
- **Unit:** Qwen JSON parser robustness — 50 fixture responses including malformed, prose, partial, wrong keys, non-ASCII
- **Unit:** Molmo XML parser — valid + malformed fixtures
- **Unit:** memory-bank PQ-hash dedup — same crop 10× → one row with `seen_count=10`
- **Integration:** `test_images/ai_interior.jpg` → deep pass → **must return ≥30 inventory detections**, with ≥3 per major category (furniture, lighting, decor). **This is the headline acceptance test and CI blocks on regression.**
- **Integration:** all 7 room folders under `test_images/` → each ≥25 detections
- **Integration:** gatekeeper-reject image (a selfie) → 422, never reaches deep pass
- **Integration:** same image twice → second hits pHash cache in <200 ms
- **Integration:** kill Qwen mid-job → falls back to Molmo-only, job completes with degraded flag
- **Golden-set regression:** 100-photo golden set under `eval/golden/`; every model version must meet `recall@30 ≥ 0.85` and `precision ≥ 0.75` or MLflow blocks staging → canary promotion
- **Load:** 100 deep-pass jobs queued → drain within 2 h on dev Mac off-hours; within 10 min on Modal A10G hot

---

## 4. Corrections loop, memory bank, active learning, continuous improvement

### 4.1 Correction UX contract — every tap is training data

Mobile UI emits structured events to `POST /v1/feedback`. Event types:

| User action | `event_type` | Payload |
|---|---|---|
| Confirms a correct detection | `confirm` | `{detection_id, label, category, attributes}` |
| Rejects a false positive | `reject` | `{detection_id, reason?}` |
| Edits label | `relabel` | `{detection_id, old_label, new_label}` |
| Edits brand/model/colors/materials/value | `attribute_edit` | `{detection_id, field, old, new}` |
| Draws a box the system missed | `add_missing` | `{box, label, category}` |
| Renames a canonical category for their tenant | `category_rename` | `{old_canonical, new_canonical}` |
| Merges two boxes into one item | `merge` | `{detection_ids[2]}` |
| Splits one box into two | `split` | `{detection_id, new_boxes[2]}` |
| Appeals a gatekeeper rejection | `gatekeeper_appeal` | `{image_id, reason}` |

Events are append-only, idempotent on `event_id`, RLS-scoped by `tenant_id`.

**Latency SLO for the correction path: p95 < 500 ms** — the user just tapped; they need the memory bank updated before the next photo. Anything slower kills the learning loop in practice.

### 4.2 Schema

```sql
CREATE TABLE feedback_events (
  id              bigserial PRIMARY KEY,
  event_id        uuid NOT NULL UNIQUE,
  tenant_id       uuid NOT NULL,
  user_id         uuid NOT NULL,
  image_id        uuid NOT NULL,
  detection_id    uuid NULL,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL,
  model_version   text NOT NULL,
  prompt_version  text NOT NULL,
  created_at      timestamptz DEFAULT now(),
  trace_id        text,
  processed_by    text[] DEFAULT '{}',
  used_in_training_run uuid NULL
);
CREATE INDEX ON feedback_events (tenant_id, created_at DESC);
CREATE INDEX ON feedback_events (event_type, created_at DESC)
  WHERE used_in_training_run IS NULL;

CREATE TABLE memory_bank (
  id                bigserial PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  embedding         vector(768) NOT NULL,
  embedding_hash    bytea NOT NULL,
  item_label        text NOT NULL,
  category_canonical text,
  category_raw      text,
  attributes        jsonb NOT NULL DEFAULT '{}',
  status            text NOT NULL CHECK (status IN ('candidate','confirmed','archived')),
  seen_count        int NOT NULL DEFAULT 1,
  confirm_count     int NOT NULL DEFAULT 0,
  reject_count      int NOT NULL DEFAULT 0,
  first_seen        timestamptz DEFAULT now(),
  last_seen         timestamptz DEFAULT now(),
  expires_at        timestamptz,                    -- NULL for confirmed
  source_event_id   uuid REFERENCES feedback_events(event_id),
  UNIQUE (tenant_id, embedding_hash)
);
CREATE INDEX memory_bank_hnsw ON memory_bank
  USING hnsw (embedding vector_cosine_ops)
  WHERE status IN ('candidate','confirmed');

CREATE TABLE active_learning_queue (
  id              bigserial PRIMARY KEY,
  detection_id    uuid NULL,                         -- null for add_missing
  image_id        uuid NOT NULL,
  tenant_id       uuid NOT NULL,
  reason          text NOT NULL,
  priority        int NOT NULL,
  uncertainty_score real,
  created_at      timestamptz DEFAULT now(),
  label_studio_task_id bigint,
  status          text CHECK (status IN ('pending','exported','labeled','discarded'))
);
CREATE INDEX ON active_learning_queue (status, priority DESC);

CREATE TABLE taxonomy_category (
  id              bigserial PRIMARY KEY,
  canonical_name  text NOT NULL,
  embedding       vector(768),
  cluster_id      int,
  usage_count     int DEFAULT 0,
  last_updated    timestamptz DEFAULT now(),
  tenant_id       uuid NULL,                         -- NULL = global
  aliases         text[] DEFAULT '{}',
  status          text CHECK (status IN ('candidate','active','merged','archived'))
);

CREATE TABLE prompts_catalog (
  id              bigserial PRIMARY KEY,
  prompt_name     text NOT NULL,                     -- e.g. "qwen_enumerate"
  version         int NOT NULL,
  body            text NOT NULL,
  status          text CHECK (status IN ('candidate','testing','active','archived')),
  traffic_pct     int DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  metrics         jsonb,
  UNIQUE (prompt_name, version)
);

CREATE TABLE audit_log (
  id              bigserial PRIMARY KEY,
  kind            text NOT NULL,                     -- 'tenant_forget','data_export','opt_out',...
  tenant_id       uuid,
  payload         jsonb,
  completed_at    timestamptz DEFAULT now()
);
```

### 4.3 Correction consumer (synchronous, in api-service)

Pseudocode covered in the earlier approved Section 4 discussion. Each `event_type` has a handler that:
1. Inserts the feedback row
2. Updates the memory bank (upsert / confirm / archive)
3. Appends to active-learning queue when priority warrants it
4. Returns the updated `ClassifiedObject` in the response

Whole path wrapped in a single Postgres transaction. SLO <500 ms.

### 4.4 Memory-bank lifecycle

```
deep pass writes       ┌─────────┐
(conf ≥ 0.75)   ───▶  │candidate│   (TTL 30 days)
                      └────┬────┘
                           │ user confirm
                           ▼
                      ┌─────────┐
                      │confirmed│   (no TTL, permanent per-tenant)
                      └────┬────┘
                           │ user delete / correct
                           ▼
                      ┌─────────┐
                      │ archived │  (audit, not returned in queries)
                      └─────────┘
```

Daily `memory_bank_gc.flow`: delete candidates past `expires_at`, rebuild HNSW stats for tenants with >10 % churn, emit metrics.

### 4.5 Active learning priorities

```python
def priority_score(event: FeedbackEvent) -> int:
    # semantic_distance(a, b) = 1 - cosine(clip_text_embed(a), clip_text_embed(b))
    # so distance > 0.5 means cosine < 0.5, i.e. old and new labels are
    # meaningfully different concepts (not just refinement like "chair"
    # vs "Eames chair").
    if event.event_type == "add_missing":
        return 100    # ensemble failure; highest signal
    if event.event_type == "relabel" and semantic_distance(old, new) > 0.5:
        return 90
    if event.event_type == "gatekeeper_appeal":
        return 90
    if event.detection.json_parse_fallback:
        return 80
    if event.detection.disagreement_flag:
        return 70
    if event.detection.confidence < 0.5:
        return 60
    if event.drift_flagged:
        return 50
    if event.event_type == "confirm" and event.detection.confidence > 0.9:
        return 10   # low signal, filler
    return 40
```

**Queue budget:** 500 entries globally, FIFO-evict lowest-priority when full. Target review rate: 20–50 items/day.

### 4.6 Label Studio integration

Docker Compose runs Label Studio Community. Nightly `export_to_label_studio.flow` (02:00 local):

1. Pull `active_learning_queue` rows with `status='pending'` ordered by priority desc
2. Fetch image + bbox from Postgres/MinIO
3. Create Label Studio task with prediction pre-populated, bbox overlaid
4. Set `status='exported'`, store `label_studio_task_id`
5. Reviewer confirms / edits / deletes in the Label Studio UI
6. Label Studio webhook → `label_studio_webhook.handler` → writes result back, sets `status='labeled'`
7. Labeled items become training data for the weekly retrain

### 4.7 Weekly retrain flow (`retrain.flow`, Sundays 04:00 local)

```
1. collect_training_data
   - feedback_events with used_in_training_run=NULL from last 7 days
   - Label Studio labeled tasks from last 7 days
   - Export to Iceberg table `train/week_<yyyy_mm_dd>`
   - Split 80/10/10 train/val/test BY IMAGE (not by detection — avoid leakage)

2. build_eval_set
   - Golden set (100 hand-labeled photos including ai_interior.jpg)
   - Shadow set: last 1000 production images with deep-pass results as shadow truth

3. train_qwen_lora
   - Base: current prod Qwen2.5-VL-32B
   - mlx-lm lora (Mac dev) or peft (CUDA prod)
   - rank=16, alpha=32, dropout=0.05
   - target: q_proj, k_proj, v_proj, o_proj
   - ~1000 steps on corrected label+bbox pairs
   - Outputs LoRA adapter (~80 MB); base weights unchanged
   - Duration: ~45 min on M4 Pro, ~12 min on A100

4. train_clip_retrieval_head  [OPTIONAL v1, MANDATORY v2]
   - 2-layer MLP on frozen CLIP ViT-L/14
   - Contrastive loss on (confirmed_crop, confirmed_label) pairs
   - Boosts memory-bank retrieval on the home-decor domain

5. evaluate_candidate
   - Load base + LoRA in sandbox worker
   - Run deep pass on golden set → recall@30, precision, mAP, disagreement
   - Run deep pass on shadow set → deltas vs archived shadow results
   - Emit MLflow run with all metrics

6. promotion_gate
   Promote iff ALL:
     - recall@30 improves by ≥ 2 pp OR is within 1 pp of prod (stability)
     - precision drops by ≤ 1 pp
     - latency p95 increases by ≤ 10%
     - no golden image regresses to recall < 0.75
     - no category's recall drops by > 5 pp  (silent-collapse guard)

   Failed: MLflow stage='rejected', alert with diagnostic bundle
   Passed: MLflow stage='canary'

7. canary_deploy
   - Feature flag routes 5% of traffic to canary for 48 h
   - Auto-monitor:
       user correction rate (must not rise > 20%)
       shadow-golden recall (must not drop)
       p95 latency (must hold SLO)
       error rate
   - Stable → 25% (24 h) → 100% → stage='prod'
   - Regress → auto-rollback, stage='rejected', page on-call

8. record_and_archive
   - Archive training snapshot in Iceberg
   - Record prompt performance in prompts_experiments
   - Update MLflow model card
   - Mark consumed feedback_events with used_in_training_run=<uuid>
```

**Canary deploy is a 5-step gate in prod but one-step in dev** (feature flag `dev_canary_fast_promote=true` jumps 0 → 100 % for interactive testing).

### 4.8 Taxonomy learning flow (`taxonomy_learn.flow`, Sundays 05:00 local)

```
1. SELECT DISTINCT category_raw FROM detections WHERE created_at > now() - interval '7 days';
2. Embed each raw category with CLIP text or sentence encoder
3. HDBSCAN cluster the embeddings
4. For each cluster: pick the most-frequent label as canonical_name
5. Upsert into taxonomy_category with status='candidate'
6. Promote to 'active' after 50+ occurrences across ≥5 tenants
7. Merge clusters with cosine similarity > 0.85 under the more-used canonical
```

Bootstraps from empty. Per-tenant renames are stored with `tenant_id` set; global taxonomy is `tenant_id IS NULL`.

### 4.9 Drift detection (`drift_detect.flow`, daily 01:00)

Evidently OSS, two signals:

1. **Input drift** (daily 1000-image sample vs 30-day baseline):
   - Per-channel brightness, edge density, dominant color histogram
   - CLIP embedding centroid distance
   - Alert on >2σ sustained 3 days

2. **Output drift** (label distribution vs 30-day baseline):
   - Jensen-Shannon divergence on category frequency
   - New labels appearing >10× in a single day
   - Alert on JS-div > 0.15

Sustained drift feeds `retrain.flow` with a `drift_context` tag that forces retraining even if the normal ≥2 pp improvement gate isn't met.

### 4.10 Prompt A/B testing

Every prompt lives in `prompts_catalog` with `status` and `traffic_pct`. New variant:
- Insert row with `status='testing'`, `traffic_pct=10`
- Route 10 % of traffic for 72 h via random selection weighted by `traffic_pct`
- Compare: recall@30, latency, correction rate, JSON parse failure rate on golden + shadow
- Win on ≥2/4 metrics without regressing others → `status='active'`, old → `archived`
- Loss → `archived`

Iteration on prompts requires no code deploy. Git `prompts/*.txt` files are seed values imported on first run and on explicit `prompts import` CLI command.

### 4.11 SLOs and error budgets

| SLI | SLO | Budget | Alert |
|---|---|---|---|
| Fast pass p95 latency | ≤10 s | 1 % / week | Fast 2 h + sustained 24 h |
| Deep pass p95 latency | ≤90 s | 2 % / week | Sustained 24 h |
| Deep pass recall@30 (shadow golden) | ≥0.85 | 5 % / week | Burn > 2× |
| Gatekeeper false-reject rate | ≤3 % | 0.5 % / week | Burn > 3× |
| `ai_interior.jpg` recall | ≥30 items | none — hard test | CI blocks any regression |
| User correction rate per image | ≤20 % | 5 % / week | Sustained rise 7 days triggers off-cycle retrain |
| Training promotion success | ≥1 per week | 2 failures / month | Sustained failure pages on-call |

Budget exhausted → freeze non-essential changes (new prompts, adapters, model versions) until replenished. Forces discipline.

### 4.12 Golden set lifecycle

- **Day 0:** 10 photos including `ai_interior.jpg`, hand-labeled by the founder
- **Month 1 target:** 35 photos; grow via Label Studio at ~1 reviewer item per workday (≈22/month) plus a weekend batch labeling session for +3
- **Month 6 target:** 150 photos; sustained ~1-2/workday + opt-in testers contributing
- **Month 12 target:** 500 photos; community contributions via opted-in users with evaluator role
- **Never modified casually** — golden set PRs require human review
- **Versioned in DVC** alongside code; pulled by `retrain.flow`
- **Consent:** no tenant photo enters the golden set without explicit `golden_set_consent=true`
- **Manual-promotion window:** retrain auto-promotion is disabled until the golden set reaches **30 photos**; earlier retrains still run but require human approval in MLflow UI

### 4.13 GDPR through the learning loop

```
tenant_forget(tenant_id):
  1. MinIO: delete prefix tenants/{id}/, destroy KMS CMK (images are cryptoshredded)
  2. Postgres: DELETE FROM tenants WHERE id=$1  (cascades all tables)
  3. Iceberg training corpus: MERGE tombstone WHERE tenant_id=$1
  4. Next weekly retrain automatically excludes tombstoned rows
  5. Audit log append (retained per regulation)
  6. Prometheus increment gdpr_forget_completed_total
  7. Email confirmation to user
```

**Guarantees:** Postgres + MinIO deletion immediate; training corpus excluded from next retrain (≤7 days); deployed model retains whatever was learned before deletion (honest, documented in privacy policy).

**Per-event consent:** `feedback_events.contribute_to_global_training` defaults `true` tenant-only; cross-tenant training requires explicit opt-in.

### 4.14 Observability additions

```
feedback_events_total{type,tenant}                  counter
memory_bank_size{tenant,status}                     gauge
memory_bank_hit_rate{stage=fast|deep,tenant}        gauge (rolling 1h)
active_learning_queue_depth{reason,priority}        gauge
active_learning_review_latency_seconds              histogram
retrain_flow_duration_seconds{stage}                histogram
retrain_flow_result{result=promoted|failed_gate|canary|rolled_back}  counter
golden_set_recall_at_30                             gauge
shadow_set_recall_delta                             gauge
drift_metric{dimension}                             gauge
prompt_experiment_running{prompt_name}              gauge
slo_burn_rate{sli,window=2h|24h}                    gauge
gdpr_forget_duration_seconds                        histogram
```

**Grafana dashboard "Continuous Improvement":** weekly recall@30 trend (golden + shadow overlaid), memory-bank growth per tenant, active-learning queue depth + burndown, retrain outcomes, drift sparklines, user correction rate trend (should decrease over time if learning is working).

**North-star metric:** **golden-set recall@30 ticks up week over week.** If flat for 4 consecutive weeks, the learning loop is broken — alert fires, manual investigation required.

### 4.15 Tests

- **Unit:** each feedback handler against fixture events, asserting DB state
- **Unit:** promotion gate logic with synthetic recall/precision deltas covering every branch
- **Unit:** PQ-hash dedup
- **Unit:** priority score function against every event type
- **Integration:** end-to-end correction loop — upload `ai_interior.jpg`, simulate 10 confirmations + 2 relabels via API, re-upload same image, assert memory bank returns relabels within 500 ms
- **Integration:** full `retrain.flow` dry-run on a fixture dataset (10 images, 50 labels) — dataset builds, LoRA fine-tunes (small test model in CI), eval gates fire, both promoted and rejected paths exercised
- **Integration:** drift synthetic test — inject 100 selfies, assert Evidently flags drift, alert fires
- **GDPR:** create tenant with 100 photos + corrections + memory bank, call `tenant_forget`, assert all rows gone, training tombstone created, deployed model unchanged
- **Regression:** every PR runs golden set through current prod models; recall@30 must not drop; `ai_interior.jpg ≥ 30` blocks the merge

---

## 5. Migration from the current pipeline

### 5.1 What gets deleted

- `detection-service/main.py`'s YOLO11 + Florence-2 pipeline (replaced by backend-abstracted fast pass)
- `api-service/src/providers/florence.classifier.ts::isInventoryObject` (no exclude list anywhere)
- `extractColors()` / `extractMaterials()` regex (attributes come from VLM only)
- `api-service/src/providers/google-vision.detector.ts` (unused in the new design)
- `api-service/src/providers/grounding-dino.detector.ts` (GDINO removed from ensemble)
- `api-service/src/providers/gemini.classifier.ts` (Option A is all self-hosted)
- `api-service/src/providers/ollama.classifier.ts` (unused in the new design)

### 5.2 What gets added or replaced

- `detection-service/backends/{base,mlx_backend,cuda_backend,modal_backend}.py`
- `detection-service/pipeline/{gatekeeper,fast_pass,deep_pass,fusion,memory_bank,taxonomy}.py`
- `detection-service/prompts/{gatekeeper_interior.v1.yaml, qwen_enumerate.v1.txt, qwen_attributes.v1.txt, molmo_points.v1.txt, taxonomy_learn.v1.md}`
- `api-service/src/services/detection-pipeline.service.ts` → rewrite against new `/fast-detect` + `/deep-detect` endpoints
- `api-service/src/routes/feedback.route.ts` (new) — correction event endpoints
- `api-service/src/services/memory-bank.service.ts` (new) — pgvector retrieval
- `api-service/src/services/taxonomy.service.ts` (new) — canonical resolution
- Postgres migrations for `feedback_events`, `memory_bank`, `active_learning_queue`, `taxonomy_category`, `prompts_catalog`, `audit_log`
- Docker Compose file for dev FOSS stack
- Prefect flows: `memory_bank_gc`, `active_learning_collect`, `export_to_label_studio`, `retrain`, `taxonomy_learn`, `drift_detect`, `gatekeeper_prompt_optimize`
- Observability config: Prometheus rules, Tempo config, Grafana dashboards as JSON

### 5.3 Phased rollout

1. **Phase 0 — scaffolding (week 1)**
   - Docker Compose FOSS stack spins up on Mac
   - Postgres schema migrations land
   - `InferenceBackend` ABC + empty `mlx_backend` stub
   - OpenTelemetry wired into api-service + detection-service

2. **Phase 1 — fast pass (week 2)**
   - Tier-0 gatekeeper, YOLOE + SAHI, CLIP memory bank
   - `ai_interior.jpg ≥ 15` test passes
   - Existing mobile app unchanged; old pipeline still reachable behind a flag

3. **Phase 2 — deep pass (week 3–4)**
   - Qwen2.5-VL-32B MLX loaded on Mac
   - Molmo-7B-D loaded
   - Fusion + batched attributes
   - `ai_interior.jpg ≥ 30` test passes
   - Old pipeline deleted

4. **Phase 3 — corrections loop (week 4–5)**
   - Feedback API + mobile UI hooks
   - Memory-bank write-back + lifecycle
   - Label Studio integration
   - Golden set seeded to 10 photos

5. **Phase 4 — continuous improvement (week 6)**
   - Prefect flows: memory_bank_gc, active_learning_collect, export_to_label_studio
   - `retrain.flow` dry-run on synthetic data in CI
   - Drift detection
   - Taxonomy learning flow

6. **Phase 5 — production (when monetized)**
   - `modal_backend` with Modal.com free tier
   - Linux box running Docker Compose stack
   - First canary retrain cycle
   - Initial SLO dashboards

Phases 1-4 run entirely on the M4 Pro Mac. Phase 5 is the cutover to a separate prod machine, code-identical.

### 5.4 Breaking changes

- `ClassifiedObject` gains `enrichment_state`, `corroborated_by`, `candidate_labels`, `disagreement_flag`, `model_version`, `prompt_version`, `category_canonical`, `category_raw` fields. Mobile app must handle the new fields (old fields stay).
- Fast pass no longer returns attributes (colors/materials/etc.); mobile UI shows shimmer until deep pass completes. UX PR required.
- New API endpoints: `POST /v1/feedback`, SSE streaming for job updates.
- Detection response becomes **async** — API returns 202 + `jobId`, client subscribes to SSE.

---

## 6. Open questions (resolved in planning phase, not in this spec)

1. Exact YOLOE-11L vs YOLOE-11x choice — depends on ONNX conversion test and SAHI throughput measurement on M4 Pro
2. Whether to wire CLIP retrieval head fine-tune in v1 retrain flow or defer to v2 (currently marked optional)
3. Label Studio task auto-assignment — self-review only in phase 1, multi-reviewer in phase 2
4. Whether `taxonomy_learn.flow` uses HDBSCAN or k-means — empirical decision during implementation
5. Exact Modal function shape for `modal_backend` — depends on Modal's current API at implementation time
6. Flutter SSE client library choice — implementation detail

## 7. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Qwen2.5-VL-32B OOM on 48 GB Mac under daily-driver load | Medium | Deep pass unusable during work hours | Lazy load + 5-min idle unload + no auto-load during work hours; fallback to Qwen-7B if 32B fails twice |
| Qwen JSON parsing unstable as MLX releases change | Medium | Recall drops silently | Daily drift flow catches output-distribution shift; two-retry parser + regex fallback |
| Memory-bank over-confident relabels (false positives) | Medium | User frustration, brand damage | 0.15 auto-relabel threshold is conservative; 0.15-0.25 is suggest-only; weekly threshold tuning via correction rate |
| Modal free-tier credit exhausted mid-month | High (once usage grows) | Deep pass unavailable in prod | Monitor credit; fall back to a queue + batch-process overnight; explicit alert at 80 % consumption |
| GPU hardware failure on dev Mac | Low | Dev blocked | Fallback to Modal backend (cuda_backend path) from dev machine |
| Golden set too small (<30 photos) early | High | Retrain gate too permissive | Temporarily disable auto-promotion until golden set reaches 30; manual promotion during first month |
| Active-learning queue starves from low review rate | High | Training data stale | Minimum review rate SLO; if queue > 500 pending for >7 days, auto-discard lowest priority |
| Ensemble disagreement rate high → confuses users | Medium | Correction rate rises | Disagreement UI chip "we're not sure"; feeds training faster |
| `ai_interior.jpg` never hits 30 because 30+ was an eyeballed count | Low | CI permanently blocked | Hand-label the actual image first as part of golden set work; if true count is lower, adjust target |

## 8. Acceptance criteria

1. `test_images/ai_interior.jpg` → deep pass → **≥30 inventory detections** (headline test, CI-blocking)
2. All 7 room folders under `test_images/` → each photo → **≥25 deep-pass detections**, **≥10 fast-pass detections**
3. Fast-pass p95 ≤ 10 s on M4 Pro under `k6` load at 30 RPM
4. Deep-pass p95 ≤ 90 s on M4 Pro hot-model state
5. Tier-0 gatekeeper ≥ 95 % correct on 100-image balanced test set
6. Memory-bank relabel works: upload a photo, correct a label, re-upload the same photo from a different angle, memory bank relabels the item in the fast pass within 500 ms
7. Weekly `retrain.flow` runs end-to-end on synthetic data in CI without manual intervention
8. `tenant_forget` deletes all tenant data and creates a tombstone in training corpus within 10 seconds
9. All dev components run on a single M4 Pro Mac via Docker Compose + native inference processes; no managed cloud services required
10. `INFERENCE_BACKEND={mlx|cuda|modal}` env var switches backends with zero code changes outside the `backends/` directory
11. No file in the repo contains a maintained list of object names, categories, colors, or materials — only prompts and thresholds
12. Every detection's response carries `model_version` and `prompt_version` for full provenance
13. Grafana "Continuous Improvement" dashboard shows non-flat golden-set recall@30 trend after 4 weeks of corrections

---

## 9. Appendix — files and layout

```
detection-service/
├── backends/
│   ├── base.py
│   ├── mlx_backend.py
│   ├── cuda_backend.py
│   └── modal_backend.py
├── pipeline/
│   ├── gatekeeper.py
│   ├── fast_pass.py
│   ├── deep_pass.py
│   ├── fusion.py
│   ├── memory_bank.py
│   ├── taxonomy.py
│   └── active_learning.py
├── prompts/
│   ├── gatekeeper_interior.v1.yaml
│   ├── qwen_enumerate.v1.txt
│   ├── qwen_attributes.v1.txt
│   ├── molmo_points.v1.txt
│   └── taxonomy_learn.v1.md
├── flows/
│   ├── memory_bank_gc.py
│   ├── active_learning_collect.py
│   ├── export_to_label_studio.py
│   ├── retrain.py
│   ├── taxonomy_learn.py
│   ├── drift_detect.py
│   └── gatekeeper_prompt_optimize.py
├── eval/
│   └── golden/
│       └── README.md                # DVC-managed, 10 photos to start
├── main.py                           # FastAPI entry, routes to pipeline/
├── requirements.txt
└── tests/
    ├── unit/
    ├── integration/
    └── regression/

api-service/
├── src/
│   ├── routes/
│   │   ├── detect.route.ts
│   │   ├── feedback.route.ts        # NEW
│   │   ├── jobs.route.ts            # NEW — SSE subscription
│   │   └── health.route.ts
│   ├── services/
│   │   ├── detection-pipeline.service.ts   # rewritten
│   │   ├── memory-bank.service.ts          # NEW
│   │   ├── taxonomy.service.ts             # NEW
│   │   └── feedback.service.ts             # NEW
│   ├── providers/                     # florence/gemini/ollama/google-vision DELETED
│   └── app.ts

docker-compose.dev.yml                # NEW — FOSS stack for dev
observability/
├── prometheus/
│   └── rules/slo.yaml
├── grafana/
│   └── dashboards/
└── tempo/

docs/superpowers/specs/
└── 2026-04-08-multi-model-detection-ensemble-design.md  # THIS FILE
```
