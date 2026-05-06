# Detection & Classification Pipeline — Final Spec

Date: 2026-04-29
Sources: [initial spec](2026-04-29-detection-pipeline-structural-rewrite.md) +
[research](claude-research.md) + [interview](claude-interview.md).
This document is the synthesised specification the implementation plan
will be built from. It supersedes the initial spec where they conflict.

---

## 1. Problem

The current Visual Home Inventory pipeline does not produce a usable
inventory. It misses small/occluded items, emits generic labels, and
gives no honest signal of how complete or how correct a given capture
is. The pipeline today is Florence-2 + a Qwen-VL tier chain orchestrated
by Temporal; the brief mentions Google Vision / AWS Rekognition but
those adapters were already removed during prior plans. The structural
gaps are real and span observation, orchestration, and fusion.

This is a **structural rewrite**, not a patch. Several invariants are
fixed by the user during the interview:

- **AI-only labelling.** No hand-curated taxonomies, no static class
  lists, no fine-tuning datasets to maintain. Class set per scene is
  generated at runtime by a VLM.
- **No human-in-the-loop.** No correction prompts, no review queue.
  The system must self-validate.
- **No human ground truth, anywhere.** Confidence and "correctness" are
  defined by multi-model + multi-frame agreement.
- **No cloud.** Photo never leaves the local Mac; eval cannot use a
  hosted judge.
- **No latency ceiling.** Quality > latency; multi-pass reruns are fine.
- **Async-first contract preserved.** 200 within window, 202+poll
  otherwise. Mobile already handles polling.
- **Mobile-only inventory persistence.** Drift on the device is the
  source of truth. Server is stateless apart from photos on disk and
  pipeline run state.
- **Remove on-device CoreML detection.** Phone always calls the Mac.
- **Replace Temporal with Dagster** as the orchestrator. Keep Fastify
  TS as the HTTP/auth/multipart edge.
- **Aggressive cleanup** of legacy `providers/`, dead schemas, unused
  utilities.
- **Schema rewrite, not migration** — app is not deployed; per project
  rule no migration plan needed.

## 2. Target architecture (high level)

```
Phone (Flutter, mobile-app/)
  ├── Capture screen
  │     ├─ multi-frame burst + best-frame pick
  │     ├─ Laplacian blur + histogram exposure pre-check
  │     ├─ ML Kit face / PII redaction
  │     └─ WebP encode @1280 px longest edge, EXIF stripped
  └── Upload via Bonjour-discovered URL
        │
        ▼
Mac — service A — api-service/ (Fastify TS, kept)
  ├── auth, multipart, idempotency (image SHA-256)
  ├── photo persistence (~/allmythings-data/photos/)
  ├── /v1/detect — enqueue Dagster run, return 200 if quick / 202 with runId
  ├── /v1/detect/status/:runId — poll Dagster run state, return result on completion
  ├── /photos/*  /health  /metrics
  └── (NO model calls of any kind in this service)
        │ HTTP / job queue
        ▼
Mac — service B — pipeline-service/ (Python, NEW)
  Dagster orchestrator with the following ops/assets:
  ├── frame_intake             — receive frame(s) + metadata
  ├── scene_embedding          — DINOv2 whole-image embedding
  ├── vlm_prompt_expansion     — Qwen-VL: "what objects are visible / likely?" → prompt list
  ├── florence_detect          — existing Florence-2 detector (kept), per-frame
  ├── grounding_dino_detect    — open-vocab detector (NEW, ONNX/CoreML or MLX), per-frame
  ├── sahi_recovery            — SAHI tiling on low-coverage regions, conditional rerun
  ├── effsam_segment           — EfficientSAM-Ti masks on confirmed boxes (NEW)
  ├── box_fusion               — WBF across detectors per frame
  ├── crop_embedding           — DINOv2 per-crop embedding
  ├── cross_pass_dedup         — FAISS in-process, similarity ≥ θ → merge
  ├── cross_frame_dedup        — same, scoped to the burst's frames
  ├── classification_refine    — Qwen-VL tier chain (kept) on dedup'd crops
  ├── agreement_scoring        — for each detection: how many independent
  │                              passes/models concur? compute confidence proxy
  ├── self_diagnosis           — agreement-coverage < threshold → spawn stricter rerun
  └── assemble_result          — emit per-detection record + scene record
        │
        ▼  (Dagster run state read by Fastify on poll)
        ▼
  Result returned to phone, written into Drift inventory
```

