Now I have a comprehensive understanding. Let me write the section content.

# section-08-mobile-rewrite

> **Phase 6 of the plan.** Mobile rewrite — happens BEFORE Phase 5 (Temporal deletion) so the system is never in a half-working state where mobile is on legacy types but Fastify is on the new pipeline.

## Status & dependencies

| Item | Value |
| --- | --- |
| Depends on | section-02-fastify-pipeline-client (Fastify exposes `SceneObservation` over `/v1/detect` and `/v1/detect/status/:runId`) |
| Blocks | section-09-eval-rig (helpful — real-frame regression), section-10-cleanup-cutover (gates Phase 5) |
| Parallelizable with | section-03-legacy-equivalent-ops, sections 04–07 (different repo, independent files) |
| Test command | `cd mobile-app && flutter test && flutter test integration_test` |

This section is implementable in isolation. It does not depend on the new pipeline ops landing — it depends only on the **type contract** (`SceneObservation`) being agreed at the Fastify edge, which section-02 ships.

---

## Background context

The current Visual Home Inventory mobile app does best-frame picking on-device, has an optional CoreML on-device detection branch alongside the server path, and persists to a Drift schema (≤ v4) that stores legacy `EnrichedItem` / `DetectResult` shapes. Image-quality gating lives server-side in `api-service/src/services/image-quality.service.ts`.

The new architecture, by contrast:

- Sends a **3-frame burst** per capture (multi-frame is the primary source of agreement-score growth in `cross_frame_dedup` — every frame is its own signal class). Mobile no longer best-frame picks before sending.
- Pushes blur/exposure gating, face/PII redaction, EXIF stripping, and WebP@1280 px encoding **on-device**.
- Drops the CoreML branch entirely (per interview Q4 — single-path detection via the Mac pipeline-service is the product).
- Persists to a fresh Drift schema **v5** that mirrors `SceneObservation`/`PipelineDetection` (per-scene rows, per-detection rows, denormalised label table for FTS5, int8-quantised crop embeddings).
- Rebuilds the local DB on first launch when on-disk version < 5 (the app is **not deployed**; per stored memory `feedback_no_migrations.md`, schema migrations are explicitly skipped — DB file is dropped and recreated).

The mobile rewrite is the gating precondition for Phase 5 (Temporal deletion) because the old `EnrichedItem`/`DetectResult` types in `api-service/src/schemas/detection.schema.ts` cannot be removed until no client speaks them.

---

## Files to create / modify

### NEW files

```
mobile-app/lib/services/image_quality.dart
mobile-app/lib/services/face_redaction.dart
mobile-app/lib/services/burst_capture.dart
mobile-app/lib/services/upload_encoder.dart
```

### REWRITE / MODIFY

```
mobile-app/lib/presentation/camera/camera_capture_screen.dart   # rewrite for 3-frame burst + on-device gates
mobile-app/lib/application/providers/detection_providers.dart   # drop CoreML branch
mobile-app/lib/data/repositories/detection_repository.dart      # multipart with 3 parts, parse SceneObservation
mobile-app/lib/data/database/                                    # schema v5 rewrite (whole subtree)
mobile-app/lib/domain/                                           # types updated to mirror §5.1 SceneObservation
mobile-app/lib/presentation/items/item_detail_screen.dart       # null/empty audit for vlmStructuredAttributes
```

### DELETE — CoreML on-device detector code (Phase 6 task)

Run a discovery spike before deleting: `grep -r CoreML mobile-app/ios mobile-app/lib mobile-app/android` to enumerate everything. The minimum known list:

```
mobile-app/ios/Runner/CoreMLDetector.swift
mobile-app/ios/Runner/CoreMLPlugin.swift
mobile-app/ios/Runner/CoreMLBridge.m
mobile-app/ios/Runner/CoreMLBridge.h
mobile-app/ios/Runner/Resources/*.mlpackage      # any
mobile-app/ios/Runner/Resources/*.mlmodel        # any
mobile-app/android/app/src/main/assets/*.tflite  # any on-device detector model assets
mobile-app/android/app/src/main/.../OnDeviceDetector.{kt,java}  # equivalent Android detector class
```

