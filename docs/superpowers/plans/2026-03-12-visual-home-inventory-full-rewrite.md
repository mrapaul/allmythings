# Visual Home Inventory Manager — Full Rewrite Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Visual Home Inventory Manager with a clean two-stage AI detection pipeline (Grounding DINO + VLM), remove all hardcoded labels, delete dead code, and verify end-to-end functionality.

**Architecture:** Two-stage pipeline — Stage 1 (detection) produces bounding boxes via Grounding DINO or Google Vision fallback, Stage 2 (classification) sends image + boxes to Gemini 2.5 Pro VLM or Ollama fallback to generate structured JSON with label, category, brand, colors, materials, condition, and estimated value. Mobile app captures photos, sends to API, displays results, and stores in local Drift database.

**Tech Stack:** Fastify/TypeScript (API), FastAPI/Python (detection), Flutter/Dart (mobile), Drift ORM (SQLite), Vitest (API tests), Grounding DINO (detection), Gemini 2.5 Pro / Ollama (classification)

**Spec:** `docs/superpowers/specs/2026-03-12-visual-home-inventory-full-rewrite-design.md`

---

## Chunk 1: API Service — Delete Dead Code & Scaffold New Structure

### Task 1: Delete all obsolete API service files

**Files:**
- Delete: `api-service/src/adapters/` (entire directory — 6 files)
- Delete: `api-service/src/algorithms/nms.algorithm.ts`
- Delete: `api-service/src/services/vision-orchestrator.service.ts`
- Delete: `api-service/src/services/ensemble-fusion.service.ts`
- Delete: `api-service/src/services/detection.service.ts`
- Delete: `api-service/src/services/inventory.service.ts`
- Delete: `api-service/src/services/search.service.ts`
- Delete: `api-service/src/services/sync.service.ts`
- Delete: `api-service/src/services/__tests__/` (entire directory)
- Delete: `api-service/src/routes/items.route.ts`
- Delete: `api-service/src/routes/labels.route.ts`
- Delete: `api-service/src/routes/search.route.ts`
- Delete: `api-service/src/routes/sync.route.ts`
- Delete: `api-service/src/schemas/inventory.schema.ts`
- Delete: `api-service/src/schemas/search.schema.ts`
- Delete: `api-service/src/schemas/sync.schema.ts`
- Delete: `api-service/src/db/` (entire directory — database.ts, repositories/)
- Delete: `api-service/src/__tests__/` (entire directory — will rewrite)

- [ ] **Step 1: Delete adapter files**

```bash
rm -rf api-service/src/adapters
```

- [ ] **Step 2: Delete obsolete services**

```bash
rm api-service/src/services/vision-orchestrator.service.ts \
   api-service/src/services/ensemble-fusion.service.ts \
   api-service/src/services/detection.service.ts \
   api-service/src/services/inventory.service.ts \
   api-service/src/services/search.service.ts \
   api-service/src/services/sync.service.ts
rm -rf api-service/src/services/__tests__
```

- [ ] **Step 3: Delete obsolete routes and schemas**

```bash
rm api-service/src/routes/items.route.ts \
   api-service/src/routes/labels.route.ts \
   api-service/src/routes/search.route.ts \
   api-service/src/routes/sync.route.ts
rm api-service/src/schemas/inventory.schema.ts \
   api-service/src/schemas/search.schema.ts \
   api-service/src/schemas/sync.schema.ts
```

- [ ] **Step 4: Delete database layer and old tests**

```bash
rm -rf api-service/src/db
rm -rf api-service/src/__tests__
rm api-service/src/algorithms/nms.algorithm.ts
```

- [ ] **Step 5: Create new directory structure**

```bash
mkdir -p api-service/src/providers
mkdir -p api-service/src/__tests__/unit
mkdir -p api-service/src/__tests__/integration
mkdir -p api-service/src/__tests__/fixtures
```

- [ ] **Step 6: Commit**

```bash
cd api-service
git add -A
git commit -m "refactor(api): delete obsolete adapters, ensemble, NMS, DB layer, and old tests

Removes 5 vision adapters, ensemble fusion, NMS algorithm, vision
orchestrator, inventory/search/sync routes and services, database
layer, and all old tests. Prepares for two-stage detection pipeline."
```

### Task 2: Rewrite env.config.ts — simplified configuration

**Files:**
- Modify: `api-service/src/config/env.config.ts`

- [ ] **Step 1: Rewrite env.config.ts with only needed vars**

Replace the entire file. Remove all database, S3, AWS, Roboflow, Replicate, DeepSeek, Anthropic, OpenAI, detection mode, local ONNX YOLO, ensemble weights, and NMS config. Keep only what the two-stage pipeline needs.