Two services on the Mac. Single LGTM observability stack instruments
both. Dagster's UI provides DAG-run / asset / log self-diagnosis on top
of the LGTM metrics.

## 3. Definition of "accurate, reliable, resilient" — without human labels

The user's "AI-only labelling, no human-in-the-loop, multi-model +
multi-frame agreement" reframes evaluation. The plan adopts these as
the operative definitions:

- **Accurate** — for a captured scene, every detection that is reported
  with `confidence ≥ τ` is corroborated by ≥ K independent signals
  (where a "signal" is a different detector, a different frame, or a
  different model pass). Detections below K signals are emitted with
  `confidence < τ` and the inventory record carries `agreement_score`
  and the list of corroborating signals so the UI can decide whether to
  show, badge, or collapse them.
- **Reliable** — the same scene captured twice yields stable inventory:
  Jaccard overlap of dedup'd item sets across two captures of the same
  scene is ≥ J on the eval corpus. Reliability is measured continuously
  via the burst's own multi-frame agreement, not via a separate test.
- **Resilient** — when a model is unavailable / slow / returns garbage,
  the pipeline degrades known-good (Dagster ops succeed independently;
  partial agreement still produces an inventory; the run is flagged
  `partial=true` with the missing signals named).

Numerical thresholds (`τ`, `K`, `J`, `θ`) become tunable Dagster
configuration values, not code constants. Initial defaults are proposed
in the plan and evolved on real data.

## 4. Scope decisions, locked in

| Area | Decision |
| --- | --- |
| Compute | Local Mac only |
| Cloud egress | None |
| API contract | Async-first 200 / 202+poll, kept |
| Inventory persistence | Drift on device, sole source of truth |
| Server persistence | Photos on disk + Dagster run history only |
| On-device CoreML detection | Removed |
| Orchestrator | Dagster (Python) |
| HTTP edge | Fastify TS, kept |
| Model additions | Grounding DINO 1.5 Edge, EfficientSAM-Ti, DINOv2 |
| Qwen-VL tiers | Kept (qwen2.5vl:7b / 3b / moondream) |
| Static class lists / taxonomies | Forbidden |
| Per-scene prompts | Generated by VLM at runtime |
| Eval signal | Multi-model + multi-frame agreement |
| Human in loop | None |
| Latency budget | Unbounded |
| Mobile capture v1 | Blur + exposure + face redaction + multi-frame burst + WebP@1280 |
| Schema migrations | Not needed; rewrite directly |
| Legacy code cleanup | Aggressive |

## 5. What changes in the repo

### 5.1 KEEP (intact or with light edits)

- `api-service/src/routes/detect.route.ts` — keep contract; replace its
  Temporal client call with a Dagster run-launcher call.
- `api-service/src/routes/detect-status.route.ts` — keep contract;
  replace Temporal status query with Dagster run-state query.
- `api-service/src/routes/photos.route.ts`, `health.route.ts`,
  `metrics.route.ts` — unchanged.
- `api-service/src/telemetry/*` — kept (OTel + Prometheus + traceparent).
- `api-service/src/utils/bonjour-advertiser.ts` — kept.
- `api-service/src/services/provider-health.service.ts` — keep but
  rewire to ping Dagster + Florence + Ollama + Grounding-DINO service.
- `mobile-app/lib/data/repositories/detection_repository.dart` —
  keep retry / 202-poll logic; types updated.
- `mobile-app/lib/data/database/app_database.dart` — keep table-set
  for `inventory_items` + `labels` + FTS; **rewrite** schema to add
  detections / embeddings / agreement / scene context (see §5.4).

### 5.2 REPLACE

- `api-service/src/temporal/**` — delete in favour of Dagster
  pipeline-service. Workflow, activities, client, worker, replay tests
  all gone.
- `api-service/src/services/vision-orchestrator.service.ts` (if any
  references remain) — gone.
- `api-service/src/services/ensemble-fusion.service.ts` (if it exists)
  — replaced by Dagster `box_fusion` op.
- `api-service/src/temporal/shared-types.ts` `EnrichedItem` — replaced
  by a richer typed record (see §5.5).
- The Florence/Ollama provider classes in
  `api-service/src/providers/` — deleted.
- `api-service/src/schemas/detection.schema.ts` — deleted (legacy).
- `mobile-app/lib/application/providers/detection_providers.dart` —
  CoreML-fast-path branch removed; only the server path remains.
- `mobile-app/lib/presentation/camera/camera_capture_screen.dart` —
  replaced/extended for multi-frame burst + on-device gating.

