# Detection Pipeline Rewrite — TDD Test Plan

Companion to [claude-plan.md](claude-plan.md). For each implementation
section, this document specifies the **failing tests to write first**
before any production code.

**Rule:** stubs means stubs. Test entries below are prose descriptions
or minimal signatures. The implementer writes the assertions, fixtures,
and mocks. Do **not** copy these descriptions into production tests
verbatim — they are scaffolding, not finished tests.

**Frameworks (matched to existing repo):**
- `api-service/`        → **Vitest** (kept) — files under `api-service/tests/`
- `pipeline-service/`   → **pytest** (new) — files under `pipeline-service/tests/`
- `mobile-app/`         → **flutter_test + integration_test** (kept) — files under `mobile-app/test/` and `mobile-app/integration_test/`

**Determinism rule:** every model call in tests is mocked (no live HTTP
to Florence / Ollama / Grounding-DINO / DINOv2). Real-model integration
runs only via `make eval` against the local corpus, never in the unit/
integration suite.

---

## §0–2 Executive summary, architecture, repo map

No tests required at this level — these sections are informational and
gated by the section-level tests below.

A single **structure test** lives at `pipeline-service/tests/test_repo_structure.py`
that asserts the directory layout in §2 exists (every named file is
either present or explicitly absent — e.g., `api-service/src/temporal/`
must exist before Phase 5 and not exist after).

---

## §3.0 Cross-cutting op concerns

Tests live at `pipeline-service/tests/unit/test_op_concerns.py`:

```python
# Test: every op exposes deterministic ordering — given the same input
#       in two different list orders, output is byte-equal.
# Test: every numeric op produces 0.0 (not NaN) for empty input.
# Test: ollama_client.OllamaClient holds an asyncio.Semaphore(1) per
#       model — verified by spawning N concurrent calls and asserting
#       exactly one is in flight at a time.
# Test: log_redaction strips full prompt/attribute content from log
#       records and replaces with structural shape (len + sample).
# Test: log_redaction is enabled by default in pipeline_service.api.server
#       — verified by capturing logs through caplog.
# Test: replay-test infrastructure: given a fixture under tests/replay/fixtures/,
#       replaying the op produces byte-equal output to the recorded one.
```

---

## §3.1 frame_intake

`pipeline-service/tests/unit/ops/test_frame_intake.py`:

```python
# Test: accepts list of 3 frames, returns 3 Frame records with EXIF orientation preserved
# Test: strips EXIF GPS / timestamp tags from emitted Frame
# Test: rejects unsupported mime → raises UnsupportedMediaTypeError (non-retryable)
# Test: one frame fails decoding, two succeed → emits Frame(decoding_failed=True)
#       for the bad one, real Frames for the good ones, op succeeds
# Test: ALL frames fail decoding → raises UnsupportedMediaTypeError
# Test: writes original bytes to ~/allmythings-data/photos/{sha256}.{ext}
#       (use tmp_path fixture for the photo dir)
# Test: handles single-frame request payload (legacy v0 shape, defensive)
```

---

## §3.2 scene_embedding

`pipeline-service/tests/unit/ops/test_scene_embedding.py`:

```python
# Test: returns 768-d float16 L2-normalised vector per frame on happy path
#       (mock dinov2 model)
# Test: retries 3× on model exception, then emits SceneEmbedding(embedding_failed=True,
#       vector=zero_vector)
# Test: zero-vector flag does NOT collide with real-vector hashes (i.e., the
#       hash function distinguishes zero from non-zero)
# Test: per-frame independence — failure of one frame does not abort others
# Test: vector dim of 768 is asserted at runtime (catches the
#       ViT-S/14-vs-ViT-B/14 swap risk)
```

---

## §3.3 vlm_prompt_expansion

`pipeline-service/tests/unit/ops/test_vlm_prompt_expansion.py`:

```python
# Test: cache hit returns cached PromptList with cached=True
# Test: cache miss runs both seeds (Qwen + Florence) and returns union
# Test: when ANY frame has embedding_failed=True, cache is BYPASSED entirely
#       (regression for the zero-vector collision bug)
# Test: prompt list is sanitised — lowercased, deduped, capped at M (default 80),
#       drops items > N tokens
# Test: Qwen seed fails but Florence seed succeeds → returns Florence-only
#       prompt list, source_models=['florence-2'], degraded=False
# Test: BOTH seeds fail → returns PromptList(prompts=[], degraded=True)
# Test: cache key is hash(round(median_scene_embedding, 3 dp)) —
#       similar embeddings hit, dissimilar miss
# Test: parse failure on Qwen response retries 3× then degrades gracefully
```

---

## §3.4 florence_detect

`pipeline-service/tests/unit/ops/test_florence_detect.py`:

```python
# Test: emits RawDetection with raw_confidence=None for every detection
#       (Florence emits no score)
# Test: per-frame retry (3×) on HTTP 5xx; succeeds on retry
# Test: per-frame final fail emits FrameDetections(detector_error=True, detections=[])
#       — does NOT abort the op for other frames
# Test: heartbeat is emitted every ≤5s during long Florence calls
# Test: regions[].caption maps to RawDetection.label
# Test: detector field is "florence" on every emitted detection
```

---

## §3.5 grounding_dino_detect

`pipeline-service/tests/unit/ops/test_grounding_dino_detect.py`:

```python
# Test: filters detections below config.thresholds.gdino_score_thr (default 0.30)
# Test: each prompt produces 0..N detections; raw_confidence carries model score
# Test: per-frame retry + degraded fallback semantics same as florence_detect
# Test: detector field is "gdino" on every emitted detection
# Test: empty PromptList → emits FrameDetections(detections=[], detector_error=False)
```

`pipeline-service/tests/integration/test_gdino_apple_silicon_spike.py`:

```python
# Test: model loads on Apple Silicon (skip if not on macOS arm64)
# Test: per-frame inference latency ≤ 2s (3s if BERT text encoder falls back to CPU)
# Test: resident memory ≤ 3 GB during inference
# Test: spike acceptance — runs against §11.1 fixture set; FAILS the build
#       if criteria not met (this is the gate before Phase 4b ships)
```

---

## §3.6 sahi_recovery

`pipeline-service/tests/unit/ops/test_sahi_recovery.py`:

```python
# Test: triggers ONLY when first-pass density < config.sahi_trigger_density
# Test: skipped frames produce no FrameDetections output (not empty — none)
# Test: tile boxes are re-projected to full-frame coordinates correctly
# Test: tiles overlapping with first-pass boxes (IoU > 0.5) are deduplicated out
# Test: tile retries on transient failure; persistent tile failure → recorded
#       in tile_errors but op succeeds
# Test: >50% tile failure rate elevates run-level warning (downstream
#       agreement_scoring picks this up)
# Test: detector field is "gdino-sahi" on every emitted detection
```

---

## §3.7 effsam_segment

`pipeline-service/tests/unit/ops/test_effsam_segment.py`:

```python
# Test: emits Mask per box on happy path
# Test: mask IoU < 0.4 with input bbox → mask dropped (likely occlusion bleed)
# Test: EfficientSAM unavailable → op succeeds with empty masks; downstream
#       crop_embedding falls back to bbox crop
# Test: per-box failure does not abort op
```

`pipeline-service/tests/integration/test_effsam_apple_silicon_spike.py`:

```python
# Test: 30-box scene end-to-end ≤ 2s on M2 Pro / M3 Pro
# Test: median mask IoU with bbox ≥ 0.5 on a 5-image fixture set
# Test: resident memory ≤ 1 GB
```

---

## §3.8 box_fusion

`pipeline-service/tests/unit/ops/test_box_fusion.py`:

```python
# Test: WBF iou_thr=0.5 fuses two overlapping boxes (IoU 0.6) into one
# Test: WBF does NOT fuse non-overlapping boxes (IoU 0.2)
# Test: detector_weights honoured — Florence(0.5) + gdino(1.0) overlapping
#       cluster keeps gdino's primary_label as primary
# Test: Florence raw_confidence=None is treated as 0.5 for WBF weighting
# Test: contributing_signals records every (detector, frame_id, raw_confidence)
#       that contributed to the cluster
# Test: deterministic — inputs sorted (detector, frame_id, label, x, y) before
#       fusion; calling box_fusion twice on the same input produces byte-equal output
# Test: empty input → FusedFrame(frame_id, fused=[])
# Test: alternates list contains the suppressed labels with their raw scores
```

---

## §3.9 crop_embedding

`pipeline-service/tests/unit/ops/test_crop_embedding.py`:

```python
# Test: emits 768-d float16 L2-normalised vector per box (pre-quantisation)
# Test: int8 quantisation reduces vector to 768 bytes; cosine ≥ 0.99 with f16
# Test: uses EfficientSAM mask edge if mask exists, else bbox
# Test: per-crop retry; persistent failure flags detection embedding_unavailable=True
#       and excludes from cross_frame_dedup
# Test: empty input → EmbeddedFrame(frame_id, embeddings={})
```

---

## §3.10 cross_pass_dedup

`pipeline-service/tests/unit/ops/test_cross_pass_dedup.py`:

```python
# Test: merges two boxes within one frame when IoU > 0.7 AND label_text_compat
# Test: merges when crop_embedding cosine ≥ 0.88 AND label_text_compat
# Test: does NOT merge when label_text_compat is False (e.g., "table"/"chair")
# Test: merge keeps the detection with the highest len(contributing_signals);
#       discarded detection's signals are appended to the survivor
# Test: empty input → DedupedFrame(detections=[])
# Test: non-overlapping detections pass through unchanged
```

---

## §3.11 cross_frame_dedup

`pipeline-service/tests/unit/ops/test_cross_frame_dedup.py`:

```python
# Test: 3 frames each with 1 detection of the same object →
#       SceneObservation has 1 detection with agreement_score reflecting all 3 frames
# Test: 3 frames with 1 different object each → 3 detections, no merges
# Test: dedup requires (cosine ≥ 0.85) AND (label_text_compat == True)
#       AND (different frame_ids) — same-frame pairs are NEVER merged here
#       (that's cross_pass_dedup's job)
# Test: label_text_compat negative gate blocks merges of "plant"/"vase"
#       even when crop embeddings are similar
# Test: FAISS index is per-run only — no persistence across runs (rebuilt each time)
# Test: empty input → SceneObservation(detections=[])
```

`pipeline-service/tests/unit/ops/test_label_text_compat.py`:

```python
# Test: ("sofa", "couch") → True
# Test: ("table", "chair") → False
# Test: ("lamp", "light") → True
# Test: ("plant", "vase") → False
# Test: ("coffee mug", "cup") → True
# Test: ("dining chair", "office chair") → True (same category, different role —
#       the embedding gate doesn't distinguish; that's by design — bbox/embedding
#       still has to corroborate)
# Test: encoder is sentence-transformers/all-MiniLM-L6-v2 (asserted by inspecting
#       loaded model name)
# Test: threshold 0.6 is read from config.thresholds.labelTextCompatTheta
# Test: encodings are cached within a run
# Adversarial fixture set lives at tests/replay/fixtures/label_compat_pairs.json;
# every entry is asserted as a parametrised test.
```

---

## §3.12 classification_refine

`pipeline-service/tests/unit/ops/test_classification_refine.py`:

```python
# Test: tier chain qwen7b → qwen3b → moondream → empty {} on cascading failure
# Test: dedup'd detections (not raw Florence regions) drive the call list
# Test: vlmStructuredAttributes populated on success
# Test: vlmStructuredAttributes = {} (not a fake default) when all tiers fail
# Test: Ollama semaphore is honoured — concurrent ops don't double-fire Qwen
# Test: parse failure on tier output → fall through to next tier (non-retryable
#       error type, matches existing Temporal behaviour)
```

---

## §3.13 agreement_scoring

`pipeline-service/tests/unit/ops/test_agreement_scoring.py`:

```python
# Test: Florence + gdino on the same frame → signal_classes = {"first_pass",
#       "frame:F1"}; agreement_score = 2 (Florence/gdino share class — REGRESSION
#       TEST for the bug fixed in iteration-1-opus.md §2a)
# Test: Florence + gdino + sahi on F1 → {"first_pass", "tiled", "frame:F1"} = 3
# Test: same detection corroborated across F1, F2, F3 with first_pass on each →
#       {"first_pass", "frame:F1", "frame:F2", "frame:F3"} = 4
# Test: confidence sigmoid: score=1 → 0.27±ε; score=2 → 0.50±ε; score=3 → 0.73±ε;
#       score=4 → 0.88±ε; score=5 → 0.95±ε
# Test: empty detection set → coverage=0.0, precision=0.0 (NOT NaN)
# Test: empty detection set + non-blank scene_embedding → flagged=True,
#       flag_reason="empty_detection_set"
# Test: empty detection set + blank scene_embedding (norm < ε) → flagged=False
# Test: every detection has signal_classes == {"first_pass"} only AND only
#       Florence contributed (gdino + sahi failed, only one frame usable) →
#       flagged=True, flag_reason="single_source_run"
# Test: rerunDepth field is propagated from the input
```

---

## §3.14 self_diagnosis

`pipeline-service/tests/unit/ops/test_self_diagnosis.py`:

```python
# Test: agreement_coverage above τ_cov AND precision above τ_prec → terminal
#       (yields SceneObservation directly, no DynamicOut)
# Test: coverage below τ_cov → yields DynamicOut(RerunDirective(level=1))
# Test: precision below τ_prec → yields DynamicOut(RerunDirective(level=1))
# Test: flag_reason "empty_detection_set" → yields DynamicOut(level=1)
# Test: flag_reason "single_source_run" → yields DynamicOut(level=1)
# Test: rerunDepth == MAX_RERUNS (default 2) → terminal,
#       flag_reason="diagnosis_budget_exhausted"
# Test: no-improvement bail-out — coverage(rerun_k) ≤ coverage(rerun_{k-1}) →
#       terminal with the PREVIOUS rerun's result, not the latest
# Test: Level 2 ladder: θ_new = max(θ - 0.05, 0.7) — NOT halved
#       (regression for the §6.4 bug)
# Test: DynamicOut shape is asserted — Dagster materialises one branch per
#       yielded element

# Integration test (pipeline-service/tests/integration/test_self_diagnosis_dag.py):
# Test: full DAG runs with simulated low-coverage scene → DynamicOut spawns
#       rerun_branch in the same DAG (NO sub-run), lineage visible via
#       Dagster's run-storage API
```

---

## §3.15 assemble_result

`pipeline-service/tests/unit/ops/test_assemble_result.py`:

```python
# Test: pure transformation — no model calls, no I/O
# Test: emits final JSON shape matching the SceneObservation type
# Test: try/except — Pydantic validation error inside the op produces a
#       minimal valid SceneObservation with flagged=True,
#       flag_reason="assemble_failed", and exception summary in errors[]
#       (the op does NOT raise)
# Test: tile_errors are aggregated across frames into the final SceneObservation.tileErrors
# Test: errors[] from upstream ops are propagated unchanged
```

---

## §4.1 Mobile ↔ Fastify

`api-service/tests/unit/routes/detect.route.test.ts`:

```ts
// Test: POST /v1/detect with 3 multipart parts (the burst) → calls pipeline.client
//       with photoPaths.length === 3
// Test: 200 sync response when pipeline completes within httpResponseTimeoutMs
// Test: 202 with { runId, statusUrl } when pipeline does not complete in time
// Test: 503 with Retry-After when pipeline.client returns queue_full
// Test: idempotency_key is sha256 of concatenated frame hashes
// Test: idempotent_hit && status='succeeded' → 200 with cached result, no waitForCompletion
// Test: traceparent header is forwarded
// Test: legacy single-frame multipart (1 part) is REJECTED with 400 once Phase 6 is live
//       (during transition, accepted via translation layer in services/translation/)
```

`api-service/tests/unit/routes/detect-status.route.test.ts`:

```ts
// Test: 200 on completed run, returns SceneObservation (NOT EnrichedItem/DetectResult)
// Test: 202 on running
// Test: 500 on failed/cancelled/timed_out
// Test: 404 on unknown runId
```

---

## §4.2 Fastify ↔ pipeline-service

`api-service/tests/unit/clients/pipeline.client.test.ts`:

```ts
// Test: launchRun POSTs idempotency_key + photo_paths
// Test: 202 → returns { runId, startedAt, idempotentHit: false }
// Test: 200 idempotent_hit=true (running) → returns { runId, idempotentHit: true, status: 'running' }
// Test: 200 idempotent_hit=true (succeeded) → returns { ..., result: SceneObservation }
// Test: 503 queue_full → throws QueueFullError carrying retry_after_s
// Test: waitForCompletion uses long-poll /wait first; falls back to short-poll
//       (250ms → 2s exponential, capped) on /wait timeout
// Test: waitForCompletion respects deadlineMs; returns last status on deadline
// Test: total polling RPS capped at 5/s/run
// Test: circuit-breaker integration — repeated 5xx opens the breaker;
//       subsequent calls return fast 503 without hitting sidecar
```

`pipeline-service/tests/integration/test_sidecar_api.py`:

```python
# Test: POST /runs returns 202 with run_id; new run materialises in Dagster
#       instance storage
# Test: idempotency: second POST with same idempotency_key while first is running
#       returns the same run_id (200, idempotent_hit=true, status=running)
# Test: idempotency: POST with same key after first succeeded returns cached result
# Test: GET /runs/:id returns current status
# Test: GET /runs/:id/wait?timeout_s=2 long-polls and resolves on completion event
# Test: GET /runs/:id/wait times out after timeout_s with current state, NOT 5xx
# Test: GET /runs/:id/timeline returns per-op timing including DynamicOut fan-out count
# Test: backpressure — submitting 5 concurrent runs with max_queue_depth=4 →
#       the 5th gets 503 with queue_depth=4
```

---

## §4.3 PipelineClient

(Covered in §4.2 above.)

---

## §5 Data model & types

`api-service/tests/unit/types/pipeline.types.test.ts`:

```ts
// Test: PipelineDetection serialises/deserialises round-trip with Pydantic
//       (fixture file holds same JSON; both sides parse it identically)
// Test: ContributingSignal.rawConfidence accepts null
// Test: SceneObservation.flagReason union covers all named reasons
// Test: tileErrors aggregation type matches Python TileError shape
```

`pipeline-service/tests/unit/test_types.py`:

```python
# Test: Pydantic dataclasses validate against the same fixture JSON used on the TS side
# Test: SceneEmbedding.vector shape == (768,) and dtype == float16
# Test: RawDetection.raw_confidence Optional[float] accepts None for Florence
```

`mobile-app/test/data/database/app_database_test.dart`:

```dart
// Test: schema version is 5
// Test: on first launch with version<5 on disk, DB is rebuilt
// Test: detections.cropEmbeddingI8 column is BLOB of exactly 768 bytes
// Test: detection_labels FTS query returns rows where label matches via FTS5
// Test: inventory_items has NO sceneId column (removed redundancy)
// Test: scenes has NO proposedPromptList column (debug-only; lives in Dagster)
// Test: alternateLabels are denormalised into detection_labels (NOT JSON column)
// Test: storage budget — 1000 detection rows fits under 50 MB on disk
//       (synthesised data, asserts SQLite file size after vacuum)
```

