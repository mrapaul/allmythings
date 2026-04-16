# Working Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the entire app working end-to-end — camera to detection to inventory — with Florence-2 + Qwen, photo persistence, startup automation, and production-grade pipeline orchestration.

**Architecture:** Florence-2 replaces OWLv2+YOLO as the detector (MIT license, no hardcoded class list). Qwen 7B via Ollama enriches each detected crop with structured attributes. A PipelineExecutor orchestrates steps with retries, timeouts, and OTel tracing. A single `make start` boots all services with health gates. Photos persist to `~/allmythings-data/photos/`. The mobile app connects via mDNS and saves inventory to local Drift/SQLite.

**Tech Stack:** Florence-2 (HuggingFace Transformers), Qwen2.5-VL-7B (Ollama), FastAPI (Python), Fastify (Node.js/TypeScript), Flutter (Dart/Riverpod/Drift), OpenTelemetry, Pino, Bonjour/mDNS

**Spec:** `docs/superpowers/specs/2026-04-16-working-vertical-slice-design.md`

---

## File Structure

### New Files
```
detection-service/src/detection_service/routes/florence.py    — Florence-2 detection endpoint
api-service/src/services/pipeline-executor.ts                 — Generic step runner with retries/timeouts/tracing
api-service/src/services/florence-pipeline.service.ts          — Florence detect -> Qwen enrich orchestration
api-service/src/services/photo-storage.service.ts              — Save/serve photos from ~/allmythings-data/
api-service/src/providers/florence.detector.ts                 — HTTP client for Florence detection-service endpoint
scripts/start-all.sh                                           — Process manager: start/stop/status all services
detection-service/tests/unit/test_florence_route.py            — Florence route tests
api-service/src/__tests__/unit/pipeline-executor.test.ts       — PipelineExecutor tests
api-service/src/__tests__/unit/florence-pipeline.test.ts       — Florence pipeline tests
api-service/src/__tests__/unit/photo-storage.test.ts           — Photo storage tests
```

### Modified Files
```
detection-service/src/detection_service/main.py:12,38    — Register florence router
api-service/src/app.ts:69-116                              — Replace createDefaultPipeline with Florence pipeline
api-service/src/routes/detect.route.ts:30-86               — Simplify to synchronous JSON (remove SSE)
api-service/src/config/env.config.ts:28-53                 — Add FLORENCE_URL, PHOTO_DIR
api-service/package.json                                   — Add @fastify/static
mobile-app/lib/data/repositories/detection_repository.dart — Update response parsing for new format
mobile-app/lib/data/database/tables/inventory_items.dart   — Add server_photo_url column
mobile-app/lib/data/database/app_database.dart             — Bump schema version, add migration
mobile-app/lib/data/repositories/inventory_repository.dart — Wire photo URL into save flow
Makefile:40-46                                             — Add start/stop/status/logs targets
```

---

## Task 1: Florence-2 Detection Endpoint (detection-service)

**Files:**
- Create: `detection-service/src/detection_service/routes/florence.py`
- Modify: `detection-service/src/detection_service/main.py:12,38`
- Test: `detection-service/tests/unit/test_florence_route.py`

- [ ] **Step 1: Write the failing test**

Create `detection-service/tests/unit/test_florence_route.py`:

```python
import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image


@pytest.fixture
def test_image_bytes() -> bytes:
    """Create a simple test image in memory."""
    img = Image.new("RGB", (640, 480), color=(128, 128, 128))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def client():
    from detection_service.main import app
    return TestClient(app)


def test_florence_returns_regions(client, test_image_bytes):
    """Florence endpoint returns list of regions with captions and bboxes."""
    response = client.post(
        "/detect/florence",
        files={"file": ("test.jpg", test_image_bytes, "image/jpeg")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "regions" in data
    assert "image_width" in data
    assert "image_height" in data
    assert isinstance(data["regions"], list)
    # Each region has caption + normalized bbox
    for region in data["regions"]:
        assert "caption" in region
        assert "x" in region
        assert "y" in region
        assert "width" in region
        assert "height" in region
        assert 0.0 <= region["x"] <= 1.0
        assert 0.0 <= region["y"] <= 1.0


def test_florence_rejects_non_image(client):
    """Florence endpoint rejects non-image files."""
    response = client.post(
        "/detect/florence",
        files={"file": ("test.txt", b"not an image", "text/plain")},
    )
    assert response.status_code == 415
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd detection-service && ./venv/bin/python -m pytest tests/unit/test_florence_route.py -v`
Expected: FAIL — `"/detect/florence"` returns 404 (route not registered)

- [ ] **Step 3: Implement Florence-2 route**

Create `detection-service/src/detection_service/routes/florence.py`:

```python
import io
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image
import torch
from transformers import AutoProcessor, AutoModelForCausalLM

router = APIRouter()

_processor = None
_model = None


def _load():
    global _processor, _model
    if _processor is None:
        _processor = AutoProcessor.from_pretrained(
            "microsoft/Florence-2-large", trust_remote_code=True
        )
    if _model is None:
        _model = AutoModelForCausalLM.from_pretrained(
            "microsoft/Florence-2-large",
            torch_dtype=torch.float16,
            trust_remote_code=True,
        )
        _model = _model.eval()
        if torch.backends.mps.is_available():
            _model = _model.to("mps")
    return _processor, _model


@router.post("/detect/florence")
async def detect_florence(
    file: Annotated[UploadFile, File(description="JPEG or PNG image")],
):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(415, f"unsupported content type: {file.content_type}")

    processor, model = _load()
    image_bytes = await file.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    W, H = image.size

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    task_prompt = "<DENSE_REGION_CAPTION>"
    inputs = processor(text=task_prompt, images=image, return_tensors="pt")
    inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}

    with torch.inference_mode():
        generated_ids = model.generate(
            **inputs,
            max_new_tokens=1024,
            num_beams=3,
            do_sample=False,
        )

    generated_text = processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
    parsed = processor.post_process_generation(
        generated_text, task=task_prompt, image_size=(W, H)
    )

    raw_regions = parsed.get(task_prompt, {})
    bboxes = raw_regions.get("bboxes", [])
    labels = raw_regions.get("labels", [])

    regions = []
    for bbox, label in zip(bboxes, labels):
        x1, y1, x2, y2 = bbox
        regions.append({
            "caption": label.strip(),
            "x": max(0.0, min(1.0, x1 / W)),
            "y": max(0.0, min(1.0, y1 / H)),
            "width": max(0.0, min(1.0, (x2 - x1) / W)),
            "height": max(0.0, min(1.0, (y2 - y1) / H)),
        })

    return {"regions": regions, "image_width": W, "image_height": H}
```

- [ ] **Step 4: Register the route in main.py**

In `detection-service/src/detection_service/main.py`, add after line 12:
```python
from detection_service.routes.florence import router as florence_router
```

And after line 38 (the owlv2_router include):
```python
app.include_router(florence_router, tags=["detect"])
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd detection-service && ./venv/bin/python -m pytest tests/unit/test_florence_route.py -v`
Expected: PASS (model will download on first run, ~1.5GB)

Note: If MPS is unavailable in CI, the model falls back to CPU automatically. The test uses a synthetic image so Florence-2 may return 0 regions — that's fine for the contract test. The accuracy harness (Task 10) validates real accuracy.

- [ ] **Step 6: Commit**

```bash
git add detection-service/src/detection_service/routes/florence.py \
       detection-service/src/detection_service/main.py \
       detection-service/tests/unit/test_florence_route.py
git commit -m "feat(detect): Florence-2 dense region caption endpoint"
```

---

## Task 2: Florence Detector Client (api-service)

**Files:**
- Create: `api-service/src/providers/florence.detector.ts`
- Test: `api-service/src/__tests__/unit/florence-detector.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api-service/src/__tests__/unit/florence-detector.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlorenceDetector } from '../../providers/florence.detector';

describe('FlorenceDetector', () => {
  let detector: FlorenceDetector;

  beforeEach(() => {
    detector = new FlorenceDetector('http://localhost:14001');
  });

  it('maps regions to BoundingBoxResult[]', async () => {
    const mockResponse = {
      regions: [
        { caption: 'wooden desk lamp', x: 0.1, y: 0.2, width: 0.15, height: 0.25 },
        { caption: 'blue sofa', x: 0.5, y: 0.3, width: 0.4, height: 0.5 },
      ],
      image_width: 1920,
      image_height: 1080,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const image = Buffer.from('fake-image');
    const results = await detector.detect(image);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      box: { x: 0.1, y: 0.2, width: 0.15, height: 0.25 },
      coarseLabel: 'wooden desk lamp',
      confidence: 1.0,
    });
    expect(results[1].coarseLabel).toBe('blue sofa');
  });

  it('returns empty array on zero regions', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ regions: [], image_width: 640, image_height: 480 }),
    } as Response);

    const results = await detector.detect(Buffer.from('fake'));
    expect(results).toEqual([]);
  });

  it('throws on non-200 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    await expect(detector.detect(Buffer.from('fake'))).rejects.toThrow('500');
  });

  it('healthCheck returns true when service is up', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ service: 'detection-service' }),
    } as Response);

    expect(await detector.healthCheck()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api-service && npm test -- --run src/__tests__/unit/florence-detector.test.ts`
Expected: FAIL — module `../../providers/florence.detector` not found

- [ ] **Step 3: Implement Florence detector client**

Create `api-service/src/providers/florence.detector.ts`:

```typescript
import { BoundingBoxResult, ObjectDetector } from './detector.interface';
import { injectTraceHeaders } from '../telemetry/trace-context';
import { logger } from '../utils/logger';

interface FlorenceRegion {
  caption: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FlorenceResponse {
  regions: FlorenceRegion[];
  image_width: number;
  image_height: number;
}

export class FlorenceDetector implements ObjectDetector {
  readonly name = 'florence-2';

  constructor(private readonly baseUrl: string) {}

  async detect(image: Buffer): Promise<BoundingBoxResult[]> {
    const headers: Record<string, string> = {};
    injectTraceHeaders(headers);

    const formData = new FormData();
    formData.append('file', new Blob([image], { type: 'image/jpeg' }), 'image.jpg');

    const response = await fetch(`${this.baseUrl}/detect/florence`, {
      method: 'POST',
      headers,
      body: formData,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Florence detector returned ${response.status}`);
    }

    const data: FlorenceResponse = await response.json();
    logger.info({ count: data.regions.length }, 'Florence-2: regions detected');

    return data.regions.map((r) => ({
      box: { x: r.x, y: r.y, width: r.width, height: r.height },
      coarseLabel: r.caption,
      confidence: 1.0,
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/`, {
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

Run: `cd api-service && npm test -- --run src/__tests__/unit/florence-detector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api-service/src/providers/florence.detector.ts \
       api-service/src/__tests__/unit/florence-detector.test.ts
git commit -m "feat(api): Florence-2 detector HTTP client"
```

---

## Task 3: PipelineExecutor — Generic Step Runner with Retries/Timeouts/Tracing

**Files:**
- Create: `api-service/src/services/pipeline-executor.ts`
- Test: `api-service/src/__tests__/unit/pipeline-executor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api-service/src/__tests__/unit/pipeline-executor.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { PipelineExecutor, PipelineStep } from '../../services/pipeline-executor';

describe('PipelineExecutor', () => {
  it('runs steps in sequence and returns final context', async () => {
    const steps: PipelineStep[] = [
      { name: 'step-a', fn: async (ctx) => ({ ...ctx, a: 1 }), retry: 0, timeoutMs: 5000 },
      { name: 'step-b', fn: async (ctx) => ({ ...ctx, b: 2 }), retry: 0, timeoutMs: 5000 },
    ];

    const result = await PipelineExecutor.run('test-pipeline', steps, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context).toEqual({ a: 1, b: 2 });
      expect(result.errors).toEqual([]);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].name).toBe('step-a');
      expect(result.steps[0].ok).toBe(true);
    }
  });

  it('retries a failing step up to retry count', async () => {
    let attempts = 0;
    const steps: PipelineStep[] = [
      {
        name: 'flaky',
        fn: async (ctx) => {
          attempts++;
          if (attempts < 3) throw new Error('transient');
          return { ...ctx, done: true };
        },
        retry: 2,
        timeoutMs: 5000,
      },
    ];

    const result = await PipelineExecutor.run('retry-test', steps, {});
    expect(result.ok).toBe(true);
    expect(attempts).toBe(3);
  });

  it('continues on step failure when onStepError is continue', async () => {
    const steps: PipelineStep[] = [
      { name: 'fail-step', fn: async () => { throw new Error('boom'); }, retry: 0, timeoutMs: 5000 },
      { name: 'ok-step', fn: async (ctx) => ({ ...ctx, ok: true }), retry: 0, timeoutMs: 5000 },
    ];

    const result = await PipelineExecutor.run('continue-test', steps, {}, 'continue');
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].step).toBe('fail-step');
    if (result.ok) {
      expect(result.context).toEqual({ ok: true });
    }
  });

  it('aborts on step failure when onStepError is abort', async () => {
    const steps: PipelineStep[] = [
      { name: 'fail-step', fn: async () => { throw new Error('boom'); }, retry: 0, timeoutMs: 5000 },
      { name: 'never-runs', fn: async (ctx) => ({ ...ctx, ran: true }), retry: 0, timeoutMs: 5000 },
    ];

    const result = await PipelineExecutor.run('abort-test', steps, {}, 'abort');
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('times out a slow step', async () => {
    const steps: PipelineStep[] = [
      {
        name: 'slow',
        fn: async (ctx) => {
          await new Promise((r) => setTimeout(r, 5000));
          return ctx;
        },
        retry: 0,
        timeoutMs: 50,
      },
    ];

    const result = await PipelineExecutor.run('timeout-test', steps, {}, 'abort');
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('timeout');
  });

  it('records durationMs per step', async () => {
    const steps: PipelineStep[] = [
      {
        name: 'delay',
        fn: async (ctx) => {
          await new Promise((r) => setTimeout(r, 50));
          return { ...ctx, done: true };
        },
        retry: 0,
        timeoutMs: 5000,
      },
    ];

    const result = await PipelineExecutor.run('timing-test', steps, {});
    expect(result.steps[0].durationMs).toBeGreaterThanOrEqual(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api-service && npm test -- --run src/__tests__/unit/pipeline-executor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PipelineExecutor**

Create `api-service/src/services/pipeline-executor.ts`:

```typescript
import { withSpan } from '../telemetry/pipeline-tracer';
import { classifyError, StepError, isOk } from '../telemetry/step-result';
import { logger } from '../utils/logger';

export interface PipelineStep {
  name: string;
  fn: (context: Record<string, unknown>) => Promise<Record<string, unknown>>;
  retry: number;
  timeoutMs: number;
}

interface StepReport {
  name: string;
  ok: boolean;
  durationMs: number;
  error?: { step: string; code: string; message: string; retryable: boolean };
}

export interface PipelineRunResult {
  ok: boolean;
  context: Record<string, unknown>;
  errors: Array<{ step: string; code: string; message: string; retryable: boolean }>;
  steps: StepReport[];
  totalMs: number;
}

export class PipelineExecutor {
  static async run(
    pipelineName: string,
    steps: PipelineStep[],
    initialContext: Record<string, unknown>,
    onStepError: 'continue' | 'abort' = 'abort',
  ): Promise<PipelineRunResult> {
    const pipelineStart = Date.now();
    let context = { ...initialContext };
    const errors: PipelineRunResult['errors'] = [];
    const stepReports: StepReport[] = [];

    for (const step of steps) {
      const stepStart = Date.now();
      let succeeded = false;
      let lastError: StepError | undefined;

      for (let attempt = 0; attempt <= step.retry; attempt++) {
        if (attempt > 0) {
          const backoffMs = attempt * 1000;
          logger.info({ step: step.name, attempt, backoffMs }, 'Pipeline step retry');
          await new Promise((r) => setTimeout(r, backoffMs));
        }

        const result = await withSpan(
          `pipeline.${pipelineName}.${step.name}`,
          { 'pipeline.step': step.name, 'pipeline.attempt': attempt },
          async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), step.timeoutMs);
            try {
              const stepResult = await Promise.race([
                step.fn(context),
                new Promise<never>((_, reject) => {
                  controller.signal.addEventListener('abort', () =>
                    reject(Object.assign(new Error(`Step ${step.name} timed out after ${step.timeoutMs}ms`), { name: 'TimeoutError' }))
                  );
                }),
              ]);
              return stepResult;
            } finally {
              clearTimeout(timer);
            }
          },
        );

        if (isOk(result)) {
          context = result.value as Record<string, unknown>;
          succeeded = true;
          break;
        } else {
          lastError = result.error;
          if (!result.error.retryable) break;
        }
      }

      const durationMs = Date.now() - stepStart;

      if (succeeded) {
        stepReports.push({ name: step.name, ok: true, durationMs });
      } else {
        const classified = lastError ?? classifyError(new Error('Unknown step failure'));
        const errorEntry = {
          step: step.name,
          code: classified.code,
          message: classified.message,
          retryable: classified.retryable,
        };
        errors.push(errorEntry);
        stepReports.push({ name: step.name, ok: false, durationMs, error: errorEntry });

        if (onStepError === 'abort') {
          return { ok: false, context, errors, steps: stepReports, totalMs: Date.now() - pipelineStart };
        }
      }
    }

    return {
      ok: errors.length === 0,
      context,
      errors,
      steps: stepReports,
      totalMs: Date.now() - pipelineStart,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api-service && npm test -- --run src/__tests__/unit/pipeline-executor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api-service/src/services/pipeline-executor.ts \
       api-service/src/__tests__/unit/pipeline-executor.test.ts
git commit -m "feat(api): PipelineExecutor with retries, timeouts, tracing"
```

---

## Task 4: Photo Storage Service

**Files:**
- Create: `api-service/src/services/photo-storage.service.ts`
- Test: `api-service/src/__tests__/unit/photo-storage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api-service/src/__tests__/unit/photo-storage.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PhotoStorageService } from '../../services/photo-storage.service';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('PhotoStorageService', () => {
  let service: PhotoStorageService;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-test-'));
    service = new PhotoStorageService(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('saves a photo and returns id + paths', async () => {
    const image = Buffer.from('fake-jpeg-data');
    const result = await service.save(image);

    expect(result.photoId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.photoPath).toContain(result.photoId);
    expect(result.thumbnailPath).toContain(result.photoId);
    expect(fs.existsSync(result.photoPath)).toBe(true);
  });

  it('creates photos directory if it does not exist', async () => {
    const newDir = path.join(testDir, 'nested', 'photos');
    const svc = new PhotoStorageService(newDir);
    const result = await svc.save(Buffer.from('data'));
    expect(fs.existsSync(result.photoPath)).toBe(true);
  });

  it('generates a thumbnail', async () => {
    const sharp = (await import('sharp')).default;
    const image = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: { r: 128, g: 128, b: 128 } },
    }).jpeg().toBuffer();

    const result = await service.save(image);
    expect(fs.existsSync(result.thumbnailPath)).toBe(true);

    const thumbMeta = await sharp(result.thumbnailPath).metadata();
    expect(thumbMeta.width).toBeLessThanOrEqual(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api-service && npm test -- --run src/__tests__/unit/photo-storage.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PhotoStorageService**

Create `api-service/src/services/photo-storage.service.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { logger } from '../utils/logger';

const THUMB_WIDTH = 400;

export interface SavedPhoto {
  photoId: string;
  photoPath: string;
  thumbnailPath: string;
}

export class PhotoStorageService {
  private readonly photosDir: string;

  constructor(baseDir: string) {
    this.photosDir = path.join(baseDir, 'photos');
  }

  async save(imageBuffer: Buffer): Promise<SavedPhoto> {
    fs.mkdirSync(this.photosDir, { recursive: true });

    const photoId = randomUUID();
    const photoPath = path.join(this.photosDir, `${photoId}.jpg`);
    const thumbnailPath = path.join(this.photosDir, `${photoId}_thumb.jpg`);

    fs.writeFileSync(photoPath, imageBuffer);
    logger.info({ photoId, size: imageBuffer.length, path: photoPath }, 'Photo saved');

    try {
      await sharp(imageBuffer)
        .resize(THUMB_WIDTH, undefined, { fit: 'inside' })
        .jpeg({ quality: 85 })
        .toFile(thumbnailPath);
    } catch (err) {
      logger.warn({ photoId, error: (err as Error).message }, 'Thumbnail generation failed');
      fs.copyFileSync(photoPath, thumbnailPath);
    }

    return { photoId, photoPath, thumbnailPath };
  }

  getPhotoPath(photoId: string): string {
    return path.join(this.photosDir, `${photoId}.jpg`);
  }

  getThumbnailPath(photoId: string): string {
    return path.join(this.photosDir, `${photoId}_thumb.jpg`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api-service && npm test -- --run src/__tests__/unit/photo-storage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api-service/src/services/photo-storage.service.ts \
       api-service/src/__tests__/unit/photo-storage.test.ts
git commit -m "feat(api): PhotoStorageService — save photos + generate thumbnails"
```

---

## Task 5: Florence Pipeline Service — Orchestrate Detect + Enrich

**Files:**
- Create: `api-service/src/services/florence-pipeline.service.ts`
- Test: `api-service/src/__tests__/unit/florence-pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api-service/src/__tests__/unit/florence-pipeline.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { FlorencePipelineService, DetectResult } from '../../services/florence-pipeline.service';
import { FlorenceDetector } from '../../providers/florence.detector';
import { OllamaClassifier } from '../../providers/ollama.classifier';
import { PhotoStorageService } from '../../services/photo-storage.service';

vi.mock('../../providers/florence.detector');
vi.mock('../../providers/ollama.classifier');
vi.mock('../../services/photo-storage.service');

describe('FlorencePipelineService', () => {
  it('runs save -> detect -> enrich -> assemble pipeline', async () => {
    const mockStorage = {
      save: vi.fn().mockResolvedValue({
        photoId: 'test-id',
        photoPath: '/tmp/test-id.jpg',
        thumbnailPath: '/tmp/test-id_thumb.jpg',
      }),
    } as unknown as PhotoStorageService;

    const mockDetector = {
      detect: vi.fn().mockResolvedValue([
        { box: { x: 0.1, y: 0.2, width: 0.15, height: 0.25 }, coarseLabel: 'desk lamp', confidence: 1.0 },
      ]),
    } as unknown as FlorenceDetector;

    const mockClassifier = {
      name: 'ollama',
      classify: vi.fn().mockResolvedValue([
        {
          boxIndex: 0,
          label: 'Brass desk lamp',
          category: 'Lighting',
          brand: null,
          model: null,
          colors: ['brass'],
          materials: ['metal'],
          condition: 'good',
          estimatedValue: { low: 40, high: 60 },
          description: 'Modern brass desk lamp',
          confidence: 0.87,
          boundingBox: { x: 0.1, y: 0.2, width: 0.15, height: 0.25 },
        },
      ]),
    } as unknown as OllamaClassifier;

    const pipeline = new FlorencePipelineService(mockStorage, mockDetector, mockClassifier);
    const result: DetectResult = await pipeline.detect(Buffer.from('fake'));

    expect(result.photoId).toBe('test-id');
    expect(result.photoUrl).toBe('/photos/test-id.jpg');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].label).toBe('Brass desk lamp');
    expect(result.items[0].attributes.category).toBe('Lighting');
    expect(result.errors).toEqual([]);
    expect(result.processingMs).toBeGreaterThanOrEqual(0);
    expect(result.traceId).toBeDefined();
  });

  it('returns Florence labels when Qwen enrichment fails', async () => {
    const mockStorage = {
      save: vi.fn().mockResolvedValue({
        photoId: 'id', photoPath: '/p', thumbnailPath: '/t',
      }),
    } as unknown as PhotoStorageService;

    const mockDetector = {
      detect: vi.fn().mockResolvedValue([
        { box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, coarseLabel: 'sofa', confidence: 1.0 },
      ]),
    } as unknown as FlorenceDetector;

    const mockClassifier = {
      name: 'ollama',
      classify: vi.fn().mockRejectedValue(new Error('Ollama timeout')),
    } as unknown as OllamaClassifier;

    const pipeline = new FlorencePipelineService(mockStorage, mockDetector, mockClassifier);
    const result = await pipeline.detect(Buffer.from('fake'));

    expect(result.items).toHaveLength(1);
    expect(result.items[0].label).toBe('sofa');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].step).toBe('qwen-enrich');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api-service && npm test -- --run src/__tests__/unit/florence-pipeline.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement FlorencePipelineService**

Create `api-service/src/services/florence-pipeline.service.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { FlorenceDetector } from '../providers/florence.detector';
import { ObjectClassifier, ClassifiedObject } from '../providers/classifier.interface';
import { BoundingBoxResult } from '../providers/detector.interface';
import { PhotoStorageService } from './photo-storage.service';
import { PipelineExecutor, PipelineStep } from './pipeline-executor';
import { logger } from '../utils/logger';
import { trace } from '@opentelemetry/api';

const MAX_ENRICHMENT_ITEMS = 25;

export interface DetectResultItem {
  id: string;
  label: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  attributes: {
    name: string;
    category: string;
    color: string | null;
    material: string | null;
    condition: string | null;
    estimated_value: string | null;
    description: string;
    search_tags: string[];
  };
}

export interface DetectResult {
  photoId: string;
  photoUrl: string;
  itemCount: number;
  items: DetectResultItem[];
  errors: Array<{ step: string; code: string; message: string; retryable: boolean }>;
  traceId: string;
  processingMs: number;
}

export class FlorencePipelineService {
  constructor(
    private readonly storage: PhotoStorageService,
    private readonly detector: FlorenceDetector,
    private readonly classifier: ObjectClassifier,
  ) {}

  async detect(imageBuffer: Buffer): Promise<DetectResult> {
    const traceId = trace.getActiveSpan()?.spanContext().traceId ?? randomUUID().replace(/-/g, '');

    const steps: PipelineStep[] = [
      {
        name: 'save-photo',
        fn: async (ctx) => {
          const saved = await this.storage.save(imageBuffer);
          return { ...ctx, photoId: saved.photoId, photoPath: saved.photoPath };
        },
        retry: 0,
        timeoutMs: 5_000,
      },
      {
        name: 'florence-detect',
        fn: async (ctx) => {
          const boxes = await this.detector.detect(imageBuffer);
          return { ...ctx, boxes };
        },
        retry: 2,
        timeoutMs: 30_000,
      },
      {
        name: 'qwen-enrich',
        fn: async (ctx) => {
          const boxes = ctx.boxes as BoundingBoxResult[];
          const toEnrich = boxes.slice(0, MAX_ENRICHMENT_ITEMS);
          const classified = await this.classifier.classify(imageBuffer, toEnrich);
          return { ...ctx, classified, enrichedCount: toEnrich.length };
        },
        retry: 1,
        timeoutMs: 60_000,
      },
    ];

    const result = await PipelineExecutor.run('detect-inventory', steps, {}, 'continue');
    const boxes = (result.context.boxes as BoundingBoxResult[] | undefined) ?? [];
    const classified = (result.context.classified as ClassifiedObject[] | undefined) ?? [];
    const photoId = (result.context.photoId as string | undefined) ?? 'unknown';

    const items: DetectResultItem[] = boxes.map((box, i) => {
      const enriched = classified.find((c) => c.boxIndex === i);
      if (enriched) {
        return this.buildEnrichedItem(enriched, box);
      }
      return this.buildBasicItem(box);
    });

    logger.info({
      photoId,
      totalDetected: boxes.length,
      enriched: classified.length,
      errors: result.errors.length,
      totalMs: result.totalMs,
      traceId,
    }, 'Pipeline complete');

    return {
      photoId,
      photoUrl: `/photos/${photoId}.jpg`,
      itemCount: items.length,
      items,
      errors: result.errors,
      traceId,
      processingMs: result.totalMs,
    };
  }

  private buildEnrichedItem(classified: ClassifiedObject, box: BoundingBoxResult): DetectResultItem {
    const tags = [
      classified.label,
      classified.category,
      ...(classified.colors ?? []),
      ...(classified.materials ?? []),
    ].filter(Boolean).map((t) => t.toLowerCase());

    return {
      id: randomUUID(),
      label: classified.label,
      confidence: classified.confidence,
      bbox: box.box,
      attributes: {
        name: classified.label,
        category: classified.category ?? 'household item',
        color: classified.colors?.[0] ?? null,
        material: classified.materials?.[0] ?? null,
        condition: classified.condition ?? null,
        estimated_value: classified.estimatedValue
          ? `${classified.estimatedValue.low}-${classified.estimatedValue.high}`
          : null,
        description: classified.description ?? `${classified.label} found in the room`,
        search_tags: [...new Set(tags)],
      },
    };
  }

  private buildBasicItem(box: BoundingBoxResult): DetectResultItem {
    return {
      id: randomUUID(),
      label: box.coarseLabel || 'Unknown item',
      confidence: box.confidence,
      bbox: box.box,
      attributes: {
        name: box.coarseLabel || 'Unknown item',
        category: 'household item',
        color: null,
        material: null,
        condition: null,
        estimated_value: null,
        description: `${box.coarseLabel || 'Item'} detected in the room`,
        search_tags: [box.coarseLabel?.toLowerCase() ?? 'item'],
      },
    };
  }

  async healthCheck(): Promise<Record<string, boolean>> {
    const florence = await this.detector.healthCheck();
    const classifier = await this.classifier.healthCheck();
    return { florence, [this.classifier.name]: classifier };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api-service && npm test -- --run src/__tests__/unit/florence-pipeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api-service/src/services/florence-pipeline.service.ts \
       api-service/src/__tests__/unit/florence-pipeline.test.ts
git commit -m "feat(api): FlorencePipelineService — detect + enrich orchestration"
```

---

## Task 6: Wire Florence Pipeline into App + Simplify /v1/detect Route

**Files:**
- Modify: `api-service/src/config/env.config.ts:28-53`
- Modify: `api-service/src/app.ts:69-116`
- Modify: `api-service/src/routes/detect.route.ts`
- Modify: `api-service/src/routes/health.route.ts`
- Modify: `api-service/package.json`

- [ ] **Step 1: Add FLORENCE_URL and PHOTO_DIR to env config**

In `api-service/src/config/env.config.ts`, add to the `EnvConfig` interface and `envConfig` object:

```typescript
// Add to EnvConfig interface:
florenceUrl: string;
photoDir: string;

// Add to envConfig object:
florenceUrl: process.env.FLORENCE_URL ?? process.env.DETECTION_SERVICE_URL ?? 'http://localhost:14001',
photoDir: process.env.PHOTO_DIR ?? `${process.env.HOME}/allmythings-data`,
```

- [ ] **Step 2: Install @fastify/static for serving photos**

Run: `cd api-service && npm install @fastify/static`

- [ ] **Step 3: Rewrite app.ts to use FlorencePipelineService**

Replace the imports and `createDefaultPipeline()` in `api-service/src/app.ts`. The key changes:

1. Replace old provider imports with new Florence pipeline imports
2. Register `@fastify/static` to serve `~/allmythings-data/photos/` at `/photos/`
3. Replace `createDefaultPipeline()` with `createPipeline()` that instantiates `FlorencePipelineService`

The new `createPipeline()`:

```typescript
function createPipeline(): FlorencePipelineService {
  const storage = new PhotoStorageService(envConfig.photoDir);
  const detector = new FlorenceDetector(envConfig.florenceUrl);
  const classifier = new OllamaClassifier(envConfig);
  return new FlorencePipelineService(storage, detector, classifier);
}
```

- [ ] **Step 4: Simplify detect.route.ts to synchronous JSON only**

Replace the SSE streaming code with a simple synchronous response. The route now uses `FlorencePipelineService` instead of `DetectionPipelineService`:

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { FlorencePipelineService } from '../services/florence-pipeline.service';
import { ImageQualityService } from '../services/image-quality.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { BadRequestError, PayloadTooLargeError } from '../utils/errors';
import { logger } from '../utils/logger';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function detectRoute(app: FastifyInstance): Promise<void> {
  const pipeline = (app as any).pipeline as FlorencePipelineService;
  const qualityService = new ImageQualityService();

  app.post('/v1/detect', { preHandler: authMiddleware }, async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await request.file();
    if (!data) throw new BadRequestError('No image file uploaded');

    const imageBuffer = await data.toBuffer();
    if (imageBuffer.length > MAX_IMAGE_SIZE) {
      throw new PayloadTooLargeError(`Image exceeds ${MAX_IMAGE_SIZE / 1024 / 1024}MB limit`);
    }
    if (data.mimetype && !SUPPORTED_TYPES.includes(data.mimetype)) {
      throw new BadRequestError(`Unsupported image type: ${data.mimetype}`);
    }

    logger.info({ filename: data.filename, size: imageBuffer.length }, 'Processing detection request');

    const [result, quality] = await Promise.all([
      pipeline.detect(imageBuffer),
      qualityService.analyzeQuality(imageBuffer),
    ]);

    return reply.code(200).send({
      ...result,
      imageQuality: { blur: quality.blurScore, brightness: quality.brightness, contrast: quality.contrast },
    });
  });
}
```

- [ ] **Step 5: Update health route**

In `api-service/src/routes/health.route.ts`, change the pipeline type from `DetectionPipelineService` to `FlorencePipelineService`.

- [ ] **Step 6: Run all API tests**

Run: `cd api-service && npm test`

Note: Tests referencing old `DetectionPipelineService` directly will need their imports updated or be skipped. The new pipeline tests (Tasks 2-5) cover the active code path. Fix any breaking tests by updating imports.

- [ ] **Step 7: Commit**

```bash
git add api-service/src/app.ts \
       api-service/src/config/env.config.ts \
       api-service/src/routes/detect.route.ts \
       api-service/src/routes/health.route.ts \
       api-service/package.json \
       api-service/package-lock.json
git commit -m "feat(api): wire Florence pipeline, simplify /v1/detect to sync JSON"
```

---

## Task 7: Startup Automation — `make start` / `make stop` / `make status`

**Files:**
- Create: `scripts/start-all.sh`
- Modify: `Makefile`

- [ ] **Step 1: Create start-all.sh**

Create `scripts/start-all.sh` — a bash process manager that starts detection-service, Ollama, and api-service in dependency order with health gate polling. Supports `start`, `stop`, `status`, and `logs` subcommands. Uses PID files in `/tmp/allmythings/` for process tracking. Each service has a health URL polled with curl every 2s until healthy or timeout.

Key behavior:
- `start`: Kills existing processes, starts each service sequentially, waits for health, reports status
- `stop`: Reads PID files, sends SIGTERM, waits 5s, then SIGKILL. Falls back to port-based kill
- `status`: Curls each health endpoint, shows green/red status
- `logs`: Tails combined log files from `/tmp/allmythings/`

Timeouts: detection-service 120s (model download on first run), Ollama 30s, api-service 30s.

See spec section "Startup Automation" for full requirements.

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/start-all.sh`

- [ ] **Step 3: Add Makefile targets**

Add after the existing `dev-mobile` target in `Makefile`:

```makefile
## -- Service Management -------------------------------------------------
start: ## Start all services (detection + ollama + api) with health gates
	@./scripts/start-all.sh start

stop: ## Stop all services
	@./scripts/start-all.sh stop

status: ## Show status of all services
	@./scripts/start-all.sh status

logs: ## Tail combined logs from all services
	@./scripts/start-all.sh logs
```

- [ ] **Step 4: Test startup**

Run: `make start`
Expected: All three services start, health checks pass, "All services ready" message appears

Run: `make status`
Expected: All three services show "up"

Run: `make stop`
Expected: All services stopped cleanly

- [ ] **Step 5: Commit**

```bash
git add scripts/start-all.sh Makefile
git commit -m "feat(ops): make start/stop/status — single-command service management"
```

---

## Task 8: Update Mobile App — New Response Format + Photo Persistence

**Files:**
- Modify: `mobile-app/lib/domain/models/detected_object.dart`
- Modify: `mobile-app/lib/data/repositories/detection_repository.dart`
- Modify: `mobile-app/lib/data/database/tables/inventory_items.dart`
- Modify: `mobile-app/lib/data/database/app_database.dart`
- Modify: `mobile-app/lib/data/repositories/inventory_repository.dart`

- [ ] **Step 1: Add fromApiItem factory to DetectedObject**

In `mobile-app/lib/domain/models/detected_object.dart`, add a factory constructor that parses the new API response shape (items with `attributes` sub-object and `bbox` object).

- [ ] **Step 2: Update DetectionResult class and repository**

In `mobile-app/lib/data/repositories/detection_repository.dart`:
- Add `photoId`, `photoUrl`, `traceId` fields to `DetectionResult`
- Update `detectObjects()` to parse the new response: `data['items']` instead of `data['fused']`, use `DetectedObject.fromApiItem()`, extract `photoId`/`photoUrl`/`traceId`

- [ ] **Step 3: Add serverPhotoUrl column**

In `mobile-app/lib/data/database/tables/inventory_items.dart`, add:
```dart
TextColumn get serverPhotoUrl => text().nullable()();
```

- [ ] **Step 4: Add migration v3 -> v4**

In `mobile-app/lib/data/database/app_database.dart`:
- Bump `schemaVersion` from 3 to 4
- Add migration: `if (from < 4) { await m.addColumn(inventoryItems, inventoryItems.serverPhotoUrl); }`

- [ ] **Step 5: Wire photoUrl into save flow**

In `mobile-app/lib/data/repositories/inventory_repository.dart`, pass the `serverPhotoUrl` through when creating inventory items. Also extract `search_tags` from API attributes and save as labels with key `tag`.

- [ ] **Step 6: Run code generation**

Run: `cd mobile-app && flutter pub run build_runner build --delete-conflicting-outputs`

- [ ] **Step 7: Run mobile tests**

Run: `cd mobile-app && flutter test`
Expected: PASS (update mock data in test fixtures if needed)

- [ ] **Step 8: Commit**

```bash
cd mobile-app && git add lib/ && cd ..
git commit -m "feat(mobile): update for Florence pipeline response + photo URL persistence"
```

---

## Task 9: Update .env Files and Integration Test

**Files:**
- Modify: `.env.example`
- Modify or create: `api-service/.env`

- [ ] **Step 1: Update .env.example**

Replace the root `.env.example` with the Florence pipeline config:

```
PORT=14000
NODE_ENV=development
API_KEY=
DETECTION_SERVICE_URL=http://localhost:14001
FLORENCE_URL=http://localhost:14001
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5vl:7b
OLLAMA_ENABLED=true
PHOTO_DIR=~/allmythings-data
CLASSIFICATION_TIMEOUT_MS=60000
```

- [ ] **Step 2: Ensure api-service/.env exists**

Run: `cp .env.example api-service/.env 2>/dev/null || true`

- [ ] **Step 3: Test clean startup**

```bash
make stop
make start
curl -s http://localhost:14000/v1/health | python3 -m json.tool
```

Expected: Health endpoint returns healthy status with florence and ollama both up.

- [ ] **Step 4: Test detection with a real image**

```bash
curl -s -X POST http://localhost:14000/v1/detect \
  -F "file=@test_images/room_01.jpg" | python3 -m json.tool
```

Expected: JSON with `photoId`, `items[]` containing AI-generated labels and attributes. Photo saved to `~/allmythings-data/photos/`.

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "chore: update env config for Florence pipeline"
```

---

## Task 10: Update Accuracy Harness for Florence Pipeline

**Files:**
- Modify: `accuracy/harness.mjs` (the harness in the project's accuracy directory)
- Modify: `accuracy/baseline.json`

Note: The accuracy testing harness lives in the project's testing directory. Update the model config to test the Florence pipeline endpoint.

- [ ] **Step 1: Update harness model config**

Add `florence:qwen7b` as a model that sends requests to `/v1/detect` (which now uses Florence pipeline by default). Remove or keep the old `hybrid:owlv2-qwen7b` for comparison.

- [ ] **Step 2: Run accuracy tests and capture baseline**

```bash
make start
make accuracy        # or the equivalent target
make accuracy-baseline
```

Florence-2 should match or beat OWLv2's 77.2% recall baseline.

- [ ] **Step 3: Commit**

```bash
git add accuracy/
git commit -m "test(accuracy): re-baseline for Florence-2 + Qwen pipeline"
```

---

## Task 11: End-to-End Smoke Test on iPhone

This task is manual verification — no code changes.

- [ ] **Step 1: Start all services**

Run: `make start`

- [ ] **Step 2: Build and run Flutter app on iPhone**

Run: `cd mobile-app && flutter run --release -d <iPhone-device-id>`

- [ ] **Step 3: Verify the full flow**

1. App launches and discovers Mac server via mDNS
2. Tap camera button, take photo of a room
3. Spinner shows "Analyzing your room..."
4. After 5-15s, list of detected items appears with labels
5. Edit a label
6. Tap "Save to Inventory"
7. Navigate to inventory feed — photo and items appear
8. Search for an item by name — found via FTS

- [ ] **Step 4: Verify error handling**

1. Stop api-service (`make stop`) — app shows connectivity error
2. Restart (`make start`) — app reconnects
3. Take photo of blank wall — "No items detected" message
4. Take blurry/dark photo — quality gate feedback

- [ ] **Step 5: Check observability**

Run: `make logs | grep <trace_id_from_app_error_screen>`

Verify trace_id appears in both api-service and detection-service logs.
