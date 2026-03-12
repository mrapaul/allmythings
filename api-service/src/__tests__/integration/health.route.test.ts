import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildApp } from '../../app';
import { DetectionPipelineService } from '../../services/detection-pipeline.service';
import { ObjectDetector } from '../../providers/detector.interface';
import { ObjectClassifier } from '../../providers/classifier.interface';

function makeMockDetector(healthy: boolean): ObjectDetector {
  return {
    name: 'mock-detector',
    detect: vi.fn().mockResolvedValue([]),
    healthCheck: vi.fn().mockResolvedValue(healthy),
  };
}

function makeMockClassifier(healthy: boolean): ObjectClassifier {
  return {
    name: 'mock-classifier',
    classify: vi.fn().mockResolvedValue([]),
    healthCheck: vi.fn().mockResolvedValue(healthy),
  };
}

describe('GET /v1/health', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 and healthy status when all providers are up', async () => {
    const mockPipeline = new DetectionPipelineService(
      [makeMockDetector(true)],
      [makeMockClassifier(true)]
    );
    const app = await buildApp({ disableRateLimit: true, pipeline: mockPipeline });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { status: string; providers: Record<string, boolean>; timestamp: string };
    expect(body.status).toBe('healthy');
    expect(body.providers).toHaveProperty('mock-detector');
    expect(body.providers).toHaveProperty('mock-classifier');
    expect(body.providers['mock-detector']).toBe(true);
    expect(body.providers['mock-classifier']).toBe(true);
    expect(body).toHaveProperty('timestamp');

    await app.close();
  });

  it('returns 503 and degraded status when a provider is down', async () => {
    const mockPipeline = new DetectionPipelineService(
      [makeMockDetector(false)],
      [makeMockClassifier(true)]
    );
    const app = await buildApp({ disableRateLimit: true, pipeline: mockPipeline });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body) as { status: string };
    expect(body.status).toBe('degraded');

    await app.close();
  });
});
