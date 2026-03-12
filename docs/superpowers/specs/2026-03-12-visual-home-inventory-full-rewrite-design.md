# Visual Home Inventory Manager — Full Rewrite Design Spec

**Date**: 2026-03-12
**Status**: Approved
**Scope**: Get the app fully working end-to-end with AI-driven object detection and classification. Remove all hardcoded labels. Clean up, simplify, and verify the entire codebase.

---

## 1. Problem Statement

The current codebase has:
- 60+ hardcoded object labels across 5 locations (mock adapter, YOLO vocabulary, seeded categories, test fixtures)
- 5 vision provider adapters doing the same thing (Google Vision, AWS Rekognition, Gemini, Ollama, Mock) with an over-engineered ensemble fusion layer
- Dead code: rooms/albums screens referencing undefined providers, duplicate screens, unused services
- Incomplete features: edit labels route is a placeholder, thumbnail generation uses original image, S3 URLs stubbed
- A Python detection service with a fixed 13-label vocabulary

## 2. Solution

Replace the multi-provider ensemble with a clean **two-stage detection pipeline**:

1. **Stage 1 — Detection**: Grounding DINO (open-vocabulary) produces bounding boxes. Google Cloud Vision as fallback. No hardcoded label lists.
2. **Stage 2 — Classification**: Gemini 2.5 Pro VLM classifies each detected region, returning structured JSON with label, category, brand, colors, materials, condition, estimated value. Ollama (Qwen2.5-VL) as self-hosted fallback.

Zero hardcoded labels anywhere. The VLM generates all labels, categories, and attributes dynamically.

## 3. Architecture

```
Mobile App (Flutter)
  ├── Camera capture → image quality check
  ├── POST /v1/detect with multipart image
  ├── Display bounding boxes + VLM-generated labels
  ├── User selects objects to save
  ├── Generate thumbnails, store in Drift (SQLite)
  └── Search, browse, view, delete inventory items

API Service (Fastify/TypeScript)
  ├── POST /v1/detect → two-stage pipeline
  │   ├── Stage 1: call Python detection service (Grounding DINO)
  │   │   └── Fallback: Google Cloud Vision objectLocalization
  │   └── Stage 2: call VLM classifier (Gemini 2.5 Pro API)
  │       └── Fallback: Ollama (Qwen2.5-VL-7B)
  ├── GET /v1/health → provider health status
  └── Error handling, circuit breakers, logging

Detection Service (Python/FastAPI)
  ├── POST /detect → Grounding DINO inference
  ├── GET /health → model + GPU status
  └── Configurable prompt, thresholds via env vars
```

## 4. API Service — Detailed Design

### 4.1 File Structure

```
api-service/src/
├── app.ts                              # Fastify setup, route registration, shutdown
├── config/
│   └── env.config.ts                   # Env vars (simplified)
├── providers/
│   ├── detector.interface.ts           # ObjectDetector contract
│   ├── classifier.interface.ts         # ObjectClassifier contract
│   ├── grounding-dino.detector.ts      # Primary — calls Python detection service
│   ├── google-vision.detector.ts       # Fallback — Google Cloud Vision API
│   ├── gemini.classifier.ts            # Primary — Gemini 2.5 Pro structured output
│   └── ollama.classifier.ts            # Fallback — self-hosted Qwen2.5-VL
├── services/
│   ├── detection-pipeline.service.ts   # Two-stage orchestrator with circuit breakers
│   └── image-quality.service.ts        # Blur, brightness, contrast analysis
├── routes/
│   ├── detect.route.ts                 # POST /v1/detect
│   └── health.route.ts                 # GET /v1/health
├── schemas/
│   └── detection.schema.ts             # Zod schemas for request/response
├── middleware/
│   ├── auth.middleware.ts              # Simplified — API key validation (no JWT/DB)
│   └── error.middleware.ts             # Global error handler
└── utils/
    ├── circuit-breaker.ts              # Circuit breaker pattern
    ├── errors.ts                       # Custom error classes (trimmed)
    └── logger.ts                       # Pino structured logging
```

### 4.2 Files to Delete