---

## §6 Self-diagnosis & agreement scoring math

`pipeline-service/tests/unit/test_agreement_math.py`:

```python
# Test: signal_class_of('florence') == 'first_pass'
# Test: signal_class_of('gdino') == 'first_pass'  (regression — same class)
# Test: signal_class_of('gdino-sahi') == 'tiled'
# Test: signal_class_of('frame:abc') == 'frame:abc'
# Test: confidence formula matches the table in §6.2 across all integer scores 0..5
# Test: agreement_coverage on detection list with mixed scores returns the
#       expected mean(1{score≥2})
# Test: agreement_precision returns mean(1{score≥3})
# Test: empty detection list → coverage=0.0, precision=0.0

# Test (rerun ladder):
# Test: Level 2 θ = max(θ_in - 0.05, 0.7) for input θ in {0.85, 0.80, 0.75, 0.72}
#       → {0.80, 0.75, 0.70, 0.70} (regression for halve-bug)
# Test: gdino_score_thr lowering at Level 1: max(thr_in - 0.10, thr_in * 0.70, 0.05)
```

---

## §7 Eval rig

`pipeline-service/tests/unit/eval/test_metrics.py`:

```python
# Test: agreement_coverage handles empty observation
# Test: multi_frame_stability between identical SceneObservations = 1.0
# Test: multi_frame_stability between disjoint SceneObservations = 0.0
# Test: self_diagnosis_trigger_rate counts runs with selfDiagnosisTriggered=True
# Test: op_failure_rate counts runs with errors[] non-empty
# Test: single_source_run_rate counts runs with flag_reason='single_source_run'
# Test: empty_detection_set_rate counts only flagged ones (NOT every empty run)
```

`pipeline-service/tests/integration/test_eval_rig.py`:

```python
# Test: run_eval against a tiny synthetic corpus produces last-metrics.json
# Test: thresholds.json honoured — exit code 0 when within thresholds, 1 when not
# Test: missing corpus → exits 1 with clear error (Phase 7 starter task gate)
# Test: until corpus exists, make eval reports without gating (exit 0 even on
#       low metrics) — mode is detected from corpora/ being empty
```

---

## §8 Observability + Dagster runbook

`pipeline-service/tests/unit/test_log_redaction.py`:

```python
# Test: vlm_prompt_expansion output logged via the redacting formatter shows
#       only len + sample_first_3, not full prompt list
# Test: classification_refine output logged via the redactor shows only
#       structural shape, not content
# Test: Dagster asset metadata is unchanged (full content preserved there)
# Test: redactor enabled by default in pipeline_service.api.server bootstrap
```

`api-service/tests/unit/telemetry/log_redaction.test.ts`:

```ts
// Test: Pino logger redacts result.detections.*.vlmStructuredAttributes
//       paths to "<redacted len=N keys=[...]>"
// Test: redactor configured at app bootstrap, not per-request
```

`pipeline-service/tests/integration/test_dagster_retention.py`:

```python
# Test: storage/retention.prune_runs keeps the most-recent N runs
#       (default 200) and deletes older ones
# Test: schedule fires nightly per Dagster cron config
```

---

## §9 Mobile capture changes

`mobile-app/test/services/image_quality_test.dart`:

```dart
// Test: Laplacian variance < 100 returns blurry=true
// Test: histogram with > 5% saturated white pixels → exposure='overexposed'
// Test: histogram with > 5% black pixels → exposure='underexposed'
// Test: pure-Dart Laplacian implementation matches a 5-image fixture set
//       within 1% of the reference OpenCV values
```

`mobile-app/test/services/face_redaction_test.dart`:

```dart
// Test: ML Kit face detector returns N faces; each bbox is blurred in the
//       output (Gaussian k=31)
// Test: output WebP differs from input WebP wherever a face bbox sits
// Test: original frame buffer is zeroed after encoding (memory inspection
//       via WeakReference + force GC)
```

`mobile-app/test/services/burst_capture_test.dart`:

```dart
// Test: capture() returns exactly 3 frames at ~100ms apart
// Test: all 3 frames are returned even if one fails blur (the burst as a whole
//       is rejected only when ALL frames fail)
// Test: when ALL 3 fail blur, result.allBlurry=true and the capture screen
//       prompts retake
```

`mobile-app/test/services/upload_encoder_test.dart`:

```dart
// Test: longest edge resized to 1280px, aspect preserved
// Test: WebP quality 75
// Test: EXIF GPS / timestamp stripped; orientation preserved
// Test: encoded WebP < 1.5 MB for representative kitchen photo
```

`mobile-app/integration_test/burst_upload_test.dart`:

```dart
// Test: tap capture button → 3 frames captured → 3 multipart parts in upload
// Test: detection_repository sends sha256 of concatenated frame hashes as
//       idempotency_key (matches §4.1)
// Test: 200 response → SceneObservation parsed and persisted to Drift
// Test: 202 response → polling resolves and persists
// Test: 503 with Retry-After → backoff matches existing logic
```

`mobile-app/test/data/repositories/detection_repository_test.dart`:

```dart
// Test: detectObjects(List<File> 3-frame) sends multipart with 3 parts
// Test: parses new SceneObservation shape (not EnrichedItem/DetectResult)
// Test: persists 1 inventory_items + 1 scenes + N detections + N+ detection_labels
// Test: sets isFlagged when SceneObservation.flagged=true
```

`mobile-app/integration_test/inventory_render_test.dart`:

```dart
// Test: item_detail_screen renders correctly when vlmStructuredAttributes={}
//       (no NPE, all fields show "—" or hidden)
// Test: item_detail_screen renders correctly with full attributes
// Test: scene flag badge appears when isFlagged=true
```

---

## §10 Cleanup phases — phase-gate tests

These are not runtime tests; they are CI / lint-rule assertions that
guard the cutover sequence.

`api-service/scripts/check-phase-gates.ts`:

```ts
// Test: Phase 5 lint — fails CI if api-service/src/temporal/ exists AND
//       USE_PIPELINE_SERVICE feature flag has been removed (signals that
//       Phase 5 is over but Temporal wasn't deleted)
// Test: Phase 5 lint — fails CI if api-service/src/services/translation/
//       exists past Phase 5 acceptance
// Test: Phase 6 lint — fails CI if mobile detection_providers.dart still
//       references CoreMLDetector
// Test: Phase 5 lint — fails CI if api-service/src/utils/circuit-breaker.ts
//       is missing (it's KEPT, not deleted)
```

`pipeline-service/scripts/check-phase-gates.py`:

```python
# Test: Phase 5 acceptance — last 2 entries in eval/changelog.md show
#       all-green metrics
# Test: corpus exists at eval/corpora/ before Phase 5 acceptance
```

---

## §11–12 Risks, non-goals, done

No test stubs (informational sections).

Done-criteria assertions live in the smoke test:

`scripts/smoke-assertions.ts`:

```ts
// Test: make start brings up all services in order (Florence → Ollama →
//       pipeline-service warm-up → Fastify → Dagster webserver)
// Test: pipeline-service /health returns ready=true after warm-up
// Test: Fastify /health includes pipeline status, Florence status, Ollama status
// Test: hitting /v1/detect with the synthetic 3-frame fixture returns a
//       SceneObservation within 60s
// Test: Dagster webserver responds at localhost:3001 and shows the smoke run
// Test: temp dir cleanup — no orphan photo files after smoke
```

---

End of TDD plan.
