import { describe, it, expect, vi, afterEach } from 'vitest';
import FormData from 'form-data';
import { buildApp } from '../../app';
import { DetectionPipelineService } from '../../services/detection-pipeline.service';
import { MultiPassVlmClassifier } from '../../services/multi-pass-vlm.classifier';
import { envConfig } from '../../config/env.config';
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

function makeTestClassifier(): ObjectClassifier {
  return {
    name: 'test-classifier',
    classify: vi.fn().mockResolvedValue(sampleClassifiedObjects),
    generateDetectionPrompt: vi.fn().mockResolvedValue('sofa . lamp . book'),
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

function makeMockPipeline(detectors: ObjectDetector[], classifiers: ObjectClassifier[]): DetectionPipelineService {
  const multiPassVlm = new MultiPassVlmClassifier(classifiers, envConfig);
  vi.spyOn(multiPassVlm, 'detect').mockResolvedValue([]);
  return new DetectionPipelineService({
    fastDetectorUrl: envConfig.detectionServiceUrl,
    multiPassVlm,
    classifiers,
    detectors,
  });
}

describe('POST /v1/detect', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 with detection result shape in full mode', async () => {
    const mockPipeline = makeMockPipeline([makeMockDetector([])], [makeTestClassifier()]);
    const app = await buildApp({ disableRateLimit: true, pipeline: mockPipeline });

    const form = new FormData();
    form.append('file', makeJpegBuffer(), { filename: 'test.jpg', contentType: 'image/jpeg' });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/detect?mode=full',
      headers: form.getHeaders(),
      payload: form.getBuffer(),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body).toHaveProperty('fused');
    expect(body).toHaveProperty('totalProcessingMs');
    expect(body).toHaveProperty('imageQuality');
    expect(Array.isArray(body.fused)).toBe(true);

    await app.close();
  });

  it('returns 400 when no file is uploaded', async () => {
    const mockPipeline = makeMockPipeline([makeMockDetector([])], [makeTestClassifier()]);
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

  it('returns SSE stream by default', async () => {
    const mockPipeline = makeMockPipeline([makeMockDetector([])], [makeTestClassifier()]);
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
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.body).toContain('event: done');

    await app.close();
  });
});