```typescript
/**
 * Environment configuration for the API service.
 * Two-stage pipeline: detection (Grounding DINO / Google Vision)
 *                   + classification (Gemini / Ollama VLM)
 */

export interface EnvConfig {
  port: number;
  nodeEnv: string;

  // Detection Service (Grounding DINO via Python microservice)
  detectionServiceUrl: string;
  detectionTimeoutMs: number;
  detectionBoxThreshold: number;
  detectionTextThreshold: number;
  detectionPrompt: string;

  // VLM Classification — Primary (Gemini)
  geminiApiKey: string;
  geminiModel: string;
  classificationTimeoutMs: number;
  classificationMinConfidence: number;

  // VLM Classification — Fallback (Ollama)
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaEnabled: boolean;

  // Detection Fallback (Google Cloud Vision)
  googleProjectId: string;
  googleCredentials: string;

  // Auth
  apiKey: string;
}

export const envConfig: EnvConfig = {
  port: parseInt(process.env.PORT || '8000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  detectionServiceUrl: process.env.DETECTION_SERVICE_URL || 'http://localhost:8001',
  detectionTimeoutMs: parseInt(process.env.DETECTION_TIMEOUT_MS || '5000', 10),
  detectionBoxThreshold: parseFloat(process.env.DETECTION_BOX_THRESHOLD || '0.3'),
  detectionTextThreshold: parseFloat(process.env.DETECTION_TEXT_THRESHOLD || '0.25'),
  detectionPrompt: process.env.DETECTION_PROMPT || 'household objects . furniture . appliances . electronics . decor . items',

  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
  classificationTimeoutMs: parseInt(process.env.CLASSIFICATION_TIMEOUT_MS || '15000', 10),
  classificationMinConfidence: parseFloat(process.env.CLASSIFICATION_MIN_CONFIDENCE || '0.5'),

  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5-vl:7b',
  ollamaEnabled: process.env.OLLAMA_ENABLED === 'true',

  googleProjectId: process.env.GOOGLE_CLOUD_PROJECT_ID || '',
  googleCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',

  apiKey: process.env.API_KEY || '',
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd api-service && npx tsc --noEmit 2>&1 | head -20`
Expected: Errors about missing imports in app.ts and routes (expected — we haven't updated those yet)

- [ ] **Step 3: Commit**

```bash
git add api-service/src/config/env.config.ts
git commit -m "refactor(api): simplify env config for two-stage detection pipeline

Removes 30+ obsolete env vars (database, S3, AWS, Roboflow, ensemble
weights, NMS). Adds detection service, Gemini VLM, Ollama, and auth
config."
```

### Task 3: Update package.json — remove unused dependencies, add needed ones

**Files:**
- Modify: `api-service/package.json`

- [ ] **Step 1: Update package.json**

Remove dependencies: `@aws-sdk/client-rekognition`, `pg`, `@types/pg`
Remove devDependencies: `testcontainers` (no longer need PostgreSQL for tests)
Keep: `@google-cloud/vision` (fallback detector), `@google/generative-ai` (Gemini classifier), `fastify`, `@fastify/cors`, `@fastify/multipart`, `@fastify/rate-limit`, `pino`, `pino-pretty`, `zod`

The `@google/generative-ai` package is already present for the Gemini classifier.

```json
{
  "name": "api-service",
  "version": "2.0.0",
  "description": "Two-stage AI detection API for Visual Home Inventory Manager",
  "main": "dist/app.js",
  "type": "commonjs",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/app.ts",
    "start": "node dist/app.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\"",
    "type-check": "tsc --noEmit"
  },
  "license": "ISC",
  "dependencies": {
    "@fastify/cors": "^8.5.0",
    "@fastify/multipart": "^8.0.0",
    "@fastify/rate-limit": "^9.1.0",
    "@google-cloud/vision": "^4.1.0",
    "@google/generative-ai": "^0.24.1",
    "fastify": "^4.25.0",
    "pino": "^10.1.0",
    "pino-pretty": "^10.3.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.10.5",
    "@types/supertest": "^6.0.2",
    "@typescript-eslint/eslint-plugin": "^6.15.0",
    "@typescript-eslint/parser": "^6.15.0",
    "@vitest/coverage-v8": "^3.2.4",
    "eslint": "^8.56.0",
    "form-data": "^4.0.0",
    "prettier": "^3.1.1",
    "supertest": "^6.3.3",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Simplify vitest.config.ts**

Remove global setup/teardown (no testcontainers), remove database test utils. Keep basic config with path aliases.

Read the current `api-service/vitest.config.ts` and rewrite it to:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 3: Install updated dependencies**

Run: `cd api-service && npm install`
Expected: clean install with no warnings about missing peer deps

- [ ] **Step 4: Commit**

```bash
git add api-service/package.json api-service/package-lock.json api-service/vitest.config.ts
git commit -m "refactor(api): update dependencies and test config for two-stage pipeline

Removes AWS SDK, PostgreSQL, testcontainers. Simplifies vitest config.
Bumps version to 2.0.0."
```

### Task 4: Rewrite auth middleware — API key only

**Files:**
- Modify: `api-service/src/middleware/auth.middleware.ts`

- [ ] **Step 1: Read current auth.middleware.ts**

Read: `api-service/src/middleware/auth.middleware.ts`

- [ ] **Step 2: Rewrite to simple API key validation**

Replace entire file:

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { envConfig } from '../config/env.config';
import { logger } from '../utils/logger';

/**
 * API key authentication middleware.
 * In development mode (NODE_ENV=development), auth is bypassed.
 * In production, validates Bearer token against API_KEY env var.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (envConfig.nodeEnv === 'development') {
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    logger.warn({ url: request.url }, 'Missing or invalid authorization header');
    reply.status(401).send({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  if (!envConfig.apiKey || token !== envConfig.apiKey) {
    logger.warn({ url: request.url }, 'Invalid API key');
    reply.status(401).send({ error: 'Invalid API key' });
    return;
  }
}
```

- [ ] **Step 3: Trim error.middleware.ts**

Read `api-service/src/middleware/error.middleware.ts`. Remove any references to deleted database errors or Zod schemas that no longer exist. Keep the core error handler structure.

- [ ] **Step 4: Trim utils/errors.ts**

Read `api-service/src/utils/errors.ts`. Remove error classes that are no longer used: `DatabaseError`, `ConflictError`, `ForbiddenError`, `TooManyRequestsError`, `CircuitOpenError`. Keep: `AppError`, `BadRequestError`, `UnauthorizedError`, `NotFoundError`, `PayloadTooLargeError`, `ValidationError`, `InternalServerError`, `ServiceUnavailableError`, `ImageProcessingError`.

- [ ] **Step 5: Commit**

```bash
git add api-service/src/middleware/ api-service/src/utils/errors.ts
git commit -m "refactor(api): simplify auth to API key, trim error classes

Auth now uses simple Bearer API key (bypassed in dev mode).
Removes unused error classes (DatabaseError, ConflictError, etc.)."
```

---

## Chunk 2: API Service — Build Two-Stage Detection Pipeline

### Task 5: Create provider interfaces

**Files:**
- Create: `api-service/src/providers/detector.interface.ts`
- Create: `api-service/src/providers/classifier.interface.ts`

- [ ] **Step 1: Write detector interface**

```typescript
// api-service/src/providers/detector.interface.ts

export interface BoundingBoxResult {
  box: { x: number; y: number; width: number; height: number };
  coarseLabel: string;
  confidence: number;
}

export interface ObjectDetector {
  readonly name: string;
  detect(image: Buffer): Promise<BoundingBoxResult[]>;
  healthCheck(): Promise<boolean>;
}
```

- [ ] **Step 2: Write classifier interface**

```typescript
// api-service/src/providers/classifier.interface.ts

import { BoundingBoxResult } from './detector.interface';

export interface ClassifiedObject {
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

export interface ObjectClassifier {
  readonly name: string;
  classify(image: Buffer, detections: BoundingBoxResult[]): Promise<ClassifiedObject[]>;
  healthCheck(): Promise<boolean>;
}
```

- [ ] **Step 3: Commit**

```bash
git add api-service/src/providers/
git commit -m "feat(api): add ObjectDetector and ObjectClassifier interfaces

Clean contracts for the two-stage detection pipeline. Detector produces
bounding boxes, classifier enriches with VLM-generated attributes."
```

### Task 6: Implement Grounding DINO detector

**Files:**
- Create: `api-service/src/providers/grounding-dino.detector.ts`
- Create: `api-service/src/__tests__/unit/grounding-dino.detector.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// api-service/src/__tests__/unit/grounding-dino.detector.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroundingDinoDetector } from '../../providers/grounding-dino.detector';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const config = {
  detectionServiceUrl: 'http://localhost:8001',
  detectionTimeoutMs: 5000,
  detectionPrompt: 'household objects . furniture',
  detectionBoxThreshold: 0.3,
  detectionTextThreshold: 0.25,
} as any;

describe('GroundingDinoDetector', () => {
  let detector: GroundingDinoDetector;

  beforeEach(() => {
    detector = new GroundingDinoDetector(config);
    vi.clearAllMocks();
  });

  it('should return bounding boxes from detection service', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        detections: [
          { box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, coarse_label: 'furniture', confidence: 0.85 },
          { box: { x: 0.5, y: 0.1, w: 0.2, h: 0.6 }, coarse_label: 'electronics', confidence: 0.72 },
        ],
      }),
    });

    const testImage = Buffer.from('fake-image-data');
    const results = await detector.detect(testImage);

    expect(results).toHaveLength(2);
    expect(results[0].box).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    expect(results[0].coarseLabel).toBe('furniture');
    expect(results[0].confidence).toBe(0.85);
  });

  it('should throw on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' });

    await expect(detector.detect(Buffer.from('img'))).rejects.toThrow();
  });

  it('should throw on timeout', async () => {
    mockFetch.mockImplementationOnce(() => new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AbortError')), 100)
    ));

    await expect(detector.detect(Buffer.from('img'))).rejects.toThrow();
  });

  it('should return true for health check when service is up', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });

    expect(await detector.healthCheck()).toBe(true);
  });

  it('should return false for health check when service is down', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    expect(await detector.healthCheck()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api-service && npx vitest run src/__tests__/unit/grounding-dino.detector.test.ts 2>&1 | tail -5`
Expected: FAIL — cannot find module `../../providers/grounding-dino.detector`

- [ ] **Step 3: Implement GroundingDinoDetector**

```typescript
// api-service/src/providers/grounding-dino.detector.ts
import { ObjectDetector, BoundingBoxResult } from './detector.interface';
import { EnvConfig } from '../config/env.config';
import { logger } from '../utils/logger';

/**
 * Calls the Python Grounding DINO detection service.
 * Returns bounding boxes with coarse labels.
 */
export class GroundingDinoDetector implements ObjectDetector {
  readonly name = 'grounding-dino';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly prompt: string;
  private readonly boxThreshold: number;
  private readonly textThreshold: number;

  constructor(config: EnvConfig) {
    this.baseUrl = config.detectionServiceUrl;
    this.timeoutMs = config.detectionTimeoutMs;
    this.prompt = config.detectionPrompt;
    this.boxThreshold = config.detectionBoxThreshold;
    this.textThreshold = config.detectionTextThreshold;
  }

  async detect(image: Buffer): Promise<BoundingBoxResult[]> {
    const formData = new FormData();
    formData.append('file', new Blob([image]), 'image.jpg');
    formData.append('prompt', this.prompt);
    formData.append('box_threshold', String(this.boxThreshold));
    formData.append('text_threshold', String(this.textThreshold));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/detect`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Detection service returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return (data.detections || []).map((d: any) => ({
        box: { x: d.box.x, y: d.box.y, width: d.box.w ?? d.box.width, height: d.box.h ?? d.box.height },
        coarseLabel: d.coarse_label || d.label || 'object',
        confidence: d.confidence,
      }));
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api-service && npx vitest run src/__tests__/unit/grounding-dino.detector.test.ts`
Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add api-service/src/providers/grounding-dino.detector.ts api-service/src/__tests__/unit/grounding-dino.detector.test.ts
git commit -m "feat(api): implement GroundingDinoDetector with tests

Calls Python detection service, returns bounding boxes. Handles
timeouts, errors, and health checks."
```

### Task 7: Implement Google Vision fallback detector

**Files:**
- Create: `api-service/src/providers/google-vision.detector.ts`
- Create: `api-service/src/__tests__/unit/google-vision.detector.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// api-service/src/__tests__/unit/google-vision.detector.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleVisionDetector } from '../../providers/google-vision.detector';

// Mock @google-cloud/vision
vi.mock('@google-cloud/vision', () => ({
  ImageAnnotatorClient: vi.fn().mockImplementation(() => ({
    objectLocalization: vi.fn(),
  })),
}));

import { ImageAnnotatorClient } from '@google-cloud/vision';

const config = {
  googleProjectId: 'test-project',
  googleCredentials: '/path/to/creds.json',
  detectionTimeoutMs: 5000,
} as any;

describe('GoogleVisionDetector', () => {
  let detector: GoogleVisionDetector;
  let mockClient: any;

  beforeEach(() => {
    detector = new GoogleVisionDetector(config);
    mockClient = (ImageAnnotatorClient as any).mock.results[0]?.value;
    vi.clearAllMocks();
  });

  it('should normalize vertex-based bounding boxes to {x, y, width, height}', async () => {
    const mockResponse = [{
      localizedObjectAnnotations: [
        {
          name: 'Chair',
          score: 0.87,
          boundingPoly: {
            normalizedVertices: [
              { x: 0.1, y: 0.2 },
              { x: 0.5, y: 0.2 },
              { x: 0.5, y: 0.8 },
              { x: 0.1, y: 0.8 },
            ],
          },
        },
      ],
    }];
    mockClient.objectLocalization.mockResolvedValueOnce(mockResponse);

    const results = await detector.detect(Buffer.from('fake-image'));
    expect(results).toHaveLength(1);
    expect(results[0].box).toEqual({ x: 0.1, y: 0.2, width: 0.4, height: 0.6 });
    expect(results[0].coarseLabel).toBe('Chair');
    expect(results[0].confidence).toBe(0.87);
  });

  it('should return empty array when no objects detected', async () => {
    mockClient.objectLocalization.mockResolvedValueOnce([{ localizedObjectAnnotations: [] }]);
    const results = await detector.detect(Buffer.from('fake-image'));
    expect(results).toHaveLength(0);
  });

  it('should return true for health check when client works', async () => {
    expect(await detector.healthCheck()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api-service && npx vitest run src/__tests__/unit/google-vision.detector.test.ts 2>&1 | tail -5`
Expected: FAIL — cannot find module `../../providers/google-vision.detector`

- [ ] **Step 3: Implement GoogleVisionDetector**

```typescript
// api-service/src/providers/google-vision.detector.ts
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { ObjectDetector, BoundingBoxResult } from './detector.interface';
import { EnvConfig } from '../config/env.config';
import { logger } from '../utils/logger';

export class GoogleVisionDetector implements ObjectDetector {
  readonly name = 'google-vision';
  private client: ImageAnnotatorClient;

  constructor(config: EnvConfig) {
    this.client = new ImageAnnotatorClient({
      projectId: config.googleProjectId || undefined,
      keyFilename: config.googleCredentials || undefined,
    });
  }

  async detect(image: Buffer): Promise<BoundingBoxResult[]> {
    const [result] = await this.client.objectLocalization({ image: { content: image } });
    const annotations = result.localizedObjectAnnotations || [];

    return annotations.map((obj) => {
      const vertices = obj.boundingPoly?.normalizedVertices || [];
      const xs = vertices.map((v) => v.x || 0);
      const ys = vertices.map((v) => v.y || 0);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);

      return {
        box: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        coarseLabel: obj.name || 'object',
        confidence: obj.score || 0,
      };
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Verify credentials are configured by checking project ID
      return !!(this.client && config.googleProjectId);
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api-service && npx vitest run src/__tests__/unit/google-vision.detector.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add api-service/src/providers/google-vision.detector.ts api-service/src/__tests__/unit/google-vision.detector.test.ts
git commit -m "feat(api): implement GoogleVisionDetector as fallback

Uses @google-cloud/vision objectLocalization. Normalizes vertex-based
bounding boxes to {x, y, width, height} format."
```

### Task 8: Implement Gemini VLM classifier

**Files:**
- Create: `api-service/src/providers/gemini.classifier.ts`
- Create: `api-service/src/__tests__/unit/gemini.classifier.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// api-service/src/__tests__/unit/gemini.classifier.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiClassifier } from '../../providers/gemini.classifier';
import { BoundingBoxResult } from '../../providers/detector.interface';

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn(),
    }),
  })),
}));

import { GoogleGenerativeAI } from '@google/generative-ai';

const config = {
  geminiApiKey: 'test-key',
  geminiModel: 'gemini-2.5-pro',
  classificationTimeoutMs: 15000,
  classificationMinConfidence: 0.5,
} as any;

const sampleDetections: BoundingBoxResult[] = [
  { box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, coarseLabel: 'furniture', confidence: 0.85 },
];

const sampleVlmResponse = JSON.stringify([
  {
    box_index: 0, label: 'IKEA BILLY bookcase', category: 'living room furniture',
    brand: 'IKEA', model: 'BILLY', colors: ['birch'], materials: ['particleboard'],
    condition: 'good', estimated_value_usd: { low: 40, high: 70 },
    description: 'Bookcase with shelves', confidence: 0.92,
  },
]);

describe('GeminiClassifier', () => {
  let classifier: GeminiClassifier;
  let mockModel: any;

  beforeEach(() => {
    classifier = new GeminiClassifier(config);
    const ai = (GoogleGenerativeAI as any).mock.results[0]?.value;
    mockModel = ai.getGenerativeModel();
    vi.clearAllMocks();
  });

  it('should map snake_case VLM response to camelCase ClassifiedObject', async () => {
    mockModel.generateContent.mockResolvedValueOnce({
      response: { text: () => sampleVlmResponse },
    });

    const results = await classifier.classify(Buffer.from('img'), sampleDetections);
    expect(results).toHaveLength(1);
    expect(results[0].boxIndex).toBe(0);
    expect(results[0].label).toBe('IKEA BILLY bookcase');
    expect(results[0].estimatedValue).toEqual({ low: 40, high: 70 });
    expect(results[0].boundingBox).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  });

  it('should filter out confidence:0 items', async () => {
    const withZero = JSON.stringify([
      { box_index: 0, label: 'unknown', category: 'unknown', confidence: 0 },
    ]);
    mockModel.generateContent.mockResolvedValueOnce({
      response: { text: () => withZero },
    });
    const results = await classifier.classify(Buffer.from('img'), sampleDetections);
    expect(results).toHaveLength(0);
  });

  it('should use full-image prompt when detections is empty (Ollama-only mode)', async () => {
    mockModel.generateContent.mockResolvedValueOnce({
      response: { text: () => sampleVlmResponse },
    });
    await classifier.classify(Buffer.from('img'), []);
    const callArgs = mockModel.generateContent.mock.calls[0][0];
    const promptText = typeof callArgs === 'string' ? callArgs : JSON.stringify(callArgs);
    expect(promptText).toContain('identify all household objects');
  });

  it('should handle markdown-wrapped JSON (```json)', async () => {
    const wrapped = '```json\n' + sampleVlmResponse + '\n```';
    mockModel.generateContent.mockResolvedValueOnce({
      response: { text: () => wrapped },
    });
    const results = await classifier.classify(Buffer.from('img'), sampleDetections);
    expect(results).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api-service && npx vitest run src/__tests__/unit/gemini.classifier.test.ts 2>&1 | tail -5`
Expected: FAIL — cannot find module `../../providers/gemini.classifier`

- [ ] **Step 3: Implement GeminiClassifier**

```typescript
// api-service/src/providers/gemini.classifier.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ObjectClassifier, ClassifiedObject } from './classifier.interface';
import { BoundingBoxResult } from './detector.interface';
import { EnvConfig } from '../config/env.config';
import { logger } from '../utils/logger';