- `src/adapters/` — entire directory (6 files: provider-adapter.interface.ts, google-vision.adapter.ts, aws-rekognition.adapter.ts, gemini-vision.adapter.ts, ollama-vision.adapter.ts, mock-vision.adapter.ts)
- `src/services/vision-orchestrator.service.ts`
- `src/services/ensemble-fusion.service.ts`
- `src/services/detection.service.ts`
- `src/services/inventory.service.ts`
- `src/services/search.service.ts`
- `src/services/sync.service.ts`
- `src/algorithms/nms.algorithm.ts`
- `src/routes/items.route.ts`
- `src/routes/labels.route.ts`
- `src/routes/search.route.ts`
- `src/routes/sync.route.ts`
- `src/schemas/inventory.schema.ts`
- `src/schemas/search.schema.ts`
- `src/schemas/sync.schema.ts`
- `src/db/` — entire directory (database.ts, repositories/)
- `src/__tests__/` — delete all, rewrite for new pipeline

### 4.3 Provider Interfaces

```typescript
// detector.interface.ts
interface BoundingBoxResult {
  box: { x: number; y: number; width: number; height: number };
  coarseLabel: string;
  confidence: number;
}

interface ObjectDetector {
  name: string;
  detect(image: Buffer): Promise<BoundingBoxResult[]>;
  healthCheck(): Promise<boolean>;
}

// classifier.interface.ts
// The classifier receives bounding boxes from Stage 1 and returns
// enriched objects. The boundingBox on ClassifiedObject is a
// denormalized copy from detections[boxIndex].box for convenience —
// the classifier copies it through, it does not produce its own box.
interface ClassifiedObject {
  boxIndex: number;
  label: string;
  category: string;
  brand: string | null;
  model: string | null;
  colors: string[];
  materials: string[];
  condition: string | null;
  estimatedValue: { low: number; high: number } | null;
  description: string | null;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

interface ObjectClassifier {
  name: string;
  classify(image: Buffer, detections: BoundingBoxResult[]): Promise<ClassifiedObject[]>;
  healthCheck(): Promise<boolean>;
}
```

### 4.4 Detection Pipeline Service

Each provider is wrapped in a `CircuitBreaker` instance. The circuit breaker tracks failures per provider and skips providers whose circuit is open, falling through to the next provider in the chain immediately.

```typescript
// detection-pipeline.service.ts
class DetectionPipelineService {
  private detectors: { provider: ObjectDetector; breaker: CircuitBreaker }[];
  private classifiers: { provider: ObjectClassifier; breaker: CircuitBreaker }[];

  constructor(config: EnvConfig) {
    // Circuit breaker config: 3 failures → open, 60s reset, 1 half-open probe
    const breakerOpts = { failureThreshold: 3, resetTimeoutMs: 60_000 };

    this.detectors = [
      { provider: new GroundingDinoDetector(config), breaker: new CircuitBreaker(breakerOpts) },
      { provider: new GoogleVisionDetector(config), breaker: new CircuitBreaker(breakerOpts) },
    ];
    this.classifiers = [
      { provider: new GeminiClassifier(config), breaker: new CircuitBreaker(breakerOpts) },
      { provider: new OllamaClassifier(config), breaker: new CircuitBreaker(breakerOpts) },
    ];
  }

  async detect(imageBuffer: Buffer): Promise<DetectionResponse> {
    const startTime = Date.now();

    // Stage 1: Get bounding boxes (try primary, fallback to secondary)
    const boxes = await this.runWithFallback(
      this.detectors,
      (d) => d.detect(imageBuffer),
      'detection',
    );

    if (boxes.length === 0) {
      return { detections: [], processingTimeMs: Date.now() - startTime };
    }

    // Stage 2: Classify each region (try primary, fallback to secondary)
    const classified = await this.runWithFallback(
      this.classifiers,
      (c) => c.classify(imageBuffer, boxes),
      'classification',
    );

    return {
      detections: classified,
      processingTimeMs: Date.now() - startTime,
      detector: this.lastUsedDetector,
      classifier: this.lastUsedClassifier,
    };
  }

  private async runWithFallback<P, R>(
    providers: { provider: P; breaker: CircuitBreaker }[],
    fn: (provider: P) => Promise<R>,
    stage: string,
  ): Promise<R> {
    for (const { provider, breaker } of providers) {
      if (breaker.isOpen()) {
        logger.info({ provider: (provider as any).name }, `${stage} circuit open, skipping`);
        continue;
      }
      try {
        const result = await breaker.execute(() => fn(provider));
        this.recordUsed(stage, (provider as any).name);
        return result;
      } catch (error) {
        logger.warn({ provider: (provider as any).name, error }, `${stage} failed, trying next`);
      }
    }
    throw new ServiceUnavailableError(`All ${stage} providers unavailable`);
  }
}
```