### 5.3 ADD

- `pipeline-service/` (NEW Python service):
  - `pyproject.toml`, `uv.lock` (per project's uv preference).
  - `pipeline_service/dagster_defs.py` (assets / ops registry).
  - `pipeline_service/ops/{frame_intake, scene_embedding,
    vlm_prompt_expansion, florence_detect, grounding_dino_detect,
    sahi_recovery, effsam_segment, box_fusion, crop_embedding,
    cross_pass_dedup, cross_frame_dedup, classification_refine,
    agreement_scoring, self_diagnosis, assemble_result}.py`.
  - `pipeline_service/models/` — model loaders (ONNX/CoreML/MLX, Ollama
    HTTP client, Florence HTTP client) with Apple-Silicon-specific
    quantisation choices documented.
  - `pipeline_service/storage/` — local FAISS index (in-memory + on-disk
    snapshot under `~/allmythings-data/index/`).
  - `pipeline_service/api/` — FastAPI sidecar for Fastify to call:
    `POST /runs` (launch) and `GET /runs/:id` (status).
  - `pipeline_service/tests/` — pytest harness, deterministic op tests
    with cached fixtures.
- `api-service/src/clients/dagster.client.ts` — TS client for the
  pipeline-service sidecar (replaces the Temporal client).
- `mobile-app/lib/services/image_quality.dart` — Dart port of the
  blur/exposure check (or platform-channel binding for native).
- `mobile-app/lib/services/face_redaction.dart` — ML Kit binding.
- `mobile-app/lib/services/burst_capture.dart` — multi-frame burst +
  best-frame pick.
- Eval rig (Python, under `pipeline-service/eval/`) — runs the pipeline
  on a corpus of locally captured scenes, computes agreement-coverage
  / agreement-precision / multi-frame stability, reports a JSON
  metrics file consumed by CI.

### 5.4 NEW Drift schema (rewrite, no migration)

```dart
inventory_items   // existing, lightly extended
  id, photoPath, thumbnailPath, serverPhotoUrl?,
  status, createdAt, updatedAt,
  sceneId? (FK scenes.id),
  isFlagged (BOOL, true when self_diagnosis flagged the run)

scenes               // NEW
  id PK, captureSessionId,
  sceneEmbedding (BLOB, DINOv2 vector),
  proposedPromptList (JSON, what the VLM asked for),
  agreementCoverage (REAL),
  agreementPrecision (REAL),
  selfDiagnosisTriggered (BOOL),
  createdAt

detections           // NEW — one row per dedup'd object instance
  id PK, itemId FK inventory_items, sceneId FK scenes,
  bbox (JSON x,y,w,h),
  maskRle? (BLOB),
  cropEmbedding (BLOB, DINOv2 vector),
  agreementScore (REAL),
  contributingSignals (JSON [{detector, frame, conf}, ...]),
  vlmStructuredAttributes (JSON; current EnrichedItem.attributes),
  primaryLabel (TEXT — chosen by agreement, not from a class list),
  alternateLabels (JSON [{label, conf}, ...]),
  confidence (REAL — calibrated by agreement count),
  createdAt

labels               // existing, kept for free-form structured attributes
  (unchanged; primary inventory category lives on detections.primaryLabel)

label_search_fts     // existing FTS, extended to also index
                     // detections.primaryLabel + alternateLabels
```

Schema versioning bumps directly to a fresh version; no migration step.

### 5.5 NEW shared types

```ts
// in api-service/src/types/pipeline.ts (new)
type FrameId = string;
type SceneId = string;

interface PipelineDetection {
  id: string;
  frameId: FrameId;
  bbox: { x: number; y: number; width: number; height: number };
  maskRleB64?: string;
  cropEmbeddingB64?: string;     // DINOv2
  primaryLabel: string;
  alternateLabels: { label: string; confidence: number }[];
  attributes: Record<string, unknown>;
  agreementScore: number;
  contributingSignals: { detector: string; frame: FrameId; confidence: number }[];
  confidence: number;            // = f(agreementScore, calibration)
}

interface SceneObservation {
  sceneId: SceneId;
  frameIds: FrameId[];
  sceneEmbeddingB64: string;
  proposedPromptList: string[];
  detections: PipelineDetection[];
  agreementCoverage: number;
  agreementPrecision: number;
  selfDiagnosisTriggered: boolean;
  flagged: boolean;
}
```

`EnrichedItem` is replaced by `PipelineDetection`. `DetectResult`
becomes `SceneObservation` (with multiple detections).

## 6. Pipeline behaviour spec — what each op promises

(Full op-level test stubs land in `claude-plan-tdd.md`. This section
defines contracts; the plan section sequences and tests them.)

| Op | Input | Output | Failure semantics |
| --- | --- | --- | --- |
| frame_intake | bytes + EXIF | normalised RGB tensor + metadata | reject on mime mismatch, abort run |
| scene_embedding | RGB tensor | 1024-d float vector | retry 3×; on final fail mark scene `flagged`, continue |
| vlm_prompt_expansion | RGB tensor | list of class prompts | retry 3×; on final fail use a *generic* fallback prompt produced by Florence captions, mark `flagged` |
| florence_detect | RGB tensor | regions + captions | as today |
| grounding_dino_detect | RGB tensor + prompts | boxes + scores per prompt | retry 3×; on final fail run continues with Florence-only signal but `agreementCoverage` will drop, triggering self-diagnosis |
| sahi_recovery | RGB tensor + low-coverage mask | tiled detections merged back | conditional; only fires if first pass coverage < threshold |
| effsam_segment | RGB tensor + box | binary mask | best-effort; mask unavailable doesn't fail the detection |
| box_fusion | per-frame, per-detector boxes+scores | fused boxes per frame | deterministic |
| crop_embedding | RGB crop | DINOv2 vector | retry 3×; on fail emit zero vector + flag |
| cross_pass_dedup | embeddings + boxes | reduced set | deterministic |
| cross_frame_dedup | per-frame outputs of previous op | scene-level set | deterministic |
| classification_refine | crop + frame context | structured attributes (current Qwen-VL output) | tier chain as today, retained |
| agreement_scoring | scene-level set + signal log | per-detection agreement_score, scene-level coverage / precision | deterministic |
| self_diagnosis | scene-level metrics | optional rerun directive | bounded recursion (≤ N reruns) |
| assemble_result | scene-level set | `SceneObservation` | always succeeds (returns partial + flagged on upstream failures) |

## 7. Out of scope

- Any cloud / hosted-model evaluation. (Locked by Q10.)
- Any human-curated taxonomy or fine-tuning corpus. (Locked by Q5.)
- Any human-in-the-loop UI. (Locked by Q7.)
- Any sub-second latency obligation. (Locked by Q6.)
- Any cross-device sync / web admin / multi-tenant. (Out of original
  spec; locked by Q3 mobile-only Drift.)

## 8. Risks the plan must address

1. **Apple-Silicon viability of Grounding DINO 1.5 Edge / EfficientSAM /
   DINOv2.** Plan section 1 must verify each via ONNX-Runtime CoreML EP
   or MLX before committing. Fallback: Florence-2 only with VLM-driven
   re-detection passes (lower ceiling but viable).
2. **Agreement as ground truth can be self-confirming.** Two detectors
   with the same blind spot will agree on what they jointly miss. The
   plan introduces *frame-time* agreement (different captures of the
   same scene) and *prompt-perturbation* agreement (rerun with rephrased
   prompts) as orthogonal axes to reduce this risk.
3. **Self-diagnosis recursion** — bounded recursion + budget per scene
   to avoid runaway reruns.
4. **Drift schema rewrite breaks any locally-captured user data.** Per
   stored memory the app is not deployed; acceptable. Plan must still
   rebuild local DB cleanly on first launch.
5. **VLM prompt expansion drift.** The Qwen-VL prompt-expansion output
   is non-deterministic; the plan caches expansion-per-scene-embedding
   in the FAISS index and snapshots it for replay tests.
6. **Dagster on a developer Mac vs. a service** — Dagster typically runs
   as a daemon. Plan covers dev-loop ergonomics: `make start` brings up
   Dagster + Florence + Ollama + Fastify together.
7. **Cleanup vs. churn** — deleting Temporal removes a working code
   path. Plan sequences the cutover so Fastify is never running against
   a half-built Dagster service.

## 9. Success criteria for the plan

A competent engineer with no prior context should be able to:

1. Read the plan and explain the new architecture in one paragraph.
2. Run the eval rig on day 1 of execution and see real
   agreement-coverage / agreement-precision numbers.
3. Pick up any section, see the failing test stubs, start implementing.
4. Tell me, for any file in `api-service/src/services/`,
   `api-service/src/adapters/`, `api-service/src/temporal/`,
   `api-service/src/providers/`, `api-service/src/schemas/`, whether
   to **keep, replace, or delete**.

The plan that follows commits to all of the above.
