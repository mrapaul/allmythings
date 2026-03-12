import { describe, it, expect, vi, afterEach } from 'vitest';
import FormData from 'form-data';
import { buildApp } from '../../app';
import { DetectionPipelineService } from '../../services/detection-pipeline.service';
import { sampleClassifiedObjects } from '../fixtures/test-data';
import { ObjectDetector, BoundingBoxResult } from '../../providers/detector.interface';
import { ObjectClassifier } from '../../providers/classifier.interface';

function makeMockDetector(boxes: BoundingBoxResult[]): ObjectDetector {
  return {
    name: 'mock-detector',
    detect: vi.fn().mockResolvedValue(boxes),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

function makeMockClassifier(): ObjectClassifier {
  return {
    name: 'mock-classifier',
    classify: vi.fn().mockResolvedValue(sampleClassifiedObjects),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

// Minimal valid JPEG buffer (FF D8 FF E0 + padding)
function makeJpegBuffer(): Buffer {
  const buf = Buffer.alloc(100);
  buf[0] = 0xFF;
  buf[1] = 0xD8;
  buf[2] = 0xFF;
  buf[3] = 0xE0;
  return buf;
}

describe('POST /v1/detect', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 with detection result shape', async () => {
    const mockPipeline = new DetectionPipelineService(
      [makeMockDetector([])],
      [makeMockClassifier()]
    );
    const app = await buildApp({ disableRateLimit: true, pipeline: mockPipeline });

    const form = new FormData();
    form.append('file', makeJpegBuffer(), { filename: 'test.jpg', contentType: 'image/jpeg' });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/detect',
      headers: form.getHeaders(),
      payload: form.getBuffer(),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body).toHaveProperty('detections');
    expect(body).toHaveProperty('processingTimeMs');
    expect(body).toHaveProperty('imageQuality');
    expect(Array.isArray(body.detections)).toBe(true);

    await app.close();
  });

  it('returns 400 when no file is uploaded', async () => {
    const mockPipeline = new DetectionPipelineService(
      [makeMockDetector([])],
      [makeMockClassifier()]
    );
    const app = await buildApp({ disableRateLimit: true, pipeline: mockPipeline });

    const form = new FormData();
    // No file appended

    const response = await app.inject({
      method: 'POST',
      url: '/v1/detect',
      headers: form.getHeaders(),
      payload: form.getBuffer(),
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns detections matching classified objects', async () => {
    const sampleBoxes: BoundingBoxResult[] = [
      { box: { x: 0.1, y: 0.05, width: 0.25, height: 0.85 }, coarseLabel: 'furniture', confidence: 0.9 },
    ];
    const mockPipeline = new DetectionPipelineService(
      [makeMockDetector(sampleBoxes)],
      [makeMockClassifier()]
    );
    const app = await buildApp({ disableRateLimit: true, pipeline: mockPipeline });

    const form = new FormData();
    form.append('file', makeJpegBuffer(), { filename: 'room.jpg', contentType: 'image/jpeg' });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/detect',
      headers: form.getHeaders(),
      payload: form.getBuffer(),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { detections: unknown[] };
    expect(body.detections).toHaveLength(sampleClassifiedObjects.length);

    await app.close();
  });
});