### 4.5 VLM Prompt (Gemini Classifier)

The VLM prompt uses `snake_case` keys. The `gemini.classifier.ts` implementation maps the VLM JSON response to the `camelCase` TypeScript `ClassifiedObject` interface during parsing (e.g., `box_index` → `boxIndex`, `estimated_value_usd` → `estimatedValue`). This mapping is handled in a `parseVlmResponse()` helper.

```
You are analyzing a photo for a home inventory application.

Objects have been detected at these locations (normalized 0-1 coordinates):
{bounding_boxes_json}

For each detected object, return a JSON array:
[
  {
    "box_index": 0,
    "label": "specific name, e.g. 'standing desk lamp' not just 'lamp'",
    "category": "descriptive category, e.g. 'living room furniture'",
    "brand": "if identifiable from visual cues, else null",
    "model": "if identifiable, else null",
    "colors": ["primary color", "secondary if applicable"],
    "materials": ["primary material", "secondary if applicable"],
    "condition": "new | like-new | good | fair | poor",
    "estimated_value_usd": { "low": number, "high": number } or null,
    "description": "one-sentence description of the item",
    "confidence": 0.0 to 1.0
  }
]

Rules:
- Be as specific as possible with labels
- Only describe objects you can actually see clearly
- Do not guess brands — return null if unsure
- Categories should be descriptive, not from a fixed list
- If a detected region contains no identifiable object, return confidence: 0 for that box_index
- Return valid JSON only, no markdown
```

### 4.6 Environment Variables

```env
PORT=8000
NODE_ENV=development

# Detection Service (Grounding DINO)
DETECTION_SERVICE_URL=http://localhost:8001
DETECTION_TIMEOUT_MS=5000
DETECTION_BOX_THRESHOLD=0.3
DETECTION_TEXT_THRESHOLD=0.25
DETECTION_PROMPT=household objects . furniture . appliances . electronics . decor . items

# VLM Classification — Primary (Gemini)
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-pro
CLASSIFICATION_TIMEOUT_MS=15000

# VLM Classification — Fallback (Ollama)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5-vl:7b
OLLAMA_ENABLED=false

# Detection Fallback (Google Cloud Vision)
GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=

# Classification
CLASSIFICATION_MIN_CONFIDENCE=0.5

# Auth — optional in development (bypassed when NODE_ENV=development)
API_KEY=
```

Port remains 8000 (matching existing CLAUDE.md and Makefile).

### 4.7 Auth Middleware Simplification

The current `auth.middleware.ts` does custom JWT parsing against a database user system that is being deleted. It is rewritten to simple API key validation:

```typescript
// auth.middleware.ts — simplified
// Validates API key from Authorization header: "Bearer <api-key>"
// In development mode (NODE_ENV=development), auth is bypassed.
// API key is configured via API_KEY env var.
```

This removes the JWT/database dependency. The mobile app sends the API key in the Authorization header.

### 4.8 Development Mode — No GPU/Credentials Required

For local development without GPU hardware or cloud credentials, the system works as follows:

- **Detection**: If `DETECTION_SERVICE_URL` is unreachable and Google Cloud Vision has no credentials, the pipeline returns an error with a clear message. Developers must have at least one detection provider available.
- **Classification**: If `GEMINI_API_KEY` is not set and Ollama is not running, classification fails with a clear error.
- **Minimum viable local setup**: Run Ollama locally with `ollama pull qwen2.5-vl:7b` (recommended) or `ollama pull llava:7b` (lighter, CPU-friendly alternative). Set `OLLAMA_ENABLED=true` and `OLLAMA_MODEL=qwen2.5-vl:7b` (or `llava:7b` if using the lighter model). Skip the Python detection service — use Google Cloud Vision with a free-tier GCP project, or use Ollama in "full image" mode (no detection stage, VLM analyzes the entire image and returns all objects).
- **Ollama-only mode**: When no detection service is available, the pipeline falls back to sending the full image to the VLM classifier without bounding boxes. The VLM prompt adapts: instead of "Objects have been detected at these locations..." it becomes "Analyze this image and identify all household objects you can see." The classifier returns objects with estimated bounding boxes from the VLM.

This ensures a developer can run the full pipeline with just `ollama pull llava:7b` and no cloud credentials.

## 5. Detection Service (Python) — Detailed Design

### 5.1 File Structure

```
detection-service/
├── main.py              # FastAPI app with Grounding DINO
├── requirements.txt     # Dependencies
├── Dockerfile           # GPU-enabled container
└── weights/             # Model weights (gitignored)
    └── groundingdino_swint_ogc.pth
```

### 5.2 Implementation

Single FastAPI app with two endpoints:
- `POST /detect` — accepts image upload + optional prompt/thresholds, returns bounding boxes
- `GET /health` — returns model loaded status + GPU availability

The default detection prompt is configurable via `DETECTION_PROMPT` env var (default: `"household objects . furniture . appliances . electronics . decor . items"`). This is a broad text query for Grounding DINO, not a fixed label set.

### 5.3 Files to Delete

- `yolov8m-worldv2.pt` — replaced by Grounding DINO
- `rtdetr-l.pt` — not needed
- `DEFAULT_VOCABULARY` hardcoded list — the entire reason for the rewrite
- Any existing `__pycache__/` directories
- Virtual environment directory if present

### 5.4 Dependencies

```
fastapi==0.115.0
uvicorn==0.32.0
torch==2.4.1
groundingdino-py==0.4.1
Pillow==10.4.0
python-multipart==0.0.12
```

Pinned versions for reproducibility. Tested with CUDA 12.1. For CPU-only: `torch==2.4.1+cpu` from PyTorch CPU index.

## 6. Mobile App (Flutter) — Detailed Design

### 6.1 File Structure

```
mobile-app/lib/
├── main.dart
├── core/
│   └── config/
│       └── app_config.dart
├── domain/
│   └── models/
│       ├── detected_object.dart       # Freezed: label, category, brand, colors, materials, condition, value, box
│       └── inventory_item.dart        # Freezed: id, photoPath, thumbnailPath, detectionData, timestamps
├── data/
│   ├── database/
│   │   ├── app_database.dart          # 3 tables, no seeded categories, migration v2→v3
│   │   └── tables/
│   │       ├── inventory_items.dart
│   │       ├── labels.dart            # Dynamic key-value with confidence column
│   │       └── label_search_fts.dart
│   ├── repositories/
│   │   ├── detection_repository.dart  # API call to /v1/detect
│   │   └── inventory_repository.dart  # Drift CRUD + label extraction from VLM output
│   ├── remote/
│   │   └── api_client.dart            # Dio HTTP client
│   └── services/
│       └── image_processing_service.dart  # Thumbnail generation, compression
├── application/
│   ├── providers/
│   │   ├── database_provider.dart
│   │   ├── camera_providers.dart
│   │   ├── detection_providers.dart
│   │   └── inventory_providers.dart
│   └── state/
│       └── detection_state.dart
└── presentation/
    ├── routing/
    │   └── app_router.dart            # 6 routes only
    ├── screens/
    │   ├── inventory_feed_screen.dart
    │   ├── detection_results_screen.dart
    │   ├── item_detail_screen.dart
    │   └── search_screen.dart
    ├── camera/
    │   └── camera_capture_screen.dart
    ├── profile/
    │   └── profile_screen.dart
    ├── widgets/
    │   ├── detection_box.dart
    │   ├── item_card.dart
    │   ├── label_chip.dart
    │   └── quality_feedback_widget.dart
    ├── common/
    │   ├── custom_app_bar.dart
    │   ├── error_view.dart
    │   └── loading_indicator.dart
    └── theme/
        └── app_theme.dart
```