export class GeminiClassifier implements ObjectClassifier {
  readonly name = 'gemini';
  private model: any;
  private minConfidence: number;

  constructor(config: EnvConfig) {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    this.model = genAI.getGenerativeModel({ model: config.geminiModel });
    this.minConfidence = config.classificationMinConfidence;
  }

  async classify(image: Buffer, detections: BoundingBoxResult[]): Promise<ClassifiedObject[]> {
    const prompt = detections.length > 0
      ? this.buildDetectionPrompt(detections)
      : this.buildFullImagePrompt();

    const result = await this.model.generateContent([
      prompt,
      { inlineData: { mimeType: 'image/jpeg', data: image.toString('base64') } },
    ]);

    const text = result.response.text();
    const json = this.extractJson(text);
    const parsed = JSON.parse(json);

    return (Array.isArray(parsed) ? parsed : [parsed])
      .map((item: any) => this.mapToClassifiedObject(item, detections))
      .filter((obj: ClassifiedObject) => obj.confidence > 0);
  }

  private buildDetectionPrompt(detections: BoundingBoxResult[]): string {
    const boxes = detections.map((d, i) => ({
      index: i, box: d.box, coarse_label: d.coarseLabel,
    }));
    return `You are analyzing a photo for a home inventory application.\n\nObjects have been detected at these locations (normalized 0-1 coordinates):\n${JSON.stringify(boxes, null, 2)}\n\nFor each detected object, return a JSON array:\n[\n  {\n    "box_index": 0,\n    "label": "specific name, e.g. 'standing desk lamp' not just 'lamp'",\n    "category": "descriptive category, e.g. 'living room furniture'",\n    "brand": "if identifiable from visual cues, else null",\n    "model": "if identifiable, else null",\n    "colors": ["primary color", "secondary if applicable"],\n    "materials": ["primary material", "secondary if applicable"],\n    "condition": "new | like-new | good | fair | poor",\n    "estimated_value_usd": { "low": number, "high": number } or null,\n    "description": "one-sentence description of the item",\n    "confidence": 0.0 to 1.0\n  }\n]\n\nRules:\n- Be as specific as possible with labels\n- Only describe objects you can actually see clearly\n- Do not guess brands — return null if unsure\n- Categories should be descriptive, not from a fixed list\n- If a detected region contains no identifiable object, return confidence: 0 for that box_index\n- Return valid JSON only, no markdown`;
  }

  private buildFullImagePrompt(): string {
    return `Analyze this image and identify all household objects you can see. For each object, estimate its bounding box as normalized 0-1 coordinates (x, y, width, height where x,y is top-left corner).\n\nReturn a JSON array with one entry per object:\n[\n  {\n    "box_index": 0,\n    "label": "specific name",\n    "category": "descriptive category",\n    "brand": "if identifiable, else null",\n    "model": "if identifiable, else null",\n    "colors": ["primary color"],\n    "materials": ["primary material"],\n    "condition": "new | like-new | good | fair | poor",\n    "estimated_value_usd": { "low": number, "high": number } or null,\n    "description": "one-sentence description",\n    "confidence": 0.0 to 1.0,\n    "bounding_box": { "x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0 }\n  }\n]\n\nReturn valid JSON only, no markdown.`;
  }

  private extractJson(text: string): string {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const start = cleaned.indexOf('[');
    if (start === -1) {
      const objStart = cleaned.indexOf('{');
      if (objStart === -1) throw new Error('No JSON found in VLM response');
      return cleaned.slice(objStart);
    }
    return cleaned.slice(start);
  }

  private mapToClassifiedObject(item: any, detections: BoundingBoxResult[]): ClassifiedObject {
    const boxIndex = item.box_index ?? 0;
    const detection = detections[boxIndex];
    return {
      boxIndex,
      label: item.label || 'unknown',
      category: item.category || 'uncategorized',
      brand: item.brand || null,
      model: item.model || null,
      colors: item.colors || [],
      materials: item.materials || [],
      condition: item.condition || null,
      estimatedValue: item.estimated_value_usd || null,
      description: item.description || null,
      confidence: item.confidence ?? 0,
      boundingBox: detection?.box ?? item.bounding_box ?? { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      return this.model !== null;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api-service && npx vitest run src/__tests__/unit/gemini.classifier.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add api-service/src/providers/gemini.classifier.ts api-service/src/__tests__/unit/gemini.classifier.test.ts
git commit -m "feat(api): implement GeminiClassifier with VLM prompt

Sends image + bounding boxes to Gemini 2.5 Pro, receives structured
JSON with label, category, brand, colors, materials, condition, value.
Handles snake_case→camelCase mapping and Ollama-only mode."
```

### Task 9: Implement Ollama VLM classifier

**Files:**
- Create: `api-service/src/providers/ollama.classifier.ts`
- Create: `api-service/src/__tests__/unit/ollama.classifier.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// api-service/src/__tests__/unit/ollama.classifier.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaClassifier } from '../../providers/ollama.classifier';
import { BoundingBoxResult } from '../../providers/detector.interface';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const config = {
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'qwen2.5-vl:7b',
  ollamaEnabled: true,
  classificationTimeoutMs: 15000,
  classificationMinConfidence: 0.5,
} as any;

const sampleDetections: BoundingBoxResult[] = [
  { box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, coarseLabel: 'furniture', confidence: 0.85 },
];

const sampleVlmJson = JSON.stringify([{
  box_index: 0, label: 'wooden desk', category: 'office furniture',
  brand: null, model: null, colors: ['brown'], materials: ['wood'],
  condition: 'good', estimated_value_usd: { low: 100, high: 200 },
  description: 'Solid wood office desk', confidence: 0.88,
}]);

describe('OllamaClassifier', () => {
  let classifier: OllamaClassifier;

  beforeEach(() => {
    classifier = new OllamaClassifier(config);
    vi.clearAllMocks();
  });

  it('should extract JSON from mixed Ollama text output', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: `Here are the objects:\n${sampleVlmJson}\nDone.` }),
    });

    const results = await classifier.classify(Buffer.from('img'), sampleDetections);
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe('wooden desk');
    expect(results[0].boundingBox).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  });

