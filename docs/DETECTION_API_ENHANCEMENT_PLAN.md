# Detection API Enhancement Plan

## Executive Summary

This document outlines a comprehensive plan to enhance the Visual Home Inventory Manager's detection API for improved accuracy, reduced latency, and production readiness. The plan covers architecture improvements, testing strategies, and CI/CD pipeline integration.

**Current State:** Multi-provider ensemble detection with YOLO-World, Google Vision, AWS Rekognition, Gemini, and DeepSeek
**Target Improvements:** 60% latency reduction, 15% accuracy improvement, production-grade reliability

---

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [Identified Bottlenecks](#identified-bottlenecks)
3. [Enhancement Phases](#enhancement-phases)
4. [Testing Strategy](#testing-strategy)
5. [CI/CD Pipeline Integration](#cicd-pipeline-integration)
6. [Success Metrics](#success-metrics)
7. [Risk Mitigation](#risk-mitigation)

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MOBILE APP (Flutter)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Camera    │→ │   Image     │→ │  Detection  │→ │  Inventory  │        │
│  │   Capture   │  │  Processing │  │  Repository │  │    Feed     │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ HTTP POST /v1/detect
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API SERVICE (Node.js/Fastify)                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Vision Orchestrator Service                       │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │   │
│  │  │YOLO-World│ │ Roboflow │ │Replicate │ │  Google  │ │ DeepSeek │  │   │
│  │  │ Adapter  │ │  YOLO    │ │Detectron2│ │  Vision  │ │  Vision  │  │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │   │
│  └───────┼────────────┼────────────┼────────────┼────────────┼────────┘   │
│          │            │            │            │            │             │
│          ▼            ▼            ▼            ▼            ▼             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Ensemble Fusion Service                          │   │
│  │  • IoU-based Non-Maximum Suppression (NMS)                         │   │
│  │  • Weighted confidence scoring                                      │   │
│  │  • Provider weight: onnx-yolo=1.0, roboflow=0.95, google=0.85      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                  Property Enrichment Service                        │   │
│  │  • Vertex AI Gemini (gemini-2.0-flash-exp)                         │   │
│  │  • Extracts: color, material, texture, style, era, brand           │   │
│  │  • Detects additional objects missed by YOLO                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DETECTION SERVICE (Python/FastAPI)                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         YOLO-World Detector                         │   │
│  │  • Model: yolov8m-worldv2.pt                                       │   │
│  │  • 185 home object classes (zero-shot capability)                  │   │
│  │  • Classes: sectional sofa, ghost chair, acrylic chair, etc.       │   │
│  │  • Confidence threshold: 0.25                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Provider Priority Order

| Priority | Provider | Purpose | Latency | Cost |
|----------|----------|---------|---------|------|
| 0 | YOLO-World | Home object detection (185 classes) | 200-500ms | Free (local) |
| 0.5 | ONNX YOLO | Fast local inference | 100-300ms | Free (local) |
| 1 | Roboflow YOLO | Accurate bounding boxes | 300-800ms | API credits |
| 2 | Replicate Detectron2 | Instance segmentation | 1-3s | API credits |
| 3 | Google Vision | Object localization | 500ms-1s | $1.50/1000 |
| 4 | DeepSeek Vision | Detailed descriptions | 1-2s | API credits |
| 5 | Hybrid (Google+Gemini) | Boxes + rich labels | 1-2s | Combined |
| 6 | AWS Rekognition | Backup detection | 500ms-1s | $1/1000 |

---

## Identified Bottlenecks

### Performance Bottlenecks

| Issue | Impact | Current Latency | Target |
|-------|--------|-----------------|--------|
| Sequential property enrichment | Blocks response | 1-3s | <500ms |
| YOLO-World cold start | First request slow | 60s+ | <5s |
| All providers run in parallel | Wasteful when not needed | Variable | Adaptive |
| No image preprocessing | Larger payloads | +200ms | -100ms |
| No result caching | Duplicate work | 100% | 20% |

### Accuracy Bottlenecks

| Issue | Impact | Current | Target |
|-------|--------|---------|--------|
| Generic COCO classes | Miss home-specific items | 80 classes | 185+ classes |
| No confidence calibration | Inconsistent thresholds | Provider-specific | Unified |
| Single NMS pass | May over-merge distinct items | 85% precision | 92% precision |
| No context awareness | Miss related items | Single-object | Multi-object |

### Reliability Bottlenecks

| Issue | Impact | Current | Target |
|-------|--------|---------|--------|
| Provider failures cascade | Service degradation | Manual fallback | Auto-fallback |
| No health monitoring | Silent failures | Reactive | Proactive |
| Memory leaks in Python service | OOM after hours | Restart required | Stable 24h+ |

---

## Enhancement Phases

### Phase 1: Latency Optimization (Week 1-2)

#### 1.1 Async Property Enrichment
**Goal:** Return core detections immediately, stream enrichments

```typescript
// Current: Sequential blocking
const enrichedDetections = await this.enrichmentService.enrichDetections(fused, imageBuffer);
return { detections: enrichedDetections };

// Proposed: Streaming response with SSE
return {
  detections: fusedDetections,  // Return immediately
  enrichmentJobId: jobId,       // Client polls for enrichments
};
```

**Implementation Tasks:**
- [ ] Add Redis for enrichment job queue
- [ ] Create `/v1/enrichment/:jobId` polling endpoint
- [ ] Update mobile app to handle async enrichment
- [ ] Add WebSocket option for real-time updates

#### 1.2 Smart Provider Selection
**Goal:** Only call necessary providers based on confidence

```typescript
// Tiered detection approach
async detectObjects(imageBuffer: Buffer): Promise<DetectionResponse> {
  // Tier 1: Fast local detection
  const localResult = await this.runLocalProviders(imageBuffer);

  if (localResult.confidence >= 0.85 && localResult.detections.length >= 1) {
    return localResult;  // Skip cloud providers
  }

  // Tier 2: Cloud providers for ambiguous cases
  return this.runCloudProviders(imageBuffer, localResult);
}
```

**Implementation Tasks:**
- [ ] Implement confidence threshold for early return
- [ ] Group providers into local/cloud tiers
- [ ] Add provider selection metrics
- [ ] Create A/B test framework for thresholds

#### 1.3 Image Preprocessing Pipeline
**Goal:** Optimize image before sending to providers

```typescript
// Preprocessing service
class ImagePreprocessor {
  async prepare(buffer: Buffer): Promise<ProcessedImage> {
    return {
      original: buffer,
      resized: await this.resize(buffer, 1024, 1024),
      thumbnail: await this.resize(buffer, 256, 256),
      hash: await this.perceptualHash(buffer),
    };
  }
}
```

**Implementation Tasks:**
- [ ] Add Sharp-based resize pipeline
- [ ] Implement perceptual hashing for deduplication
- [ ] Add JPEG quality optimization
- [ ] Create format conversion (HEIC → JPEG)

### Phase 2: Accuracy Improvements (Week 3-4)

#### 2.1 Confidence Calibration
**Goal:** Normalize confidence scores across providers

```typescript
// Calibration coefficients (learned from labeled data)
const CALIBRATION = {
  'yolo-world': { scale: 1.0, offset: 0.0 },
  'google': { scale: 0.85, offset: 0.05 },
  'aws': { scale: 0.9, offset: 0.03 },
};

function calibrateConfidence(provider: string, raw: number): number {
  const { scale, offset } = CALIBRATION[provider];
  return Math.min(1.0, raw * scale + offset);
}
```

**Implementation Tasks:**
- [ ] Collect labeled dataset (500+ images)
- [ ] Train calibration coefficients
- [ ] Implement calibration in fusion service
- [ ] Add calibration metrics dashboard

#### 2.2 Two-Pass NMS
**Goal:** Better handling of overlapping but distinct objects

```typescript
// First pass: Aggressive NMS within same class
const sameClassFiltered = nmsWithinClass(detections, iouThreshold: 0.5);

// Second pass: Conservative NMS across similar classes
const crossClassFiltered = nmsCrossClass(sameClassFiltered, iouThreshold: 0.8);
```

**Implementation Tasks:**
- [ ] Implement hierarchical NMS
- [ ] Add class similarity matrix
- [ ] Create NMS visualization tool
- [ ] Benchmark against single-pass

#### 2.3 Expanded Home Object Classes
**Goal:** Add 100+ new home-specific classes

```python
# Additional classes for YOLO-World
EXTENDED_HOME_CLASSES = [
    # Kitchen appliances
    "instant pot", "air fryer", "stand mixer", "espresso machine",
    # Smart home
    "smart speaker", "ring doorbell", "nest thermostat",
    # Furniture subtypes
    "murphy bed", "futon", "daybed", "canopy bed",
    # Storage
    "shoe rack", "coat rack", "umbrella stand",
    # Decor
    "terrarium", "succulent", "fiddle leaf fig",
]
```

**Implementation Tasks:**
- [ ] Curate extended class list (target: 300 classes)
- [ ] Test YOLO-World zero-shot performance
- [ ] Add fallback to CLIP for unknown objects
- [ ] Create class hierarchy for grouping

### Phase 3: On-Device Detection (Week 5-6)

#### 3.1 CoreML Integration for iOS
**Goal:** Run YOLO on-device for instant preview

```swift
// iOS on-device detection
class LocalDetector {
    private let model: VNCoreMLModel

    func detect(image: UIImage) async -> [Detection] {
        let request = VNCoreMLRequest(model: model)
        let handler = VNImageRequestHandler(cgImage: image.cgImage!)
        try? handler.perform([request])
        return parseResults(request.results)
    }
}
```

**Implementation Tasks:**
- [ ] Export YOLO to CoreML format
- [ ] Create Flutter platform channel for iOS
- [ ] Implement detection preview overlay
- [ ] Add model versioning and updates

#### 3.2 TFLite Integration for Android
**Goal:** Equivalent on-device detection for Android

```kotlin
// Android on-device detection
class LocalDetector(context: Context) {
    private val interpreter: Interpreter

    fun detect(bitmap: Bitmap): List<Detection> {
        val input = preprocessBitmap(bitmap)
        val output = Array(1) { Array(25200) { FloatArray(85) } }
        interpreter.run(input, output)
        return parseOutput(output)
    }
}
```

**Implementation Tasks:**
- [ ] Export YOLO to TFLite format
- [ ] Create Flutter platform channel for Android
- [ ] Optimize for various device tiers
- [ ] Add GPU delegate support

### Phase 4: Caching & Optimization (Week 7-8)

#### 4.1 Redis Result Caching
**Goal:** Cache detection results for similar images

```typescript
class DetectionCache {
  async get(imageHash: string): Promise<Detection[] | null> {
    const cached = await redis.get(`detection:${imageHash}`);
    if (cached) {
      await redis.hincrby('cache:stats', 'hits', 1);
      return JSON.parse(cached);
    }
    await redis.hincrby('cache:stats', 'misses', 1);
    return null;
  }

  async set(imageHash: string, detections: Detection[]): Promise<void> {
    await redis.setex(`detection:${imageHash}`, 3600, JSON.stringify(detections));
  }
}
```

**Implementation Tasks:**
- [ ] Set up Redis cluster
- [ ] Implement perceptual hash caching
- [ ] Add cache warming for common objects
- [ ] Create cache invalidation strategy

#### 4.2 Model Warm-Up Service
**Goal:** Eliminate cold start latency

```typescript
class ModelWarmupService {
  async warmup(): Promise<void> {
    const testImage = await this.loadTestImage();

    // Warm up all providers
    await Promise.all([
      this.providers.get('yolo-world')?.detectObjects(testImage),
      this.providers.get('onnx-yolo')?.detectObjects(testImage),
    ]);

    logger.info('All models warmed up');
  }

  scheduleKeepAlive(): void {
    // Ping every 5 minutes to prevent cold start
    setInterval(() => this.warmup(), 5 * 60 * 1000);
  }
}
```

**Implementation Tasks:**
- [ ] Create warmup endpoint
- [ ] Add Kubernetes liveness probe
- [ ] Implement keep-alive scheduler
- [ ] Add startup readiness check

### Phase 5: Production Hardening (Week 9-10)

#### 5.1 Observability Stack
**Goal:** Full visibility into detection pipeline

```yaml
# Prometheus metrics
detection_requests_total{provider, status}
detection_latency_seconds{provider, phase}
detection_confidence_histogram{provider}
cache_hit_ratio
provider_health{provider}
```

**Implementation Tasks:**
- [ ] Add Prometheus metrics exporter
- [ ] Create Grafana dashboards
- [ ] Set up alerting rules
- [ ] Add distributed tracing (Jaeger)

#### 5.2 Auto-Scaling Configuration
**Goal:** Handle variable load efficiently

```yaml
# Kubernetes HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: detection-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: detection-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Pods
    pods:
      metric:
        name: detection_queue_depth
      target:
        type: AverageValue
        averageValue: 10
```

**Implementation Tasks:**
- [ ] Create Kubernetes manifests
- [ ] Configure HPA with custom metrics
- [ ] Add pod disruption budgets
- [ ] Implement graceful shutdown

---

## Testing Strategy

### Unit Tests

#### API Service Unit Tests

```typescript
// File: api-service/src/__tests__/unit/ensemble-fusion.test.ts
describe('EnsembleFusionService', () => {
  describe('fuseDetections', () => {
    it('should merge overlapping boxes with IoU > 0.5', () => {
      const providerDetections = new Map([
        ['yolo-world', [{ label: 'couch', bbox: [0, 0, 100, 100], confidence: 0.9 }]],
        ['google', [{ label: 'sofa', bbox: [5, 5, 105, 105], confidence: 0.85 }]],
      ]);

      const fused = fusionService.fuseDetections(providerDetections);

      expect(fused).toHaveLength(1);
      expect(fused[0].confidence).toBeGreaterThan(0.9);
    });

    it('should keep distinct objects with IoU < 0.5', () => {
      const providerDetections = new Map([
        ['yolo-world', [
          { label: 'chair', bbox: [0, 0, 50, 50], confidence: 0.9 },
          { label: 'table', bbox: [200, 200, 300, 300], confidence: 0.85 },
        ]],
      ]);

      const fused = fusionService.fuseDetections(providerDetections);

      expect(fused).toHaveLength(2);
    });
  });
});
```

**Coverage Targets:**
- [ ] `ensemble-fusion.service.ts`: 90% line coverage
- [ ] `vision-orchestrator.service.ts`: 85% line coverage
- [ ] `property-enrichment.service.ts`: 80% line coverage
- [ ] All adapters: 75% line coverage

#### Detection Service Unit Tests

```python
# File: detection-service/tests/test_detector.py
import pytest
from main import detect_objects, HOME_OBJECT_CLASSES

class TestYoloWorldDetector:
    @pytest.fixture
    def sample_image(self):
        return open('tests/fixtures/living_room.jpg', 'rb').read()

    def test_detects_couch_in_living_room(self, sample_image):
        result = detect_objects(sample_image)

        labels = [d['label'] for d in result['detections']]
        assert any('sofa' in label or 'couch' in label for label in labels)

    def test_returns_valid_bounding_boxes(self, sample_image):
        result = detect_objects(sample_image)

        for detection in result['detections']:
            bbox = detection['boundingBox']
            assert 0 <= bbox['x'] <= 1
            assert 0 <= bbox['y'] <= 1
            assert 0 < bbox['width'] <= 1
            assert 0 < bbox['height'] <= 1

    def test_confidence_threshold_filtering(self, sample_image):
        result = detect_objects(sample_image, confidence_threshold=0.5)

        for detection in result['detections']:
            assert detection['confidence'] >= 0.5
```

### Integration Tests

#### API Contract Tests

```typescript
// File: api-service/src/__tests__/integration/detect.integration.test.ts
describe('POST /v1/detect', () => {
  it('should return detections for valid image', async () => {
    const image = await fs.readFile('tests/fixtures/kitchen.jpg');

    const response = await request(app)
      .post('/v1/detect')
      .attach('image', image, 'kitchen.jpg')
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      detections: expect.arrayContaining([
        expect.objectContaining({
          label: expect.any(String),
          confidence: expect.any(Number),
          boundingBox: expect.objectContaining({
            x: expect.any(Number),
            y: expect.any(Number),
            width: expect.any(Number),
            height: expect.any(Number),
          }),
        }),
      ]),
    });
  });

  it('should handle provider failures gracefully', async () => {
    // Simulate provider failure
    mockProviderFailure('google');

    const image = await fs.readFile('tests/fixtures/kitchen.jpg');

    const response = await request(app)
      .post('/v1/detect')
      .attach('image', image, 'kitchen.jpg')
      .expect(200);

    // Should still succeed with other providers
    expect(response.body.success).toBe(true);
    expect(response.body.providerResults).toContainEqual(
      expect.objectContaining({ provider: 'google', success: false })
    );
  });
});
```

#### Provider Health Integration Tests

```typescript
// File: api-service/src/__tests__/integration/health.integration.test.ts
describe('Provider Health Checks', () => {
  it('should report all provider statuses', async () => {
    const response = await request(app)
      .get('/v1/health')
      .expect(200);

    expect(response.body.providers).toMatchObject({
      'yolo-world': expect.any(Boolean),
      'onnx-yolo': expect.any(Boolean),
    });
  });

  it('should recover after provider reconnection', async () => {
    // Disconnect provider
    await stopYoloWorldService();

    let response = await request(app).get('/v1/health');
    expect(response.body.providers['yolo-world']).toBe(false);

    // Reconnect provider
    await startYoloWorldService();
    await waitFor(5000);

    response = await request(app).get('/v1/health');
    expect(response.body.providers['yolo-world']).toBe(true);
  });
});
```

### End-to-End Tests

#### Mobile App E2E Tests

```dart
// File: mobile-app/integration_test/detection_flow_test.dart
void main() {
  group('Detection Flow E2E', () {
    testWidgets('captures image and shows detections', (tester) async {
      await tester.pumpWidget(const MyApp());

      // Navigate to camera
      await tester.tap(find.byIcon(Icons.camera_alt));
      await tester.pumpAndSettle();

      // Capture image (mock camera)
      await tester.tap(find.byKey(const Key('capture_button')));
      await tester.pumpAndSettle(const Duration(seconds: 5));

      // Verify detection results screen
      expect(find.text('Detection Results'), findsOneWidget);
      expect(find.byType(BoundingBoxOverlay), findsWidgets);

      // Save to inventory
      await tester.tap(find.text('Save All'));
      await tester.pumpAndSettle();

      // Verify in inventory feed
      expect(find.byType(InventoryGridItem), findsWidgets);
    });

    testWidgets('handles API timeout gracefully', (tester) async {
      // Configure slow API response
      MockApiClient.setDelay(Duration(seconds: 30));

      await tester.pumpWidget(const MyApp());
      await tester.tap(find.byIcon(Icons.camera_alt));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('capture_button')));
      await tester.pump(const Duration(seconds: 15));

      // Should show timeout message
      expect(find.text('Detection timed out'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}
```

### Performance Tests

#### Load Testing with k6

```javascript
// File: tests/load/detection-load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const detectionLatency = new Trend('detection_latency');

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // Ramp up to 10 users
    { duration: '3m', target: 10 },   // Stay at 10 users
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '3m', target: 50 },   // Stay at 50 users
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    'detection_latency': ['p95<3000'],  // 95% of requests under 3s
    'errors': ['rate<0.05'],             // Error rate under 5%
  },
};

const testImage = open('./fixtures/living_room.jpg', 'b');

export default function () {
  const start = Date.now();

  const response = http.post(
    `${__ENV.API_URL}/v1/detect`,
    { image: http.file(testImage, 'image.jpg') },
    { timeout: '30s' }
  );

  const duration = Date.now() - start;
  detectionLatency.add(duration);

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'has detections': (r) => JSON.parse(r.body).detections?.length > 0,
    'latency under 5s': () => duration < 5000,
  });

  errorRate.add(!success);
  sleep(1);
}
```

#### Benchmark Tests

```typescript
// File: api-service/src/__tests__/benchmark/detection.benchmark.ts
import Benchmark from 'benchmark';

const suite = new Benchmark.Suite();

suite
  .add('NMS single pass', async () => {
    await fusionService.nmsPass(testDetections, 0.5);
  })
  .add('NMS two pass', async () => {
    await fusionService.twoPassNms(testDetections, 0.5, 0.8);
  })
  .add('IoU calculation', () => {
    calculateIoU(box1, box2);
  })
  .on('cycle', (event) => {
    console.log(String(event.target));
  })
  .on('complete', function() {
    console.log('Fastest is ' + this.filter('fastest').map('name'));
  })
  .run({ async: true });
```

### Test Data Management

#### Fixture Organization

```
tests/
├── fixtures/
│   ├── images/
│   │   ├── living_room.jpg        # Standard living room
│   │   ├── kitchen_cluttered.jpg  # Many objects
│   │   ├── bedroom_dark.jpg       # Low light conditions
│   │   ├── outdoor_patio.jpg      # Outdoor scene
│   │   └── empty_room.jpg         # No objects
│   ├── expected/
│   │   ├── living_room.json       # Expected detections
│   │   └── kitchen_cluttered.json
│   └── mock_responses/
│       ├── google_vision.json
│       ├── aws_rekognition.json
│       └── yolo_world.json
├── mocks/
│   ├── mock_providers.ts
│   └── mock_database.ts
└── helpers/
    ├── image_utils.ts
    └── assertion_utils.ts
```

---

## CI/CD Pipeline Integration

### GitHub Actions Workflow

```yaml
# File: .github/workflows/detection-api.yml
name: Detection API CI/CD

on:
  push:
    branches: [main, develop]
    paths:
      - 'api-service/**'
      - 'detection-service/**'
      - '.github/workflows/detection-api.yml'
  pull_request:
    branches: [main, develop]
    paths:
      - 'api-service/**'
      - 'detection-service/**'

env:
  NODE_VERSION: '20'
  PYTHON_VERSION: '3.11'
  REGISTRY: ghcr.io
  API_IMAGE: ghcr.io/${{ github.repository }}/api-service
  DETECTION_IMAGE: ghcr.io/${{ github.repository }}/detection-service

jobs:
  # ==========================================
  # Stage 1: Code Quality & Static Analysis
  # ==========================================
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: api-service/package-lock.json

      - name: Install dependencies
        run: npm ci
        working-directory: api-service

      - name: Run ESLint
        run: npm run lint
        working-directory: api-service

      - name: Run TypeScript type check
        run: npm run type-check
        working-directory: api-service

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Install Python linters
        run: pip install ruff mypy

      - name: Run Ruff (Python linter)
        run: ruff check detection-service/

      - name: Run MyPy (Python type check)
        run: mypy detection-service/main.py --ignore-missing-imports

  # ==========================================
  # Stage 2: Unit Tests
  # ==========================================
  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    needs: lint
    strategy:
      matrix:
        service: [api-service, detection-service]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        if: matrix.service == 'api-service'
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: api-service/package-lock.json

      - name: Run API unit tests
        if: matrix.service == 'api-service'
        run: |
          npm ci
          npm run test -- --coverage --reporter=junit --outputFile=junit.xml
        working-directory: api-service

      - name: Setup Python
        if: matrix.service == 'detection-service'
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Run Detection unit tests
        if: matrix.service == 'detection-service'
        run: |
          pip install -r requirements.txt pytest pytest-cov
          pytest tests/ --cov=. --cov-report=xml --junitxml=junit.xml
        working-directory: detection-service

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ${{ matrix.service }}/coverage.xml
          flags: ${{ matrix.service }}
          fail_ci_if_error: true

  # ==========================================
  # Stage 3: Integration Tests
  # ==========================================
  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: unit-tests
    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Install dependencies
        run: |
          cd api-service && npm ci
          cd ../detection-service && pip install -r requirements.txt

      - name: Start detection service
        run: |
          cd detection-service
          uvicorn main:app --host 0.0.0.0 --port 8001 &
          sleep 10

      - name: Start API service
        run: |
          cd api-service
          YOLO_WORLD_SERVICE_URL=http://localhost:8001 npm run dev &
          sleep 5

      - name: Run integration tests
        run: npm run test:integration
        working-directory: api-service
        env:
          API_URL: http://localhost:8000
          REDIS_URL: redis://localhost:6379

  # ==========================================
  # Stage 4: Build Docker Images
  # ==========================================
  build:
    name: Build Docker Images
    runs-on: ubuntu-latest
    needs: integration-tests
    permissions:
      contents: read
      packages: write
    outputs:
      api-tag: ${{ steps.meta-api.outputs.tags }}
      detection-tag: ${{ steps.meta-detection.outputs.tags }}
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract API metadata
        id: meta-api
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.API_IMAGE }}
          tags: |
            type=sha,prefix=
            type=ref,event=branch
            type=semver,pattern={{version}}

      - name: Build and push API image
        uses: docker/build-push-action@v5
        with:
          context: ./api-service
          push: true
          tags: ${{ steps.meta-api.outputs.tags }}
          labels: ${{ steps.meta-api.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Extract Detection metadata
        id: meta-detection
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.DETECTION_IMAGE }}

      - name: Build and push Detection image
        uses: docker/build-push-action@v5
        with:
          context: ./detection-service
          push: true
          tags: ${{ steps.meta-detection.outputs.tags }}
          labels: ${{ steps.meta-detection.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ==========================================
  # Stage 5: Load Testing (on main branch only)
  # ==========================================
  load-test:
    name: Load Testing
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Setup k6
        uses: grafana/k6-action@v0.3.1

      - name: Deploy to staging
        run: |
          # Deploy using staging manifests
          kubectl apply -f k8s/staging/
          kubectl rollout status deployment/detection-api -n staging

      - name: Run load tests
        run: |
          k6 run tests/load/detection-load-test.js \
            --env API_URL=${{ secrets.STAGING_API_URL }} \
            --out json=results.json

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: load-test-results
          path: results.json

  # ==========================================
  # Stage 6: Deploy to Production
  # ==========================================
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: [build, load-test]
    if: github.ref == 'refs/heads/main'
    environment:
      name: production
      url: https://api.allmythings.app
    steps:
      - uses: actions/checkout@v4

      - name: Configure kubectl
        uses: azure/k8s-set-context@v4
        with:
          kubeconfig: ${{ secrets.KUBE_CONFIG }}

      - name: Deploy API service
        run: |
          kubectl set image deployment/api-service \
            api=${{ needs.build.outputs.api-tag }} \
            -n production
          kubectl rollout status deployment/api-service -n production

      - name: Deploy Detection service
        run: |
          kubectl set image deployment/detection-service \
            detection=${{ needs.build.outputs.detection-tag }} \
            -n production
          kubectl rollout status deployment/detection-service -n production

      - name: Verify deployment
        run: |
          kubectl run health-check --image=curlimages/curl --rm -it --restart=Never -- \
            curl -f https://api.allmythings.app/v1/health

      - name: Notify on success
        uses: slackapi/slack-github-action@v1.25.0
        with:
          channel-id: 'deployments'
          slack-message: '✅ Detection API deployed to production: ${{ github.sha }}'
        env:
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

### Pull Request Workflow

```yaml
# File: .github/workflows/pr-check.yml
name: PR Quality Check

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  pr-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Check commit messages
        uses: wagoid/commitlint-github-action@v5

      - name: Check for large files
        run: |
          find . -type f -size +10M | grep -v node_modules | grep -v .git
          if [ $? -eq 0 ]; then
            echo "Large files found. Please use Git LFS."
            exit 1
          fi

      - name: Detect changes
        id: changes
        uses: dorny/paths-filter@v3
        with:
          filters: |
            api:
              - 'api-service/**'
            detection:
              - 'detection-service/**'
            mobile:
              - 'mobile-app/**'

      - name: API tests
        if: steps.changes.outputs.api == 'true'
        run: |
          cd api-service
          npm ci
          npm run verify

      - name: Detection tests
        if: steps.changes.outputs.detection == 'true'
        run: |
          cd detection-service
          pip install -r requirements.txt pytest
          pytest tests/

      - name: Comment test results
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '✅ All checks passed!'
            })
```

### Nightly Build Workflow

```yaml
# File: .github/workflows/nightly.yml
name: Nightly Build & Test

on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM UTC daily
  workflow_dispatch:

jobs:
  full-test-suite:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run full test suite
        run: just test-all

      - name: Run benchmark tests
        run: npm run test:benchmark
        working-directory: api-service

      - name: Generate test report
        run: |
          npm run test:coverage -- --reporter=html
          mv coverage/html test-report
        working-directory: api-service

      - name: Upload test report
        uses: actions/upload-artifact@v4
        with:
          name: test-report-${{ github.run_number }}
          path: api-service/test-report

      - name: Check for model updates
        run: |
          # Check if YOLO model has updates
          python scripts/check_model_updates.py

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1.25.0
        with:
          channel-id: 'alerts'
          slack-message: '❌ Nightly build failed: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}'
        env:
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

---

## Success Metrics

### Latency KPIs

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| P50 detection time | 2.5s | 800ms | Prometheus histogram |
| P95 detection time | 5s | 2s | Prometheus histogram |
| P99 detection time | 10s | 4s | Prometheus histogram |
| Cold start time | 60s | 5s | Health check latency |
| Cache hit rate | N/A | 30% | Redis metrics |

### Accuracy KPIs

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Detection precision | 85% | 92% | Labeled test set |
| Detection recall | 80% | 88% | Labeled test set |
| mAP@0.5 | 0.75 | 0.85 | COCO-style eval |
| False positive rate | 15% | 8% | Manual review |

### Reliability KPIs

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Service uptime | 95% | 99.9% | Uptime monitoring |
| Error rate | 5% | 0.5% | Error tracking |
| Provider failover time | N/A | <1s | Circuit breaker metrics |
| Mean time to recovery | 30min | 5min | Incident tracking |

---

## Risk Mitigation

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Provider API changes | High | Medium | Abstract adapters, version pinning |
| Model accuracy degradation | High | Low | Continuous evaluation, rollback capability |
| Memory leaks in Python service | Medium | Medium | Memory limits, automatic restarts |
| Cache stampede | Medium | Low | Lock-based cache population |

### Operational Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Provider outage | High | Medium | Multi-provider fallback |
| Cost overrun | Medium | Medium | Budget alerts, rate limiting |
| Data loss | High | Low | Backup strategy, replication |

### Rollback Strategy

```bash
# Immediate rollback via kubectl
kubectl rollout undo deployment/api-service -n production
kubectl rollout undo deployment/detection-service -n production

# Feature flag rollback
curl -X POST https://api.allmythings.app/admin/feature-flags \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"new_detection_pipeline": false}'
```

---

## Appendix

### A. Environment Variables

```bash
# API Service
PORT=8000
NODE_ENV=production
YOLO_WORLD_SERVICE_URL=http://detection-service:8001
REDIS_URL=redis://redis:6379
GOOGLE_CREDENTIALS=/secrets/google-credentials.json
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
GEMINI_API_KEY=xxx
DEEPSEEK_API_KEY=xxx

# Detection Service
YOLO_MODEL_PATH=/models/yolov8m-worldv2.pt
CONFIDENCE_THRESHOLD=0.25
MAX_DETECTIONS=100
ENABLE_GPU=true
```

### B. Monitoring Dashboard

```json
{
  "dashboard": {
    "title": "Detection API Monitoring",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          { "expr": "rate(detection_requests_total[5m])" }
        ]
      },
      {
        "title": "Latency Distribution",
        "type": "heatmap",
        "targets": [
          { "expr": "detection_latency_seconds_bucket" }
        ]
      },
      {
        "title": "Provider Health",
        "type": "stat",
        "targets": [
          { "expr": "provider_health" }
        ]
      },
      {
        "title": "Cache Hit Ratio",
        "type": "gauge",
        "targets": [
          { "expr": "cache_hits / (cache_hits + cache_misses)" }
        ]
      }
    ]
  }
}
```

### C. API Response Schema

```typescript
interface DetectionResponse {
  success: boolean;
  ensembleMode: 'full' | 'partial' | 'single' | 'none';
  processingTimeMs: number;
  detections: Detection[];
  providerResults: ProviderResult[];
  ensembleMetrics: {
    providersUsed: number;
    consensusScore: number;
    diversityScore: number;
  };
  enrichmentJobId?: string;  // For async enrichment
}

interface Detection {
  id: string;
  label: string;
  confidence: number;
  boundingBox: {
    x: number;      // 0-1 normalized
    y: number;      // 0-1 normalized
    width: number;  // 0-1 normalized
    height: number; // 0-1 normalized
  };
  properties?: {
    color?: string;
    material?: string;
    texture?: string;
    style?: string;
    era?: string;
    brand?: string;
  };
  providers: string[];  // Which providers detected this
}
```

---

*Document Version: 1.0*
*Last Updated: December 2024*
*Author: AI Engineering Team*