### 6.2 Files to Delete

All files not listed in Section 6.1 are deleted. Explicit list:

**Screens & UI:**
- `lib/presentation/screens/rooms_screen.dart` — references undefined providers
- `lib/presentation/screens/room_detail_screen.dart` — references undefined providers
- `lib/presentation/screens/smart_albums_screen.dart` — incomplete placeholder
- `lib/presentation/screens/smart_album_detail_screen.dart` — incomplete placeholder (if exists)
- `lib/presentation/search/` — entire directory (duplicate search screen)
- `lib/presentation/items/` — entire directory (incomplete edit_labels_screen)
- `lib/presentation/item_detail_screen.dart` — legacy duplicate of screens/item_detail_screen.dart
- `lib/presentation/profile/settings_screen.dart` — placeholder with TODO only
- `lib/presentation/widgets/room_selection_sheet.dart` — references deleted rooms feature
- `lib/presentation/widgets/filter_sheet.dart` — if exists, references deleted features
- `lib/presentation/widgets/search_bar.dart` — if exists, replaced by inline search in screen
- `lib/presentation/widgets/search_suggestions.dart` — if exists, unused
- `lib/presentation/widgets/label_editor.dart` — if exists, replaced by inline editing in detection_results_screen
- `lib/presentation/navigation/` — entire directory if exists (shell route in app_router.dart handles this)

**Data layer:**
- `lib/data/repositories/local_detection_repository.dart` — unused mock detection
- `lib/data/remote/vision_api_client.dart` — minimal duplicate of api_client.dart
- `lib/data/services/image_hash_service.dart` — minimal, unused
- `lib/data/services/image_picker_service_impl.dart` — minimal, unused
- `lib/data/services/image_picker_service_mock/` — entire directory if exists
- `lib/data/services/image_storage_service.dart` — functionality merged into image_processing_service.dart
- `lib/data/database/tables/categories.dart` — hardcoded system categories
- `lib/data/database/tables/item_categories.dart` — junction table for deleted categories
- `lib/data/database/tables/item_images.dart` — multi-image per item not needed; single thumbnailPath on inventory_items suffices
- `lib/data/database/tables/sync_queue.dart` — server sync not in scope

**Providers:**
- `lib/application/providers/search_history_provider.dart` — unused, imports undefined model
- `lib/application/providers/image_picker_provider.dart` — minimal, unused
- `lib/application/providers/search_providers.dart` — if exists, merged into inventory_providers.dart

**Domain:**
- Any domain service interfaces that reference deleted features

**Tests:**
- All test files referencing deleted code — rewrite for new models

**Rule**: If a file exists in the codebase but is NOT in the Section 6.1 file structure, it gets deleted. No exceptions. After deletion, run `flutter analyze` to verify zero import errors.

### 6.3 Database Schema & Migration

**Schema version**: 3 (upgraded from current version 2)

3 tables only:

**inventory_items** (unchanged from v2):
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `photoPath` TEXT NOT NULL
- `thumbnailPath` TEXT NOT NULL
- `detectionData` TEXT NOT NULL (full VLM JSON response)
- `createdAt` DATETIME NOT NULL
- `updatedAt` DATETIME NOT NULL

**labels** (modified — add `confidence` column, make `key` NOT NULL):
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `itemId` INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE
- `key` TEXT NOT NULL (was nullable in v2 — now required, e.g., "name", "category", "brand")
- `value` TEXT NOT NULL
- `confidence` REAL NOT NULL DEFAULT 1.0 (new column — VLM confidence for this label)
- `createdAt` DATETIME NOT NULL
- UNIQUE(itemId, key, value)

**label_search_fts** (unchanged): FTS5 virtual table synced via triggers on labels.value

**Migration v2 → v3:**