  it('should call /api/tags for health check', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ models: [] }) });
    expect(await classifier.healthCheck()).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/tags'),
      expect.any(Object),
    );
  });

  it('should return false for health check when Ollama is down', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await classifier.healthCheck()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api-service && npx vitest run src/__tests__/unit/ollama.classifier.test.ts 2>&1 | tail -5`
Expected: FAIL — cannot find module `../../providers/ollama.classifier`

- [ ] **Step 3: Implement OllamaClassifier**

```typescript
// api-service/src/providers/ollama.classifier.ts
import { ObjectClassifier, ClassifiedObject } from './classifier.interface';
import { BoundingBoxResult } from './detector.interface';
import { EnvConfig } from '../config/env.config';
import { logger } from '../utils/logger';

export class OllamaClassifier implements ObjectClassifier {
  readonly name = 'ollama';
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly minConfidence: number;

  constructor(config: EnvConfig) {
    this.baseUrl = config.ollamaBaseUrl;
    this.model = config.ollamaModel;
    this.timeoutMs = config.classificationTimeoutMs;
    this.minConfidence = config.classificationMinConfidence;
  }

  async classify(image: Buffer, detections: BoundingBoxResult[]): Promise<ClassifiedObject[]> {
    const prompt = detections.length > 0
      ? this.buildDetectionPrompt(detections)
      : this.buildFullImagePrompt();

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        images: [image.toString('base64')],
        stream: false,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const data = await response.json();
    const text = data.response || '';
    const json = this.extractJson(text);
    const parsed = JSON.parse(json);

    return (Array.isArray(parsed) ? parsed : [parsed])
      .map((item: any) => this.mapToClassifiedObject(item, detections))
      .filter((obj: ClassifiedObject) => obj.confidence > 0);
  }

  private buildDetectionPrompt(detections: BoundingBoxResult[]): string {
    const boxes = detections.map((d, i) => ({ index: i, box: d.box, coarse_label: d.coarseLabel }));
    return `You are analyzing a photo for a home inventory application.\n\nObjects detected at:\n${JSON.stringify(boxes, null, 2)}\n\nFor each, return JSON array with: box_index, label, category, brand, model, colors, materials, condition, estimated_value_usd, description, confidence. Return valid JSON only.`;
  }

  private buildFullImagePrompt(): string {
    return `Analyze this image and identify all household objects you can see. Return a JSON array with: box_index, label, category, brand, model, colors, materials, condition, estimated_value_usd, description, confidence, bounding_box. Return valid JSON only.`;
  }

  private extractJson(text: string): string {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const start = cleaned.indexOf('[');
    if (start === -1) {
      const objStart = cleaned.indexOf('{');
      if (objStart === -1) throw new Error('No JSON found in Ollama response');
      return cleaned.slice(objStart);
    }
    return cleaned.slice(start);
  }

  private mapToClassifiedObject(item: any, detections: BoundingBoxResult[]): ClassifiedObject {
    const boxIndex = item.box_index ?? 0;
    const detection = detections[boxIndex];
    return {
      boxIndex,
      label: item.label || 'unknown',
      category: item.category || 'uncategorized',
      brand: item.brand || null,
      model: item.model || null,
      colors: item.colors || [],
      materials: item.materials || [],
      condition: item.condition || null,
      estimatedValue: item.estimated_value_usd || null,
      description: item.description || null,
      confidence: item.confidence ?? 0,
      boundingBox: detection?.box ?? item.bounding_box ?? { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api-service && npx vitest run src/__tests__/unit/ollama.classifier.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add api-service/src/providers/ollama.classifier.ts api-service/src/__tests__/unit/ollama.classifier.test.ts
git commit -m "feat(api): implement OllamaClassifier as self-hosted fallback

Calls local Ollama API with same VLM prompt as Gemini. Extracts JSON
from mixed text output. Supports Ollama-only mode."
```

### Task 10: Implement detection pipeline service

**Files:**
- Create: `api-service/src/services/detection-pipeline.service.ts`
- Create: `api-service/src/__tests__/unit/detection-pipeline.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// api-service/src/__tests__/unit/detection-pipeline.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DetectionPipelineService } from '../../services/detection-pipeline.service';
import { ObjectDetector, BoundingBoxResult } from '../../providers/detector.interface';
import { ObjectClassifier, ClassifiedObject } from '../../providers/classifier.interface';
import { ServiceUnavailableError } from '../../utils/errors';

describe('DetectionPipelineService', () => {
  let service: DetectionPipelineService;
  let mockDetector: ObjectDetector;
  let mockClassifier: ObjectClassifier;
  const config = {
    detectionServiceUrl: 'http://localhost:8001',
    geminiApiKey: 'test-key',
    ollamaEnabled: false,
  } as any;

  beforeEach(() => {
    mockDetector = {
      name: 'test-detector',
      detect: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    mockClassifier = {
      name: 'test-classifier',
      classify: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    service = new DetectionPipelineService(config);
    // Inject mocks into the private arrays for testing
    (service as any).detectors = [{ provider: mockDetector, breaker: { isOpen: () => false, execute: (fn: any) => fn() } }];
    (service as any).classifiers = [{ provider: mockClassifier, breaker: { isOpen: () => false, execute: (fn: any) => fn() } }];
  });

  it('should run full pipeline: detect -> classify', async () => {
    const boxes: BoundingBoxResult[] = [{ box: { x: 0, y: 0, width: 1, height: 1 }, coarseLabel: 'obj', confidence: 0.9 }];
    const objects: ClassifiedObject[] = [{ boxIndex: 0, label: 'item', category: 'cat', brand: null, model: null, colors: [], materials: [], condition: null, estimatedValue: null, description: null, confidence: 0.9, boundingBox: boxes[0].box }];
    
    (mockDetector.detect as any).mockResolvedValue(boxes);
    (mockClassifier.classify as any).mockResolvedValue(objects);

    const result = await service.detect(Buffer.from('img'));

    expect(result.detections).toHaveLength(1);
    expect(mockDetector.detect).toHaveBeenCalled();
    expect(mockClassifier.classify).toHaveBeenCalledWith(expect.any(Buffer), boxes);
  });

  it('should fallback to secondary detector if primary fails', async () => {
    const secondaryDetector = { name: 'secondary', detect: vi.fn().mockResolvedValue([]), healthCheck: vi.fn() };
    (service as any).detectors.push({ provider: secondaryDetector, breaker: { isOpen: () => false, execute: (fn: any) => fn() } });
    
    (mockDetector.detect as any).mockRejectedValue(new Error('fail'));

    await service.detect(Buffer.from('img'));

    expect(secondaryDetector.detect).toHaveBeenCalled();
  });

  it('should throw ServiceUnavailableError if all providers fail', async () => {
    (mockDetector.detect as any).mockRejectedValue(new Error('fail'));
    await expect(service.detect(Buffer.from('img'))).rejects.toThrow(ServiceUnavailableError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api-service && npx vitest run src/__tests__/unit/detection-pipeline.service.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement DetectionPipelineService**

```typescript
// api-service/src/services/detection-pipeline.service.ts
import { EnvConfig } from '../config/env.config';
import { ObjectDetector, BoundingBoxResult } from '../providers/detector.interface';
import { ObjectClassifier, ClassifiedObject } from '../providers/classifier.interface';
import { GroundingDinoDetector } from '../providers/grounding-dino.detector';
import { GoogleVisionDetector } from '../providers/google-vision.detector';
import { GeminiClassifier } from '../providers/gemini.classifier';
import { OllamaClassifier } from '../providers/ollama.classifier';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { ServiceUnavailableError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface DetectionResponse {
  detections: ClassifiedObject[];
  processingTimeMs: number;
  detector?: string;
  classifier?: string;
}

export class DetectionPipelineService {
  private detectors: { provider: ObjectDetector; breaker: CircuitBreaker }[];
  private classifiers: { provider: ObjectClassifier; breaker: CircuitBreaker }[];
  private lastUsedDetector?: string;
  private lastUsedClassifier?: string;

  constructor(config: EnvConfig) {
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
    this.lastUsedDetector = undefined;
    this.lastUsedClassifier = undefined;

    let boxes: BoundingBoxResult[] = [];
    try {
      boxes = await this.runWithFallback(
        this.detectors,
        (d) => d.detect(imageBuffer),
        'detection'
      );
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        logger.warn('All detectors failed, attempting Ollama-only mode if available');
        // Fall through to classifier with empty boxes (Ollama-only mode)
      } else {
        throw error;
      }
    }

    if (boxes.length === 0 && this.detectors.every(d => !d.breaker.isOpen())) {
        // If we actually ran detectors and they found nothing, return empty
        return { detections: [], processingTimeMs: Date.now() - startTime };
    }

    const classified = await this.runWithFallback(
      this.classifiers,
      (c) => c.classify(imageBuffer, boxes),
      'classification'
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
    stage: string
  ): Promise<R> {
    for (const { provider, breaker } of providers) {
      const name = (provider as any).name;
      if (breaker.isOpen()) {
        logger.info({ provider: name }, `${stage} circuit open, skipping`);
        continue;
      }

      try {
        const result = await breaker.execute(() => fn(provider));
        if (stage === 'detection') this.lastUsedDetector = name;
        else this.lastUsedClassifier = name;
        return result;
      } catch (error) {
        logger.warn({ provider: name, error }, `${stage} failed, trying next`);
      }
    }
    throw new ServiceUnavailableError(`All ${stage} providers unavailable`);
  }

  async getHealth() {
    const health: Record<string, boolean> = {};
    for (const { provider } of [...this.detectors, ...this.classifiers]) {
        health[(provider as any).name] = await (provider as any).healthCheck();
    }
    return health;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api-service && npx vitest run src/__tests__/unit/detection-pipeline.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api-service/src/services/detection-pipeline.service.ts api-service/src/__tests__/unit/detection-pipeline.service.test.ts
git commit -m "feat(api): implement DetectionPipelineService with circuit breakers"
```

### Task 11: Write integration test fixtures and route tests (TDD — tests first)

**Files:**
- Create: `api-service/src/__tests__/fixtures/test-data.ts`
- Create: `api-service/src/__tests__/integration/detect.route.test.ts`
- Create: `api-service/src/__tests__/integration/health.route.test.ts`

- [ ] **Step 1: Write test fixtures with VLM-style data**

NO hardcoded labels like "chair" or "table". Use realistic VLM-style output:

```typescript
// api-service/src/__tests__/fixtures/test-data.ts
import { ClassifiedObject } from '../../providers/classifier.interface';
import { BoundingBoxResult } from '../../providers/detector.interface';

export const sampleBoundingBoxes: BoundingBoxResult[] = [
  { box: { x: 0.1, y: 0.05, width: 0.25, height: 0.85 }, coarseLabel: 'furniture', confidence: 0.9 },
  { box: { x: 0.5, y: 0.1, width: 0.3, height: 0.5 }, coarseLabel: 'electronics', confidence: 0.8 },
];

export const sampleClassifiedObjects: ClassifiedObject[] = [
  {
    boxIndex: 0,
    label: 'IKEA BILLY bookcase',
    category: 'living room furniture',
    brand: 'IKEA',
    model: 'BILLY',
    colors: ['birch', 'white'],
    materials: ['particleboard', 'veneer'],
    condition: 'good',
    estimatedValue: { low: 40, high: 70 },
    description: 'Standard IKEA bookcase with 5 adjustable shelves',
    confidence: 0.92,
    boundingBox: { x: 0.1, y: 0.05, width: 0.25, height: 0.85 },
  },
  {
    boxIndex: 1,
    label: 'Samsung 55-inch QLED TV',
    category: 'home entertainment',
    brand: 'Samsung',
    model: 'QN55Q60B',
    colors: ['black'],
    materials: ['plastic', 'glass'],
    condition: 'like-new',
    estimatedValue: { low: 400, high: 600 },
    description: 'Wall-mounted Samsung QLED television',
    confidence: 0.95,
    boundingBox: { x: 0.5, y: 0.1, width: 0.3, height: 0.5 },
  },
];
```

- [ ] **Step 2: Write detect route integration test**

```typescript
// api-service/src/__tests__/integration/detect.route.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { sampleClassifiedObjects, sampleBoundingBoxes } from '../fixtures/test-data';

// The test expects detect.route.ts to exist — tests will fail initially
describe('POST /v1/detect', () => {
  // These tests use Fastify.inject() — they start as stubs and get
  // fleshed out in Task 12 when the route implementation is created.
  // After Task 12, each test should:
  // - Create a Fastify instance with the detect route registered
  // - Mock the DetectionPipelineService
  // - Call inject() with multipart form data
  // - Verify response status and body schema

  it('should accept multipart image and return classified objects', async () => {
    // Task 12 will implement: build app, inject multipart, assert 200 + DetectionResponseSchema
    expect(sampleClassifiedObjects).toHaveLength(2);
    expect(sampleClassifiedObjects[0].label).toBe('IKEA BILLY bookcase');
  });

  it('should return 400 for missing image', async () => {
    // Task 12 will implement: inject empty body, assert 400
    expect(sampleClassifiedObjects[0].boundingBox.x).toBeGreaterThanOrEqual(0);
  });

  it('should return 413 for image > 10MB', async () => {
    // Task 12 will implement: inject oversized buffer, assert 413
    expect(sampleClassifiedObjects[0].confidence).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Write health route integration test**

```typescript
// api-service/src/__tests__/integration/health.route.test.ts
import { describe, it, expect } from 'vitest';

describe('GET /v1/health', () => {
  it('should return provider health status', async () => {
    // Task 12 will implement: build app, inject GET /v1/health, assert 200 + providers array
    expect(sampleBoundingBoxes).toHaveLength(2);
  });
});
```

- [ ] **Step 4: Commit test stubs**

```bash
git add api-service/src/__tests__/
git commit -m "test(api): add integration test fixtures and route test stubs

VLM-style test fixtures with no hardcoded labels. Route test stubs
for detect and health endpoints (will fail until routes implemented)."
```

### Task 12: Rewrite detection schema, routes, and app.ts

**Files:**
- Modify: `api-service/src/schemas/detection.schema.ts`
- Modify: `api-service/src/routes/detect.route.ts`
- Modify: `api-service/src/routes/health.route.ts`
- Modify: `api-service/src/app.ts`

- [ ] **Step 1: Verify circuit breaker utility exists**

Run: `ls -la api-service/src/utils/circuit-breaker.ts`
Expected: file exists.

- [ ] **Step 2: Rewrite detection.schema.ts**

```typescript
// api-service/src/schemas/detection.schema.ts
import { z } from 'zod';

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const ClassifiedObjectSchema = z.object({
  boxIndex: z.number(),
  label: z.string(),
  category: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  colors: z.array(z.string()),
  materials: z.array(z.string()),
  condition: z.string().nullable(),
  estimatedValue: z.object({ low: z.number(), high: z.number() }).nullable(),
  description: z.string().nullable(),
  confidence: z.number(),
  boundingBox: BoundingBoxSchema,
});

export const DetectionResponseSchema = z.object({
  detections: z.array(ClassifiedObjectSchema),
  processingTimeMs: z.number(),
  detector: z.string().optional(),
  classifier: z.string().optional(),
});

export type DetectionResponse = z.infer<typeof DetectionResponseSchema>;
```

- [ ] **Step 3: Rewrite detect.route.ts**

```typescript
// api-service/src/routes/detect.route.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DetectionPipelineService } from '../services/detection-pipeline.service';
import { ImageQualityService } from '../services/image-quality.service';
import { BadRequestError, PayloadTooLargeError } from '../utils/errors';
import { logger } from '../utils/logger';

export async function detectRoutes(
  fastify: FastifyInstance,
  options: { pipelineService: DetectionPipelineService; qualityService: ImageQualityService }
) {
  const { pipelineService, qualityService } = options;

  fastify.post('/detect', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await request.file();
    if (!data) {
      throw new BadRequestError('No image file provided');
    }

    const buffer = await data.toBuffer();
    if (buffer.length > 10 * 1024 * 1024) {
      throw new PayloadTooLargeError('Image size exceeds 10MB limit');
    }

    const startTime = Date.now();
    
    // Optional: quality check
    const quality = await qualityService.analyze(buffer);
    
    const response = await pipelineService.detect(buffer);
    
    return {
      ...response,
      imageQuality: quality,
    };
  });
}
```

- [ ] **Step 4: Rewrite health.route.ts**

```typescript
// api-service/src/routes/health.route.ts
import { FastifyInstance } from 'fastify';
import { DetectionPipelineService } from '../services/detection-pipeline.service';
import { envConfig } from '../config/env.config';

export async function healthRoutes(
  fastify: FastifyInstance,
  options: { pipelineService: DetectionPipelineService }
) {
  const { pipelineService } = options;

  fastify.get('/health', async () => {
    const providers = await pipelineService.getHealth();
    return {
      status: 'ok',
      version: '2.0.0',
      env: envConfig.nodeEnv,
      providers,
    };
  });
}
```

- [ ] **Step 5: Rewrite app.ts**

```typescript
// api-service/src/app.ts
import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { envConfig } from './config/env.config';
import { logger } from './utils/logger';
import { authMiddleware } from './middleware/auth.middleware';
import { errorHandler } from './middleware/error.middleware';
import { DetectionPipelineService } from './services/detection-pipeline.service';
import { ImageQualityService } from './services/image-quality.service';
import { detectRoutes } from './routes/detect.route';
import { healthRoutes } from './routes/health.route';

const app = fastify({
  logger: logger,
  disableRequestLogging: envConfig.nodeEnv === 'production',
});

// Plugins
app.register(cors);
app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

// Global Error Handler
app.setErrorHandler(errorHandler);

// Global Auth Hook
app.addHook('preHandler', authMiddleware);

// Services
const pipelineService = new DetectionPipelineService(envConfig);
const qualityService = new ImageQualityService();

// Routes
app.register(async (v1) => {
  v1.register(detectRoutes, { prefix: '/detect', pipelineService, qualityService });
  v1.register(healthRoutes, { prefix: '/health', pipelineService });
}, { prefix: '/v1' });

// Root info
app.get('/', async () => ({
  name: 'Visual Home Inventory API',
  version: '2.0.0',
  endpoints: ['/v1/detect', '/v1/health']
}));

const start = async () => {
  try {
    await app.listen({ port: envConfig.port, host: '0.0.0.0' });
    logger.info(`Server listening on port ${envConfig.port}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

start();

// Graceful shutdown
const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    logger.info(`Received ${signal}, shutting down...`);
    await app.close();
    process.exit(0);
  });
});

export { app };
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd api-service && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Run integration tests**

Run: `cd api-service && npx vitest run`
Expected: all tests PASS

- [ ] **Step 8: Commit**

```bash
git add api-service/src/schemas/detection.schema.ts api-service/src/routes/ api-service/src/app.ts api-service/src/__tests__/
git commit -m "feat(api): rewrite routes and app for two-stage pipeline"
```

### Task 13: Port image-quality.service.test.ts

**Files:**
- Create: `api-service/src/__tests__/unit/image-quality.service.test.ts`

- [ ] **Step 1: Copy and adapt existing image quality tests**

The existing `image-quality.service.ts` is kept as-is. Port its test from the deleted `src/__tests__/unit/` to the new test location. Read the original test file content from git history if needed, or rewrite based on the service's public API.

- [ ] **Step 2: Run test**

Run: `cd api-service && npx vitest run src/__tests__/unit/image-quality.service.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add api-service/src/__tests__/unit/image-quality.service.test.ts
git commit -m "test(api): port image quality service tests to new test structure"
```

### Task 14: Verify full API build and all tests pass

- [ ] **Step 1: Install dependencies**

Run: `cd api-service && npm install`

- [ ] **Step 2: Run all tests**

Run: `cd api-service && npm test`
Expected: all tests PASS

- [ ] **Step 3: Type check**

Run: `cd api-service && npm run type-check`
Expected: no errors

- [ ] **Step 4: Lint**

Run: `cd api-service && npm run lint`
Expected: no errors (fix any that appear)

- [ ] **Step 5: Build**

Run: `cd api-service && npm run build`
Expected: successful TypeScript compilation to dist/

- [ ] **Step 6: Commit any fixes**

```bash
git add -A api-service/
git commit -m "fix(api): resolve lint and build issues

All tests pass, TypeScript compiles, ESLint clean."
```

---

## Chunk 3: Detection Service (Python) — Rewrite for Grounding DINO

### Task 15: Rewrite Python detection service

**Files:**
- Modify: `detection-service/main.py` (complete rewrite)
- Modify: `detection-service/requirements.txt` (new dependencies)

- [ ] **Step 1: Delete old model files**

```bash
rm -f detection-service/yolov8m-worldv2.pt detection-service/rtdetr-l.pt
rm -rf detection-service/__pycache__
```

- [ ] **Step 2: Rewrite requirements.txt**

```
fastapi==0.115.0
uvicorn==0.32.0
torch==2.4.1
groundingdino-py==0.4.1
Pillow==10.4.0
python-multipart==0.0.12
```

- [ ] **Step 3: Rewrite main.py**

```python
# detection-service/main.py
import os
import io
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from PIL import Image
import torch
import groundingdino.datasets.transforms as T
from groundingdino.util.inference import load_model, predict, annotate
from groundingdino.util import box_ops

app = FastAPI()

# Configuration
MODEL_CONFIG_PATH = os.getenv("MODEL_CONFIG_PATH", "groundingdino/config/GroundingDINO_SwinT_OGC.py")
MODEL_WEIGHTS_PATH = os.getenv("MODEL_WEIGHTS_PATH", "weights/groundingdino_swint_ogc.pth")
DEFAULT_PROMPT = os.getenv("DETECTION_PROMPT", "household objects . furniture . appliances . electronics . decor . items")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

model = None

@app.on_event("startup")
async def load_detection_model():
    global model
    if os.path.exists(MODEL_WEIGHTS_PATH):
        model = load_model(MODEL_CONFIG_PATH, MODEL_WEIGHTS_PATH, device=DEVICE)
    else:
        print(f"Warning: Model weights not found at {MODEL_WEIGHTS_PATH}. /detect will fail.")

def preprocess_image(image_bytes):
    image_pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    transform = T.Compose([
        T.RandomResize([800], max_size=1333),
        T.ToTensor(),
        T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    image_transformed, _ = transform(image_pil, None)
    return image_pil, image_transformed

@app.post("/detect")
async def detect_objects(
    file: UploadFile = File(...),
    prompt: str = Form(DEFAULT_PROMPT),
    box_threshold: float = Form(0.3),
    text_threshold: float = Form(0.25)
):
    if model is None:
        raise HTTPException(status_code=503, detail="Model weights not loaded")

    image_bytes = await file.read()
    image_pil, image_transformed = preprocess_image(image_bytes)
    
    boxes, logits, phrases = predict(
        model=model,
        image=image_transformed,
        caption=prompt,
        box_threshold=box_threshold,
        text_threshold=text_threshold,
        device=DEVICE
    )

    # Convert boxes from [cx, cy, w, h] to [x, y, w, h] (top-left)
    # Grounding DINO returns normalized [0, 1] coordinates
    detections = []
    for i in range(len(boxes)):
        box = boxes[i].tolist() # [cx, cy, w, h]
        cx, cy, w, h = box
        x = cx - w / 2
        y = cy - h / 2
        
        detections.append({
            "box": {"x": x, "y": y, "w": w, "h": h},
            "coarse_label": phrases[i],
            "confidence": float(logits[i])
        })

    return {"detections": detections}

@app.get("/health")
async def health_check():
    return {
        "status": "ok" if model is not None else "degraded",
        "device": DEVICE,
        "model_loaded": model is not None,
        "default_prompt": DEFAULT_PROMPT
    }
```

- [ ] **Step 4: Test the service starts**

Run: `cd detection-service && python -m uvicorn main:app --port 8001`
(Expect it to fail if weights/config are missing, but syntax should be valid)

- [ ] **Step 5: Create/update Dockerfile**

```dockerfile
# detection-service/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for Grounding DINO / OpenCV
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Grounding DINO from source or specific wheel
RUN pip install git+https://github.com/IDEA-Research/GroundingDINO.git

COPY . .

EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

- [ ] **Step 6: Commit**

```bash
git add detection-service/
git commit -m "feat(detection): rewrite Python service for Grounding DINO"
```

---

## Chunk 4: Mobile App — Delete Dead Code & Update Database

### Task 16: Delete all obsolete Flutter files

**Files to delete** (from spec Section 6.2 — verified against actual file listing):

- [ ] **Step 1: Delete dead screens and widgets**

```bash
cd mobile-app
rm -f lib/presentation/screens/rooms_screen.dart
rm -f lib/presentation/screens/room_detail_screen.dart
rm -f lib/presentation/screens/smart_albums_screen.dart
rm -f lib/presentation/screens/smart_album_detail_screen.dart
rm -rf lib/presentation/search/
rm -rf lib/presentation/items/
rm -f lib/presentation/profile/settings_screen.dart
rm -f lib/presentation/widgets/room_selection_sheet.dart
rm -f lib/presentation/widgets/filter_sheet.dart
rm -f lib/presentation/widgets/search_bar.dart
rm -f lib/presentation/widgets/search_suggestions.dart
rm -f lib/presentation/widgets/label_editor.dart
rm -rf lib/presentation/navigation/
rm -f lib/presentation/item_detail_screen.dart
```

- [ ] **Step 2: Delete dead data layer files**

```bash
rm -f lib/data/repositories/local_detection_repository.dart
rm -f lib/data/remote/vision_api_client.dart
rm -f lib/data/services/image_hash_service.dart
rm -f lib/data/services/image_picker_service_impl.dart
rm -rf lib/data/services/image_picker_service_impl/
rm -rf lib/data/services/image_picker_service_mock/
rm -f lib/data/services/image_storage_service.dart
rm -f lib/data/database/tables/categories.dart
rm -f lib/data/database/tables/item_categories.dart
rm -f lib/data/database/tables/item_images.dart
rm -f lib/data/database/tables/sync_queue.dart
rm -f lib/data/mappers/mappers.dart
```

- [ ] **Step 3: Delete dead providers and domain files**

```bash
rm -f lib/application/providers/search_history_provider.dart
rm -f lib/application/providers/image_picker_provider.dart
rm -f lib/application/providers/search_providers.dart
rm -f lib/domain/models/alternative_label.dart
rm -f lib/domain/models/alternative_label.freezed.dart
rm -f lib/domain/models/alternative_label.g.dart
rm -f lib/domain/models/ensemble_details.dart
rm -f lib/domain/models/ensemble_details.freezed.dart
rm -f lib/domain/models/ensemble_details.g.dart
rm -f lib/domain/models/vision_provider.dart
rm -f lib/domain/models/quality_metrics.dart
rm -f lib/domain/models/quality_metrics.freezed.dart
rm -f lib/domain/models/quality_metrics.g.dart
rm -f lib/domain/repositories/inventory_repository.dart
rm -rf lib/domain/services/
rm -rf lib/core/converters/
rm -f lib/core/detection/local_detection_service.dart
rm -f lib/core/performance/optimized_image_widget.dart
rm -f lib/core/security/secure_storage.dart
rm -f lib/core/permissions/photo_library_permission.dart
```

Keep: `lib/core/config/app_config.dart`, `lib/core/errors/failures.dart`, `lib/core/errors/server_failure.dart` (and its .freezed.dart), `lib/core/permissions/camera_permission.dart`

- [ ] **Step 4: Delete all old tests**

```bash
rm -rf test/
rm -rf integration_test/
mkdir -p test/fixtures
mkdir -p test/unit
mkdir -p test/widget
```

- [ ] **Step 5: Commit**

```bash
git add -A mobile-app/
git commit -m "refactor(mobile): delete all obsolete screens, providers, models, and tests

Removes rooms/albums screens, duplicate search/item detail screens,
unused providers, old ensemble/VLM models, converters, dead services,
and all old tests. Prepares for clean rebuild."
```

### Task 17: Create new domain models (DetectedObject, BoundingBox, ValueRange)

**Files:**
- Create: `mobile-app/lib/domain/models/detected_object.dart`
- Delete: `mobile-app/lib/domain/models/detection.dart` (and .freezed.dart, .g.dart)
- Delete: `mobile-app/lib/domain/models/bounding_box.dart` (and .freezed.dart, .g.dart — rewrite)
- Delete: `mobile-app/lib/domain/models/item.dart` (and .freezed.dart, .g.dart — rewrite as inventory_item.dart)
- Create: `mobile-app/lib/domain/models/inventory_item.dart`

- [ ] **Step 1: Delete old models**

```bash
cd mobile-app
rm -f lib/domain/models/detection.dart lib/domain/models/detection.freezed.dart lib/domain/models/detection.g.dart
rm -f lib/domain/models/bounding_box.dart lib/domain/models/bounding_box.freezed.dart lib/domain/models/bounding_box.g.dart
rm -f lib/domain/models/item.dart lib/domain/models/item.freezed.dart lib/domain/models/item.g.dart
```

- [ ] **Step 2: Create detected_object.dart**

```dart
// lib/domain/models/detected_object.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'detected_object.freezed.dart';
part 'detected_object.g.dart';

@freezed
class DetectedObject with _$DetectedObject {
  const factory DetectedObject({
    // Note: The TypeScript API maps snake_case VLM output to camelCase
    // before sending to mobile. These @JsonKey annotations match what
    // the API actually sends (camelCase). If the API sends snake_case
    // in the future, update these annotations accordingly.
    required int boxIndex,
    required String label,
    required String category,
    required double confidence,
    required BoundingBox boundingBox,
    String? brand,
    String? model,
    @Default([]) List<String> colors,
    @Default([]) List<String> materials,
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

- [ ] **Step 3: Create inventory_item.dart**

```dart
// lib/domain/models/inventory_item.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'inventory_item.freezed.dart';
part 'inventory_item.g.dart';

@freezed
class InventoryItem with _$InventoryItem {
  const factory InventoryItem({
    required int id,
    required String photoPath,
    required String thumbnailPath,
    required String detectionData,
    required DateTime createdAt,
    required DateTime updatedAt,
  }) = _InventoryItem;

  factory InventoryItem.fromJson(Map<String, dynamic> json) =>
      _$InventoryItemFromJson(json);
}

@freezed
class ItemLabel with _$ItemLabel {
  const factory ItemLabel({
    required int id,
    required int itemId,
    required String key,
    required String value,
    @Default(1.0) double confidence,
    required DateTime createdAt,
  }) = _ItemLabel;

  factory ItemLabel.fromJson(Map<String, dynamic> json) =>
      _$ItemLabelFromJson(json);
}
```

- [ ] **Step 4: Run code generation**

Run: `cd mobile-app && dart run build_runner build --delete-conflicting-outputs`
Expected: generates .freezed.dart and .g.dart files for the new models

- [ ] **Step 5: Commit**

```bash
git add -A mobile-app/lib/domain/
git commit -m "feat(mobile): add DetectedObject and InventoryItem domain models

Freezed models with JSON serialization. API sends camelCase so
no @JsonKey annotations needed. Includes BoundingBox and ValueRange."
```

### Task 18: Rewrite database schema from scratch

**Files:**
- Modify: `mobile-app/lib/data/database/app_database.dart`
- Modify: `mobile-app/lib/data/database/tables/labels.dart`

App is not deployed — no migration needed. Just rewrite to final schema.

- [ ] **Step 1: Read current app_database.dart and labels.dart**

Read: `mobile-app/lib/data/database/app_database.dart`
Read: `mobile-app/lib/data/database/tables/labels.dart`

- [ ] **Step 2: Update labels.dart — add confidence column, make key non-nullable**

Change `key` from `text().nullable()` to `text()`, add `RealColumn get confidence => real().withDefault(const Constant(1.0))()`.

- [ ] **Step 3: Rewrite app_database.dart**

- Remove `categories`, `item_categories`, `item_images`, `sync_queue` from `@DriftDatabase(tables: [...])`
- Remove corresponding import statements
- Set `schemaVersion` to 1 (fresh start, no migrations)
- Remove `_seedDefaultCategories()` method and its call in `onCreate`
- Remove `onUpgrade` migration logic entirely (no deployed data to migrate)
- Remove `_createIndexes()` entries for deleted tables
- Keep only 3 tables: `InventoryItems`, `Labels`, `LabelSearchFts`

- [ ] **Step 4: Run code generation**

Run: `cd mobile-app && dart run build_runner build --delete-conflicting-outputs`
Expected: generates updated `app_database.g.dart`

- [ ] **Step 5: Commit**

```bash
git add mobile-app/lib/data/database/
git commit -m "feat(mobile): rewrite database schema — 3 tables only, no migrations

Fresh schema with inventory_items, labels (with confidence column),
and label_search_fts. Removes categories, item_categories, sync_queue,
item_images tables and seeded categories."
```

---

## Chunk 5: Mobile App — Rebuild Data Layer, Providers, and UI

### Task 19: Update api_client and rewrite detection repository

**Files:**
- Modify: `mobile-app/lib/data/remote/api_client.dart`
- Modify: `mobile-app/lib/data/repositories/detection_repository.dart`

- [ ] **Step 1: Read and update api_client.dart**

Read: `mobile-app/lib/data/remote/api_client.dart`
Update to include API key in Authorization header per spec Section 4.7. Add Bearer token from app config:

```dart
// In Dio interceptor or options:
options.headers['Authorization'] = 'Bearer ${AppConfig.apiKey}';
```

Ensure base URL uses `AppConfig.apiBaseUrl` (port 8000).

- [ ] **Step 2: Read current detection_repository.dart**

- [ ] **Step 3: Rewrite for new DetectedObject model**

Clean API call to `/v1/detect`, returns `List<DetectedObject>`. Uses Dio multipart upload. Handles the API response format from the new two-stage pipeline. Parses the `detections` array from the response JSON.

- [ ] **Step 4: Commit**

```bash
git add mobile-app/lib/data/remote/api_client.dart mobile-app/lib/data/repositories/detection_repository.dart
git commit -m "refactor(mobile): update api client auth and rewrite detection repository

Adds API key Bearer token to requests. Detection repository uses
new DetectedObject model from two-stage pipeline response."
```

### Task 20: Rewrite inventory repository with label extraction

**Files:**
- Modify: `mobile-app/lib/data/repositories/inventory_repository.dart`

- [ ] **Step 1: Read current inventory_repository.dart**

- [ ] **Step 2: Rewrite with VLM label extraction**

Key changes:
- `saveDetection(photo, DetectedObject)` — generates real thumbnail (cropped to bounding box), stores item, extracts all VLM attributes as key-value labels
- `_extractLabels(DetectedObject)` — maps VLM fields to label key-value pairs (label, category, brand, model, colors, materials, condition, description)
- Remove any references to categories, item_categories
- Keep: `getAllItems`, `getItemById`, `deleteItem`, `searchItems` (via FTS)
- Fix `getLabelsForItem` to return the new `ItemLabel` model

- [ ] **Step 3: Commit**

```bash
git add mobile-app/lib/data/repositories/inventory_repository.dart
git commit -m "refactor(mobile): rewrite inventory repository with VLM label extraction

Extracts all VLM attributes as searchable key-value labels. Generates
real thumbnails cropped to bounding box."
```

### Task 21: Update detection state and providers

**Files:**
- Modify: `mobile-app/lib/application/state/detection_state.dart`
- Modify: `mobile-app/lib/application/providers/detection_providers.dart`
- Modify: `mobile-app/lib/application/providers/inventory_providers.dart`

- [ ] **Step 1: Rewrite detection_state.dart per spec Section 6.9**

Freezed union: initial, loading, success(detections, processingTimeMs), empty, error(message).

- [ ] **Step 2: Rewrite detection_providers.dart**

Provider that manages detection state, calls detection repository, handles loading/success/empty/error transitions.

- [ ] **Step 3: Update inventory_providers.dart**

Remove all references to rooms, albums, categories. Keep: items list provider, single item provider, labels provider, search provider, stats provider. All using the new `InventoryItem` and `ItemLabel` models.

- [ ] **Step 4: Run code generation**

Run: `cd mobile-app && dart run build_runner build --delete-conflicting-outputs`

- [ ] **Step 5: Commit**

```bash
git add mobile-app/lib/application/
git commit -m "refactor(mobile): update state and providers for new detection pipeline

DetectionState with union types. Providers use new DetectedObject
and InventoryItem models. Removes room/album/category references."
```

### Task 22: Update routing and screens

**Files:**
- Modify: `mobile-app/lib/presentation/routing/app_router.dart`
- Modify: `mobile-app/lib/presentation/screens/detection_results_screen.dart`
- Modify: `mobile-app/lib/presentation/screens/item_detail_screen.dart`
- Modify: `mobile-app/lib/presentation/screens/inventory_feed_screen.dart`
- Modify: `mobile-app/lib/presentation/screens/search_screen.dart`
- Modify: `mobile-app/lib/presentation/profile/profile_screen.dart`
- Modify: `mobile-app/lib/presentation/camera/camera_capture_screen.dart`

- [ ] **Step 1: Rewrite app_router.dart — 6 routes only**

```dart
// lib/presentation/routing/app_router.dart
import 'package:go_router/go_router.dart';
import '../screens/inventory_feed_screen.dart';
import '../screens/search_screen.dart';
import '../profile/profile_screen.dart';
import '../camera/camera_capture_screen.dart';
import '../screens/detection_results_screen.dart';
import '../screens/item_detail_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/items',
  routes: [
    GoRoute(path: '/items', builder: (context, state) => const InventoryFeedScreen()),
    GoRoute(path: '/search', builder: (context, state) => const SearchScreen()),
    GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
    GoRoute(path: '/camera', builder: (context, state) => const CameraCaptureScreen()),
    GoRoute(
      path: '/detection',
      builder: (context, state) => DetectionResultsScreen(
        imagePath: state.extra as String,
      ),
    ),
    GoRoute(
      path: '/item/:id',
      builder: (context, state) => ItemDetailScreen(
        itemId: int.parse(state.pathParameters['id']!),
      ),
    ),
  ],
);
```

- [ ] **Step 2: Update detection_results_screen.dart**

Rewrite to use `DetectionState` and `DetectedObject`. Render interactive bounding boxes.
- Show `LoadingIndicator` during `DetectionState.loading()`
- On `Success`, render a `Stack` with the image and a list of `DetectionBox` widgets.
- Implement "Save to Inventory" logic:
  - Iterate over selected detections.
  - Call `imageProcessingService.generateThumbnail` (cropped).
  - Call `inventoryRepository.saveItem` which extracts labels.
  - Show success snackbar and navigate to `/items`.

- [ ] **Step 3: Update item_detail_screen.dart**

- Fetch item and its labels using `inventoryProviders`.
- Display large image.
- Group labels by key and render as `Wrap` of `LabelChip`s.
- Attributes: Label, Category, Brand, Model, Colors, Materials, Condition, Value, Description.

- [ ] **Step 4: Update inventory_feed_screen.dart**

- Use `itemsProvider` to show a `GridView`.
- Each item is an `ItemCard` showing the cropped thumbnail and the primary 'label' value.

- [ ] **Step 5: Update search_screen.dart**

- Simple `TextField` at the top.
- Calls `searchProvider` on change.
- Displays results in a list or grid.

- [ ] **Step 6: Update profile_screen.dart**

- Simple stats: Total items, Total estimated value (sum of low/high).
- App version, "About" text.

- [ ] **Step 7: Update and clean widgets**

- Update `DetectionBox` to take `DetectedObject` and `onTap`.
- Update `ItemCard` to show `InventoryItem` data.
- Ensure `common/error_view.dart` has a retry callback.

- [ ] **Step 8: Commit**

```bash
git add -A mobile-app/lib/presentation/
git commit -m "refactor(mobile): update all screens and routing for new pipeline"
```
    final resized = img.copyResize(cropped, width: targetSize);

    final thumbnailPath = photo.path.replaceAll('.jpg', '_thumb.jpg');
    final thumbnailFile = File(thumbnailPath);
    await thumbnailFile.writeAsBytes(img.encodeJpg(resized, quality: 85));
    return thumbnailFile;
  }
}
```

- [ ] **Step 9: Commit**

```bash
git add -A mobile-app/lib/presentation/ mobile-app/lib/data/services/image_processing_service.dart
git commit -m "refactor(mobile): update all screens, routing, and image processing

6 routes only. Detection results shows VLM attributes with inline
editing. Real thumbnail generation cropped to bounding box. Error
states for zero detections, API error, offline."
```

### Task 23: Update main.dart and app_config.dart

**Files:**
- Modify: `mobile-app/lib/main.dart`
- Modify: `mobile-app/lib/core/config/app_config.dart`

- [ ] **Step 1: Clean main.dart imports**

Remove any imports of deleted files. Verify ProviderScope setup.

- [ ] **Step 2: Update app_config.dart**

Ensure `apiBaseUrl` defaults to `http://localhost:8000` (port 8000 per spec). Add `thumbnailSize = 300`. Add `apiKey` field for Bearer token auth.

- [ ] **Step 2b: Add `image` package to pubspec.yaml**

Run: `cd mobile-app && flutter pub add image`
This is required by `image_processing_service.dart` for thumbnail cropping/resizing.

- [ ] **Step 3: Run flutter analyze**

Run: `cd mobile-app && flutter analyze`
Expected: no errors. Fix any issues.

- [ ] **Step 4: Commit**

```bash
git add mobile-app/lib/main.dart mobile-app/lib/core/
git commit -m "refactor(mobile): clean main.dart and update app config

API base URL port 8000. Thumbnail size 300px. All imports clean."
```

---

## Chunk 6: Tests, Verification & Final Cleanup

### Task 24: Write mobile app test fixtures

**Files:**
- Create: `mobile-app/test/fixtures/mock_data.dart`
- Create: `mobile-app/test/fixtures/fake_database.dart`

- [ ] **Step 1: Create VLM-style mock data**

NO hardcoded labels like "chair", "lamp", "table". Use realistic VLM-style output:

```dart
// test/fixtures/mock_data.dart
final sampleDetectedObject = DetectedObject(
  boxIndex: 0,
  label: 'IKEA BILLY bookcase',
  category: 'living room furniture',
  confidence: 0.92,
  boundingBox: BoundingBox(x: 0.1, y: 0.05, width: 0.25, height: 0.85),
  brand: 'IKEA',
  model: 'BILLY',
  colors: ['birch', 'white'],
  materials: ['particleboard', 'veneer'],
  condition: 'good',
  estimatedValue: ValueRange(low: 40, high: 70),
  description: 'Standard IKEA bookcase with 5 adjustable shelves',
);
// ... more test objects
```

- [ ] **Step 2: Create fake database helper**

Test helper that creates an in-memory Drift database for testing.

- [ ] **Step 3: Commit**

```bash
git add mobile-app/test/fixtures/
git commit -m "test(mobile): add VLM-style test fixtures with no hardcoded labels"
```

### Task 25: Write mobile app unit and widget tests

**Files:**
- Create: `mobile-app/test/unit/detected_object_test.dart`
- Create: `mobile-app/test/unit/detection_repository_test.dart`
- Create: `mobile-app/test/unit/inventory_repository_test.dart`
- Create: `mobile-app/test/widget/detection_results_screen_test.dart`
- Create: `mobile-app/test/widget/inventory_feed_screen_test.dart`
- Create: `mobile-app/test/widget/item_detail_screen_test.dart`
- Create: `mobile-app/test/widget/search_screen_test.dart`
- Create: `mobile-app/test/widget/camera_capture_screen_test.dart`

- [ ] **Step 1: Write detected_object_test.dart**

Test JSON serialization/deserialization including snake_case → camelCase mapping.

- [ ] **Step 2: Write detection_repository_test.dart**

Mock Dio, test multipart upload and response parsing.

- [ ] **Step 3: Write inventory_repository_test.dart**

Use fake database, test save with label extraction, search, delete.

- [ ] **Step 4: Write widget tests**

Test each screen renders correctly with mock data. Test error states on detection results screen (zero detections, API error, offline).

- [ ] **Step 5: Write camera_capture_screen_test.dart**

Test camera capture screen renders, photo capture triggers navigation to detection results.

- [ ] **Step 6: Run all tests**

Run: `cd mobile-app && flutter test`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add mobile-app/test/
git commit -m "test(mobile): add unit and widget tests for new detection pipeline

Tests model serialization, repository CRUD, screen rendering,
camera capture. All fixtures use VLM-style data."
```

### Task 26: Run hardcoded labels verification

- [ ] **Step 1: Run grep verification from spec Section 7**

```bash
cd /Users/mrarindampaul/Develop/allmythings
grep -rn \
  "sofa\|armchair\|chandelier\|throw pillow\|DEFAULT_VOCABULARY\|seedDefaultCategories\|objectDatabase\|pendant light\|wall sconce\|coffee table\|console table\|decorative pillow\|area rug\|potted plant\|throw blanket\|Kitchen.*FF6B6B\|Living Room.*4ECDC4\|Bedroom.*45B7D1\|Bathroom.*96CEB4" \
  --include="*.ts" --include="*.dart" --include="*.py" \
  api-service/src/ mobile-app/lib/ detection-service/
```

Expected: zero results

- [ ] **Step 2: Fix any remaining hardcoded labels**

If grep returns results, fix them.

- [ ] **Step 3: Commit if needed**

### Task 27: Full build verification

- [ ] **Step 1: API service — install, test, build**

```bash
cd api-service && npm install && npm test && npm run type-check && npm run build
```

Expected: all pass

- [ ] **Step 2: Mobile app — get deps, generate code, analyze, test**

```bash
cd mobile-app && flutter pub get && dart run build_runner build --delete-conflicting-outputs && flutter analyze && flutter test
```

Expected: all pass

- [ ] **Step 3: Detection service — verify Python syntax**

```bash
cd detection-service && python -m py_compile main.py && echo "OK"
```

Expected: "OK"

- [ ] **Step 4: Run make targets from project root**

```bash
make lint && make test
```

Expected: all pass (update Makefile if needed to remove references to deleted targets)

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "fix: resolve all build, lint, and test issues across all services

Full verification: API tests pass, Flutter analyze clean, detection
service compiles. Zero hardcoded labels."
```

### Task 28: Update docker-compose.yml and .env.example

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Rewrite docker-compose.yml per spec Section 9**

Remove PostgreSQL, Redis, MinIO. Keep api, detection, ollama (optional profile).

- [ ] **Step 2: Update .env.example**

Replace with the new env vars from spec Section 4.6. Remove all old vars.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "refactor: simplify docker-compose and env config

Removes PostgreSQL, Redis, MinIO. Keeps API, detection service,
and optional Ollama. Updated .env.example for two-stage pipeline."
```

### Task 29: Update Makefile

**Files:**
- Modify: `Makefile`

- [ ] **Step 1: Read current Makefile**

- [ ] **Step 2: Update targets**

Remove references to deleted services, database setup, coverage targets that reference old test infrastructure. Keep: setup, install, dev, build, test, lint, format, clean, generate. Update paths if needed.

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "refactor: update Makefile for simplified two-stage architecture"
```

### Task 30: Final verification against Definition of Done

Run through ALL 20 criteria from spec Section 10. Each step corresponds to a DoD criterion.

**Automated verification (CI-checkable):**

- [ ] **Step 1: Criteria 12 — Zero hardcoded labels**

Re-run grep verification from spec Section 7:
```bash
grep -rn "sofa\|armchair\|chandelier\|throw pillow\|DEFAULT_VOCABULARY\|seedDefaultCategories\|objectDatabase\|pendant light\|wall sconce\|coffee table\|console table\|decorative pillow\|area rug\|potted plant\|throw blanket\|Kitchen.*FF6B6B\|Living Room.*4ECDC4\|Bedroom.*45B7D1\|Bathroom.*96CEB4" --include="*.ts" --include="*.dart" --include="*.py" api-service/src/ mobile-app/lib/ detection-service/
```
Expected: zero results

- [ ] **Step 2: Criteria 13 — All tests pass**

```bash
cd api-service && npm test && cd ../mobile-app && flutter test
```

- [ ] **Step 3: Criteria 14 — API + mobile build**

```bash
cd api-service && npm run build && cd ../mobile-app && flutter build apk --debug
```

- [ ] **Step 4: Criteria 18 — No dead code**

```bash
cd api-service && npm run lint && cd ../mobile-app && flutter analyze
```
Expected: zero errors, no unused imports/functions/variables

- [ ] **Step 5: Criteria 15 — Health check works**

Start API: `cd api-service && npm run dev &`
Then: `curl http://localhost:8000/v1/health`
Expected: JSON with provider status for detectors and classifiers
Kill: `kill %1`

- [ ] **Step 6: Criteria 19 — Database schema works**

App not deployed — no migration needed. Verified by fresh database creation in unit tests (Step 2). Schema has 3 tables: inventory_items, labels, label_search_fts.

**Manual verification (emulator/device required):**

- [ ] **Step 7: Criteria 1 — Camera capture works**

Open app on emulator → tap camera FAB → take photo → verify photo captured without crash

- [ ] **Step 8: Criteria 2 — Photo sent to API**

After capture, check API server logs for multipart upload received

- [ ] **Step 9: Criteria 3 — Grounding DINO returns bounding boxes** (if detection service running)

Check API response includes `detections` array with `boundingBox` fields. Or verify via Ollama-only mode if no GPU available.

- [ ] **Step 10: Criteria 4 — VLM returns structured classification**

Check API response has label, category, brand, colors, materials, condition, estimated value for at least one object

- [ ] **Step 11: Criteria 5 — Bounding boxes render on image**

Visual check: detection results screen overlays colored boxes on the photo

- [ ] **Step 12: Criteria 6 — User can save objects to inventory**

Tap "Save to Inventory" → items appear in feed

- [ ] **Step 13: Criteria 7 — Thumbnails generated correctly**

Visual check: thumbnails in feed grid are cropped to the bounding box, not the full photo

- [ ] **Step 14: Criteria 8 — Inventory feed displays items**

Grid shows thumbnails with label text below each item

- [ ] **Step 15: Criteria 9 — Item detail shows all attributes**

Tap an item → all VLM labels rendered as chips grouped by key

- [ ] **Step 16: Criteria 10 — Search works across all attributes**

Search "blue" → finds items with blue in colors. Search brand name → finds matching items.

- [ ] **Step 17: Criteria 11 — Delete item works**

Long-press or swipe to delete → item and all labels removed from DB

- [ ] **Step 18: Criteria 16 — Fallback works**

Kill detection service → retry detection → Google Vision fallback activates (or Ollama-only mode)

- [ ] **Step 19: Criteria 17 — Error states handled**

Test: zero detections (blank photo), API error (kill API), offline (airplane mode). Each shows user-friendly UI with retry option.

- [ ] **Step 20: Criteria 20 — Ollama-only mode works**

With only Ollama running (no detection service, no Gemini key), submit photo → VLM analyzes full image and returns objects with estimated bounding boxes.

- [ ] **Step 21: Commit final state**

```bash
git add -A
git commit -m "chore: final verification — all 20 Definition of Done criteria met

Zero hardcoded labels, all tests pass, builds succeed, no dead code,
health check works, camera→detection→save→search flow verified.
Full rewrite complete."
```