Also remove:

- Any `MethodChannel("coreml/*")` registrations in `ios/Runner/AppDelegate.swift` and the Android `MainActivity`.
- The Dart shim that calls them in `detection_providers.dart` (the `fastBoxes` / on-device branch).
- Any `pubspec.yaml` plugin entry that exists solely for CoreML/TFLite on-device detection.

The deletion commit must show the full diff so reviewers can confirm no platform-channel boilerplate is left dangling.

### KEEP

- `mobile-app/lib/data/repositories/detection_repository.dart`'s 200/202+poll/503-with-Retry-After retry logic — only types and multipart payload count change.
- `mobile-app/lib/presentation/home/inventory_feed_screen.dart` (Instagram-style feed) — backwards-compatible with the new schema as long as it reads `detections.primaryLabel` and `inventory_items.isFlagged`.
- `mobile-app/lib/presentation/search/search_screen.dart` — but it must point its FTS query at `detection_labels.label` instead of any prior JSON-column FTS attempt (Drift FTS5 doesn't index JSON paths).

---

## Tests FIRST (TDD)

Write these tests before any production code. All tests use stubs/mocks — no live HTTP to Fastify, no live ML Kit calls, no live camera plugin.

### `mobile-app/test/services/image_quality_test.dart`

```dart
// Test: Laplacian variance < 100 returns blurry=true
// Test: histogram with > 5% saturated white pixels → exposure='overexposed'
// Test: histogram with > 5% black pixels → exposure='underexposed'
// Test: pure-Dart Laplacian implementation matches a 5-image fixture set
//       within 1% of the reference OpenCV values
```

Keep the Laplacian implementation pure-Dart (no FFI / no opencv plugin) — the 5-image fixture set asserts numerical agreement against pre-computed OpenCV reference values committed alongside the test.

### `mobile-app/test/services/face_redaction_test.dart`

```dart
// Test: ML Kit face detector returns N faces; each bbox is blurred in the
//       output (Gaussian k=31)
// Test: output WebP differs from input WebP wherever a face bbox sits
// Test: original frame buffer is zeroed after encoding (memory inspection
//       via WeakReference + force GC) — MANDATORY
```

The original-frame zeroing test is the safety-critical one. Bbox blur is otherwise reversible if the original raw bytes are kept; this test enforces that the implementation overwrites the raw buffer with zeros immediately after WebP encoding completes and de-allocates.

### `mobile-app/test/services/burst_capture_test.dart`

```dart
// Test: capture() returns exactly 3 frames at ~100ms apart
// Test: all 3 frames are returned even if one fails blur (the burst as a whole
//       is rejected only when ALL frames fail)
// Test: when ALL 3 fail blur, result.allBlurry=true and the capture screen
//       prompts retake
```

### `mobile-app/test/services/upload_encoder_test.dart`

```dart
// Test: longest edge resized to 1280px, aspect preserved
// Test: WebP quality 75
// Test: EXIF GPS / timestamp stripped; orientation preserved
// Test: encoded WebP < 1.5 MB for representative kitchen photo
```

### `mobile-app/test/data/database/app_database_test.dart` — Drift schema v5

```dart
// Test: schema version is 5
// Test: on first launch with version<5 on disk, DB is rebuilt (file dropped + recreated)
// Test: detections.cropEmbeddingI8 column is BLOB of exactly 768 bytes
// Test: detection_labels FTS query returns rows where label matches via FTS5
// Test: inventory_items has NO sceneId column (removed redundancy — one row per scene,
//       so id IS the sceneId)
// Test: scenes has NO proposedPromptList column (debug-only; lives in Dagster asset
//       metadata, not on device)
// Test: alternateLabels are denormalised into detection_labels (NOT a JSON column on
//       detections) — Drift FTS5 cannot index JSON paths
// Test: storage budget — 1000 detection rows fits under 50 MB on disk (synthesise data,
//       VACUUM, assert SQLite file size)
```

### `mobile-app/test/data/repositories/detection_repository_test.dart`

```dart
// Test: detectObjects(List<File> 3-frame) sends multipart with 3 parts
// Test: idempotency key submitted is sha256 of concatenated frame hashes
// Test: parses new SceneObservation shape (NOT EnrichedItem/DetectResult)
// Test: persists 1 inventory_items + 1 scenes + N detections + N+ detection_labels
// Test: sets isFlagged when SceneObservation.flagged=true
// Test: 200 response → result returned synchronously
// Test: 202 response → poll loop resolves and persists
// Test: 503 with Retry-After → backoff respected (existing logic)
```

### `mobile-app/integration_test/burst_upload_test.dart`

```dart
// Test: tap capture button → 3 frames captured → 3 multipart parts in upload
// Test: detection_repository sends sha256 of concatenated frame hashes as
//       idempotency_key (matches §4.1)
// Test: 200 response → SceneObservation parsed and persisted to Drift
// Test: 202 response → polling resolves and persists
// Test: 503 with Retry-After → backoff matches existing logic
```

### `mobile-app/integration_test/inventory_render_test.dart` — null-handling audit

```dart
// Test: item_detail_screen renders correctly when vlmStructuredAttributes={}
//       (no NPE, all fields show "—" or hidden) — MANDATORY
// Test: item_detail_screen renders correctly with full attributes
// Test: scene flag badge appears when isFlagged=true
```

The `vlmStructuredAttributes={}` case is **the** new contract change to defend against: under the new pipeline, `classification_refine` may legitimately fall through all tiers and emit `{}` (no fake `florence-only` synthetic attribute set). The mobile must render this without crashing.

### Phase-6 lint / discovery test

`mobile-app/test/phase_gate_test.dart` (or scripted in `mobile-app/scripts/check-coreml-removed.sh` invoked from Flutter test):

```dart
// Test: no Dart, Swift, Kotlin, Java, ObjC source under mobile-app/
//       references "CoreML", "CoreMLDetector", "OnDeviceDetector",
//       "MethodChannel(\"coreml" — fails the build if any survives
// Test: detection_providers.dart no longer contains a "fastBoxes" branch
//       or any on-device-detection state machine entry
```

This test is what gates Phase 5 (section-10) — Phase 5's CI lint reads it as a precondition.

---

## Implementation details

### 1. `image_quality.dart` — Laplacian + histogram

Pure-Dart, no plugin dependencies (so it runs in unit tests without a mock plugin layer).

```dart
class ImageQualityResult {
  final double laplacianVariance;
  final bool blurry;                 // laplacianVariance < 100
  final ExposureClass exposure;      // ok | overexposed | underexposed
}

enum ExposureClass { ok, overexposed, underexposed }

/// Compute Laplacian variance + RGB histogram on a decoded RGB frame.
/// Inputs are uint8 RGB byte buffers (H*W*3); the function samples a
/// centre-cropped square for both metrics to keep it fast on a phone.
Future<ImageQualityResult> assessQuality(Uint8List rgbBytes, int width, int height);
```

- Blur threshold: Laplacian variance < 100 → `blurry=true`. Threshold lives in `lib/core/config/app_config.dart` so tuning is one-file.
- Exposure: histogram bins 0–255; > 5% pixels in [248, 255] → overexposed; > 5% in [0, 7] → underexposed.

### 2. `face_redaction.dart` — ML Kit + mandatory original disposal

```dart
class FaceRedactor {
  /// Detect faces (ML Kit on-device) and Gaussian-blur each bbox in-place
  /// on a working copy of the RGB buffer. Returns the blurred buffer.
  /// MANDATORY: caller must invoke disposeOriginal(rawBytes) immediately
  /// after the redacted bytes have been WebP-encoded.
  Future<Uint8List> redactFaces(Uint8List rgbBytes, int width, int height);

  /// Overwrite the original raw frame buffer with zeros and de-allocate.
  /// This is the safety net against bbox-blur reversal attacks where an
  /// attacker recovers the raw frame from device memory.
  void disposeOriginal(Uint8List rawBytes);
}
```

- Use the `google_mlkit_face_detection` plugin (already in the Flutter ecosystem; add to `pubspec.yaml` if not present and update `pubspec.lock`).
- Gaussian kernel size 31 (matches the test fixture).
- Run **per frame** in the burst (3 invocations per capture).
- The `disposeOriginal` call is verified by the unit test via `WeakReference` + forced GC.

### 3. `burst_capture.dart` — 3-frame burst

```dart
class BurstResult {
  final List<CapturedFrame> frames;   // exactly 3 entries, even if some flagged blurry
  final bool allBlurry;               // true iff ALL frames fail blur (UI prompts retake)
}

class CapturedFrame {
  final Uint8List rgbBytes;
  final int width;
  final int height;
  final ImageQualityResult quality;
  final DateTime capturedAt;
}

class BurstCapture {
  /// Trigger 3 captures at ~100ms intervals through the platform camera
  /// plugin. Per-frame: run image_quality, face_redaction. Returns the
  /// burst with quality flags but does NOT discard frames on quality —
  /// the pipeline does cross-frame agreement work, so all 3 are sent.
  Future<BurstResult> capture();
}
```

- `~100 ms` interval means 100 ms target; jitter is fine (the pipeline's `frame_intake` handles each frame independently with its own `frameId`).
- All 3 frames are returned even when some are blurry — this is critical: per claude-plan §9.1, "Frames below the blur threshold are kept (we send all 3 anyway) but the burst as a whole is rejected if **all** frames fail blur".

### 4. `upload_encoder.dart` — WebP @ 1280 px + EXIF strip + original disposal

```dart
class UploadEncoder {
  /// Resize so longest edge = 1280px, preserve aspect ratio, encode WebP at
  /// quality 75, strip EXIF except orientation. After encoding completes,
  /// invoke FaceRedactor.disposeOriginal on the input buffer.
  Future<Uint8List> encode(Uint8List rgbBytes, int width, int height,
                           {required int exifOrientation});
}
```

- Use `image` package (pure-Dart) for resize + WebP encoding so it's testable without platform code. Add to `pubspec.yaml` if not already present.
- Output WebP must be < ~1.5 MB for a representative kitchen photo (asserted in test).
- Original raw bytes are zeroed immediately after the encoded WebP is constructed.

### 5. `camera_capture_screen.dart` — rewrite

Single capture button. On tap:

1. Call `BurstCapture.capture()` — returns 3 frames + quality flags.
2. If `allBlurry`, show a "Too blurry — retake" snackbar; return to capture state.
3. For each frame: `FaceRedactor.redactFaces(...)` → `UploadEncoder.encode(...)` → discard original.
4. Hand the 3 encoded WebP buffers to `detection_providers.detectionStateProvider` (via `repository.detectObjects(burstFiles)`).
5. State transitions: `idle → capturing → encoding → uploading → awaiting → done|error`.

No CoreML branch. No "best frame picker". No on-device detection. No fast-path/slow-path duality.

### 6. `detection_providers.dart` — simplify

Remove:

- The `fastBoxes` / on-device CoreML branch.
- Any state field representing "on-device detection in progress".
- Any provider that wires into a CoreML method channel.

Keep:

- The Riverpod state machine (`AsyncValue<SceneObservation>`).
- The repository call: `repository.detectObjects(List<File> burstFrames)`.
- 200 / 202 + poll / 503 + Retry-After handling — that lives in the repository, untouched.

The provider boundary now expresses one path: server pipeline only.

### 7. `detection_repository.dart` — multipart 3 parts + new shape

```dart
class DetectionRepository {
  /// Send the 3-frame burst as a single multipart POST with 3 file parts
  /// to /v1/detect. Idempotency key is sha256 of concatenated frame hashes.
  /// Returns a parsed SceneObservation on 200 or after polling resolves a 202.
  /// On 503 with Retry-After, retries with backoff (existing logic).
  Future<SceneObservation> detectObjects(List<File> burstFrames);

  /// Persist the SceneObservation:
  ///   1 row in inventory_items (id = sceneId)
  ///   1 row in scenes
  ///   N rows in detections
  ///   N+ rows in detection_labels (one per primary + each alternate)
  /// Sets inventory_items.isFlagged = SceneObservation.flagged.
  Future<void> persist(SceneObservation observation);
}
```

- Idempotency key formula: `sha256(concat(sha256(frame1.bytes), sha256(frame2.bytes), sha256(frame3.bytes)))`. Must match the formula used by Fastify's `detect.route.ts` (otherwise idempotency lookups race).
- The repository converts the parsed `SceneObservation` to Drift inserts in a single transaction.
- The 200/202+poll/503 retry semantics already exist in this file; keep them. Only the multipart payload (1 part → 3 parts) and the response type (legacy → `SceneObservation`) change.

### 8. Drift schema v5 (full rewrite, no migration)

Path: `mobile-app/lib/data/database/`.

Per claude-plan §5.3 — schema bumps directly to v5. On first launch with on-disk version < 5, the existing DB file is **dropped and recreated**. No data export, no migration code.

Tables:

```dart
// inventory_items — KEPT, simplified
// PK = sceneId (one row per scene; no separate sceneId column)
TextColumn  id              // PK = sceneId
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
// proposedPromptList is intentionally NOT stored on device.

// detections — NEW
TextColumn  id PK
TextColumn  sceneId   FK scenes.id    // canonical FK
TextColumn  bbox      // JSON {x,y,width,height}
BlobColumn  maskRle?
BlobColumn  cropEmbeddingI8           // exactly 768 bytes int8
RealColumn  agreementScore
TextColumn  contributingSignals       // JSON [{detector, frameId, rawConfidence}]
TextColumn  vlmStructuredAttributes    // JSON Record<string, unknown>
TextColumn  primaryLabel
RealColumn  confidence

// detection_labels — NEW (denormalised so FTS5 works)
TextColumn  detectionId   FK detections.id
TextColumn  label
RealColumn  confidence
BoolColumn  isPrimary

// labels — KEPT (free-form structured-attribute index)

// label_search_fts — KEPT, REWIRED to FTS5 over detection_labels.label
```

Critical schema invariants (each is asserted by a test):

- `inventory_items` has **no** `sceneId` column (removed redundancy — `id` IS the sceneId).
- `scenes` has **no** `proposedPromptList` column (lives in Dagster asset metadata only).
- `detections.cropEmbeddingI8` is BLOB of **exactly 768 bytes** (int8 quantised DINOv2 ViT-B/14, dropped from 1.5 KB f16 to 768 B int8).
- `alternateLabels` are **denormalised** into `detection_labels` rows (NOT a JSON array on `detections`) — Drift FTS5 cannot index JSON paths.

Storage budget target: < 50 MB for 1000 detection rows. Asserted by a test that synthesises 1000 detections with 768-byte embeddings, runs `VACUUM`, and reads the SQLite file size from disk.

After modifying the schema, regenerate Drift code:

```bash
cd mobile-app
flutter pub run build_runner build --delete-conflicting-outputs
```

### 9. `item_detail_screen.dart` — null/empty audit (MANDATORY)

Audit every field that reads from `detection.vlmStructuredAttributes`. The new contract allows that field to be `{}` when `classification_refine` falls through all VLM tiers (no fake default attribute set). The mobile must render `{}` without crashing.

Per-field rule: `display = attributes[key] ?? '—'` (or hide the row entirely). No code path may call `.toString()` on a nullable lookup, no `.length` on a possibly-null list, no `Text(attributes['brand'])` without `??`.

Also audit:

- Any null-safety violations introduced by switching from `EnrichedItem` (where some fields were always present) to `PipelineDetection` (where `vlmStructuredAttributes` may be empty, `maskRleB64` may be absent, `cropEmbeddingB64` may be absent).
- `SceneObservation.flagged` should drive a visible flag badge (see `inventory_render_test.dart`).

Commit a checklist as a code comment at the top of `item_detail_screen.dart` enumerating each audited field, so future contract changes can be re-audited mechanically.

### 10. Domain types — `lib/domain/`

Mirror the §5.1 TS types (`api-service/src/types/pipeline.ts`) into Dart Freezed models:

```dart
@freezed
class SceneObservation with _$SceneObservation { ... }

@freezed
class PipelineDetection with _$PipelineDetection { ... }

@freezed
class ContributingSignal with _$ContributingSignal { ... }

@freezed
class TileError with _$TileError { ... }
```

Generate code: `flutter pub run build_runner build --delete-conflicting-outputs`.

Delete any existing `EnrichedItem` / `DetectResult` Freezed models — they're replaced by `SceneObservation` / `PipelineDetection`. The `pubspec.yaml` `dependencies` block is unchanged; only generated `*.freezed.dart` files churn.

### 11. CoreML deletion — full enumeration

Phase 6 task; do this **after** the new code is in place and the test suite is green so the deletion commit is mechanical.

1. Run discovery: `grep -rn -i "coreml\|tflite\|on.device.detector\|fastBoxes\|MethodChannel.*\"coreml" mobile-app/`. Capture the output as the deletion list.
2. Delete files listed above (Swift, ObjC, mlpackage/mlmodel, tflite assets, Kotlin/Java detector classes).
3. Remove `MethodChannel("coreml/*")` registrations in `ios/Runner/AppDelegate.swift` and Android `MainActivity.{kt,java}`.
4. Remove the corresponding pubspec dependency, if any (e.g., a CoreML-specific plugin).
5. Run `flutter pub get` and `flutter pub run build_runner build --delete-conflicting-outputs`.
6. Run `flutter test && flutter test integration_test` — the phase-6 lint test (`phase_gate_test.dart`) passes only after every CoreML reference is gone.

The commit message must list every file deleted, so the section-10 cleanup pass can read it as a precondition.

---

## Done checklist

- [ ] `image_quality.dart`, `face_redaction.dart`, `burst_capture.dart`, `upload_encoder.dart` exist with passing unit tests.
- [ ] `camera_capture_screen.dart` rewritten — single capture button → 3-frame burst → on-device gates → encode → upload.
- [ ] `detection_providers.dart` simplified — no CoreML/on-device branch; one path only (server pipeline).
- [ ] `detection_repository.dart` sends multipart with **3 file parts**; idempotency key = sha256 of concatenated frame hashes; parses `SceneObservation`; persists to schema v5.
- [ ] Drift schema is **v5**; first-launch rebuild logic in place; all schema invariant tests green (cropEmbeddingI8 = 768 bytes; no `inventory_items.sceneId`; no `scenes.proposedPromptList`; alternates denormalised; FTS5 over `detection_labels.label`; storage budget < 50 MB / 1000 rows).
- [ ] `item_detail_screen.dart` audited: every `vlmStructuredAttributes` access guarded for `{}`. `inventory_render_test.dart` integration test green.
- [ ] All CoreML / on-device detector code deleted (Swift, ObjC, Kotlin/Java, mlpackage/mlmodel, tflite, MethodChannel, Dart shim, pubspec entry). Phase-6 lint test green.
- [ ] Original raw frame buffers are zeroed after WebP encoding — verified by `face_redaction_test.dart`.
- [ ] `flutter test && flutter test integration_test` is green from `mobile-app/`.
- [ ] `flutter analyze` is clean.

---

## Notes for implementer

- **The `vlmStructuredAttributes={}` rendering test is non-negotiable.** If the screen NPEs on `{}`, the new pipeline's tier-cascade-failure path (a legitimate code path, not an error) crashes the app.
- **The original-frame disposal test is non-negotiable.** Bbox blur is reversible if the raw frame survives in memory; the test enforces that it doesn't.
- **All 3 frames are sent.** Do not "best frame pick" before upload. The pipeline's `cross_frame_dedup` op needs all 3 to compute multi-frame agreement (every frame is its own signal class in `agreement_scoring`).
- **Idempotency key formula must match Fastify exactly.** `sha256(concat(sha256(frame1), sha256(frame2), sha256(frame3)))` — frames in capture order. A mismatch silently breaks the dedup of a retried request.
- **No migration code.** Per `feedback_no_migrations.md`, the app is not deployed; on first launch with on-disk version < 5, drop the DB file and recreate. Do not write `MigrationStrategy` for v4 → v5.
- **Run `build_runner` after any Drift table or Freezed model change.** Stale generated code is a common source of confusing test failures.