```dart
onUpgrade: (m, from, to) async {
  if (from < 3) {
    // Drop tables no longer needed
    await m.database.customStatement('DROP TABLE IF EXISTS item_categories');
    await m.database.customStatement('DROP TABLE IF EXISTS categories');
    await m.database.customStatement('DROP TABLE IF EXISTS sync_queue');
    await m.database.customStatement('DROP TABLE IF EXISTS item_images');

    // Drop obsolete indexes
    await m.database.customStatement('DROP INDEX IF EXISTS idx_sync_queue_queued_at');
    await m.database.customStatement('DROP INDEX IF EXISTS idx_item_categories_item_id');
    await m.database.customStatement('DROP INDEX IF EXISTS idx_item_categories_category_id');
    await m.database.customStatement('DROP INDEX IF EXISTS idx_item_images_item_id');

    // Add confidence column to labels (default 1.0 for existing rows)
    await m.database.customStatement(
      'ALTER TABLE labels ADD COLUMN confidence REAL NOT NULL DEFAULT 1.0'
    );

    // Make key NOT NULL — update any existing NULL keys to 'label'
    await m.database.customStatement(
      "UPDATE labels SET key = 'label' WHERE key IS NULL"
    );
  }
}
```

**Existing data**: `inventory_items` and `labels` rows survive unchanged. Only the deleted tables are dropped. Existing labels with NULL keys get migrated to `key = 'label'`.

**Remove from onCreate path**: Delete `_seedDefaultCategories()` call and method entirely. Remove `categories`, `item_categories`, `sync_queue`, and `item_images` from the `@DriftDatabase(tables: [...])` annotation.

### 6.4 Domain Model — DetectedObject

```dart
@freezed
class DetectedObject with _$DetectedObject {
  const factory DetectedObject({
    required int boxIndex,              // Correlates with detection stage bounding box
    required String label,              // "IKEA KALLAX shelf unit"
    required String category,           // "living room furniture"
    required double confidence,
    required BoundingBox boundingBox,   // Denormalized copy from detection stage
    String? brand,
    String? model,
    required List<String> colors,
    required List<String> materials,
    String? condition,
    ValueRange? estimatedValue,
    String? description,
  }) = _DetectedObject;

  factory DetectedObject.fromJson(Map<String, dynamic> json) =>
      _$DetectedObjectFromJson(json);
}

@freezed
class BoundingBox with _$BoundingBox {
  const factory BoundingBox({
    required double x,
    required double y,
    required double width,
    required double height,
  }) = _BoundingBox;

  factory BoundingBox.fromJson(Map<String, dynamic> json) =>
      _$BoundingBoxFromJson(json);
}

@freezed
class ValueRange with _$ValueRange {
  const factory ValueRange({
    required double low,
    required double high,
  }) = _ValueRange;

  factory ValueRange.fromJson(Map<String, dynamic> json) =>
      _$ValueRangeFromJson(json);
}
```

The `fromJson` factory handles the `snake_case` → `camelCase` mapping from the API response (e.g., `box_index` → `boxIndex`, `estimated_value_usd` → `estimatedValue`). This is handled by `@JsonKey(name: 'box_index')` annotations on the Freezed model.

### 6.5 Inventory Repository — Label Extraction

When saving a detected object, the repository extracts all VLM attributes as searchable key-value labels:

- `label` → the VLM `label` field (stored as key="label", value="IKEA KALLAX shelf unit")
- `category` → category
- `brand` → brand (if not null)
- `model` → model (if not null)
- `color` → each color in the colors array
- `material` → each material in the materials array
- `condition` → condition (if not null)
- `description` → description (if not null)

The label `key` matches the VLM field name exactly — no renaming. All labels are VLM-generated. Search finds items by matching any label value via FTS.

### 6.6 Navigation — 6 Routes

| Route | Screen | Purpose |
|-------|--------|---------|
| `/items` | InventoryFeedScreen | Main grid (bottom nav tab 1) |
| `/search` | SearchScreen | FTS search (bottom nav tab 2) |
| `/profile` | ProfileScreen | Stats + about (bottom nav tab 3) |
| `/camera` | CameraCaptureScreen | Photo capture (FAB) |
| `/detection` | DetectionResultsScreen | Review + save results |
| `/item/:id` | ItemDetailScreen | View item details |

### 6.7 Detection Results Screen — Production Flow

**Happy path:**
1. Receive image File from camera
2. Call API via `detectionRepositoryProvider`
3. Show loading with "Analyzing your items..."
4. On success: render image with bounding boxes overlaid
5. Each box shows label + confidence badge
6. User taps a box to see full VLM attributes (category, brand, colors, materials, condition, value)
7. User can edit any field inline
8. User selects which objects to save (checkboxes, all selected by default)
9. "Save to Inventory" generates thumbnail per object (cropped to bounding box), stores in Drift
10. Navigate to inventory feed

**Error states:**
- **API returns zero detections** (empty room, blank wall): Show the image with a message "No objects detected. Try taking a photo with more items visible." and a "Retake" button.
- **API returns 503** (all providers down): Show error_view with "Detection service is currently unavailable. Please try again later." and a "Retry" button.
- **Network unreachable** (offline): Show error_view with "No internet connection. Please connect and try again." and a "Retry" button.
- **API returns partial results** (some boxes have confidence: 0): Filter out confidence: 0 results before rendering. If all filtered out, show the "No objects detected" message.

### 6.8 Thumbnail Generation Fix

Current code uses the original image path as thumbnail (TODO comment). The fix:

```dart
final thumbnail = await _imageService.generateThumbnail(
  photo,
  cropRect: object.boundingBox.toRect(),
  targetSize: AppConfig.thumbnailSize,
);
```

This crops to the detected object's bounding box and compresses to thumbnail size.

### 6.9 Detection State

```dart
// application/state/detection_state.dart
@freezed
class DetectionState with _$DetectionState {
  const factory DetectionState.initial() = _Initial;
  const factory DetectionState.loading() = _Loading;
  const factory DetectionState.success({
    required List<DetectedObject> detections,
    required int processingTimeMs,
  }) = _Success;
  const factory DetectionState.empty() = _Empty;  // API returned 0 detections
  const factory DetectionState.error(String message) = _Error;
}
```

Used by `detection_providers.dart` to manage the detection flow state in the UI.

## 7. Hardcoded Labels — Complete Removal Checklist

| Location | Content | Action |
|----------|---------|--------|
| `detection-service/main.py` line 24 | `DEFAULT_VOCABULARY` (13 objects) | Delete — Grounding DINO uses text prompt |
| `api-service/src/adapters/mock-vision.adapter.ts` lines 12-48 | `objectDatabase` (28 objects) | Delete entire file |
| `mobile-app/lib/data/database/app_database.dart` lines 97-110 | `_seedDefaultCategories()` (12 categories) | Delete method + categories table |
| `api-service/src/__tests__/fixtures/test-data.ts` | Hardcoded "chair", "table" labels | Rewrite with VLM-style DetectedObject fixtures |
| `mobile-app/test/fixtures/mock_data.dart` | Hardcoded "lamp", "chair", "table" | Rewrite with VLM-style DetectedObject fixtures |

**Verification command** (must return zero results):
```bash
grep -rn \
  "sofa\|armchair\|chandelier\|throw pillow\|DEFAULT_VOCABULARY\|seedDefaultCategories\|objectDatabase\|pendant light\|wall sconce\|coffee table\|console table\|decorative pillow\|area rug\|potted plant\|throw blanket\|Kitchen.*FF6B6B\|Living Room.*4ECDC4\|Bedroom.*45B7D1\|Bathroom.*96CEB4" \
  --include="*.ts" --include="*.dart" --include="*.py" \
  api-service/src/ mobile-app/lib/ detection-service/
```

Note: Hardcoded category strings like "Kitchen", "Living Room" etc. will not appear in the migration code because the migration drops the tables entirely — it does not re-seed them.

## 8. Tests — What Gets Written

### API Service Tests

- `detection-pipeline.service.test.ts` — unit test: Stage 1 → Stage 2 flow, fallback behavior, circuit breaker integration
- `grounding-dino.detector.test.ts` — unit test: HTTP call to Python service, response parsing, timeout, error handling
- `gemini.classifier.test.ts` — unit test: API call, structured JSON parsing, snake_case→camelCase mapping, prompt construction, confidence:0 filtering
- `ollama.classifier.test.ts` — unit test: HTTP call, response parsing, Ollama-only mode (no bounding boxes)
- `google-vision.detector.test.ts` — unit test: API call, bounding box normalization
- `image-quality.service.test.ts` — unit test: blur, brightness, contrast analysis (port existing tests)
- `detect.route.test.ts` — integration test: multipart upload → full pipeline response
- `health.route.test.ts` — integration test: provider health status

Test stubs mock the HTTP calls to external services (Grounding DINO, Gemini, Google Vision, Ollama) and return realistic VLM-style responses.

### Mobile App Tests

- `detected_object_test.dart` — model serialization/deserialization including snake_case JSON
- `detection_repository_test.dart` — API call with mocked Dio response
- `inventory_repository_test.dart` — Drift CRUD with VLM-generated labels, label extraction
- `detection_results_screen_test.dart` — widget test: bounding boxes render, save flow, error states (zero detections, API error, offline)
- `inventory_feed_screen_test.dart` — widget test: grid displays items
- `item_detail_screen_test.dart` — widget test: labels display as chips
- `search_screen_test.dart` — widget test: FTS search returns results
- `camera_capture_screen_test.dart` — widget test: capture flow
- `app_database_migration_test.dart` — migration v2→v3: tables dropped, confidence column added, NULL keys migrated

All test fixtures use VLM-style output with realistic labels like "IKEA BILLY bookcase" instead of generic "shelf".

## 9. Docker Compose — Simplified

```yaml
services:
  api:
    build: ./api-service
    ports: ["8000:8000"]
    environment:
      - PORT=8000
      - DETECTION_SERVICE_URL=http://detection:8001
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - OLLAMA_BASE_URL=http://ollama:11434
      - OLLAMA_ENABLED=${OLLAMA_ENABLED:-false}
    depends_on:
      detection:
        condition: service_healthy

  detection:
    build: ./detection-service
    ports: ["8001:8001"]
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
    environment:
      - DETECTION_PROMPT=${DETECTION_PROMPT:-household objects . furniture . appliances . electronics . decor . items}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  ollama:
    image: ollama/ollama:latest
    ports: ["11434:11434"]
    volumes:
      - ollama_data:/root/.ollama
    profiles: ["ollama"]  # Only starts with: docker compose --profile ollama up

volumes:
  ollama_data:
```

Removed: PostgreSQL, Redis, MinIO containers. Not needed (mobile app stores locally).

Ollama runs as an optional profile — `docker compose --profile ollama up` to include it.

## 10. Definition of Done

| # | Criterion | Verification Method |
|---|-----------|-------------------|
| 1 | Camera capture works | Take photo on iOS/Android emulator |
| 2 | Photo sent to API | API logs show multipart upload received |
| 3 | Grounding DINO returns bounding boxes | API response includes box coordinates |
| 4 | VLM returns structured classification | Response has label, category, brand, colors, materials |
| 5 | Bounding boxes render on image | Visual check on detection results screen |
| 6 | User can save objects to inventory | Items appear in Drift DB |
| 7 | Thumbnails generated correctly | Cropped to bounding box, visible in feed grid |
| 8 | Inventory feed displays items | Grid shows thumbnails with labels |
| 9 | Item detail shows all attributes | All VLM labels rendered as chips |
| 10 | Search works across all attributes | Search "blue" finds items with blue color label |
| 11 | Delete item works | Item + labels removed from DB |
| 12 | Zero hardcoded labels | Grep verification command (Section 7) returns nothing |
| 13 | All tests pass | `make test` exits 0 |
| 14 | API + mobile build | `make build` exits 0 |
| 15 | Health check works | `GET /v1/health` returns provider status |
| 16 | Fallback works | Kill detection service → Google Vision fallback activates |
| 17 | Error states handled | Zero detections, API error, offline — all show user-friendly UI |
| 18 | No dead code | No unused imports, functions, files, providers; `flutter analyze` clean |
| 19 | Database migration works | Upgrade from v2→v3 preserves existing items and labels |
| 20 | Ollama-only mode works | With only Ollama running, full image analysis returns objects |
