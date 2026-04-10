import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildApp } from '../../app';
import { DetectionPipelineService } from '../../services/detection-pipeline.service';
import { MultiPassVlmClassifier } from '../../services/multi-pass-vlm.classifier';
import { envConfig } from '../../config/env.config';
import { ObjectDetector } from '../../providers/detector.interface';
import { ObjectClassifier } from '../../providers/classifier.interface';

function makeMockDetector(healthy: boolean): ObjectDetector {
  return {
    name: 'mock-detector',
    detect: vi.fn().mockResolvedValue([]),
    healthCheck: vi.fn().mockResolvedValue(healthy),
  };
}

function makeTestClassifier(healthy: boolean): ObjectClassifier {
  return {
    name: 'test-classifier',
    classify: vi.fn().mockResolvedValue([]),
    generateDetectionPrompt: vi.fn().mockResolvedValue('sofa . lamp . book'),
    healthCheck: vi.fn().mockResolvedValue(healthy),
  };
}

describe('GET /v1/health', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 and healthy status when all providers are up', async () => {
    const classifiers = [makeTestClassifier(true)];
    const detectors = [makeMockDetector(true)];
    const multiPassVlm = new MultiPassVlmClassifier(classifiers, envConfig);
    const mockPipeline = new DetectionPipelineService({
      fastDetectorUrl: envConfig.detectionServiceUrl,
      multiPassVlm,
      classifiers,
      detectors,
    });
    const app = await buildApp({ disableRateLimit: true, pipeline: mockPipeline });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { status: string; providers: Record<string, boolean>; timestamp: string };
    expect(body.status).toBe('healthy');
    expect(body.providers).toHaveProperty('mock-detector');
    expect(body.providers).toHaveProperty('test-classifier');
    expect(body.providers['mock-detector']).toBe(true);
    expect(body.providers['test-classifier']).toBe(true);
    expect(body).toHaveProperty('timestamp');

    await app.close();
  });

  it('returns 200 and degraded status when a provider is down but others are up', async () => {
    const classifiers = [makeTestClassifier(true)];
    const detectors = [makeMockDetector(false)];
    const multiPassVlm = new MultiPassVlmClassifier(classifiers, envConfig);
    const mockPipeline = new DetectionPipelineService({
      fastDetectorUrl: envConfig.detectionServiceUrl,
      multiPassVlm,
      classifiers,
      detectors,
    });
    const app = await buildApp({ disableRateLimit: true, pipeline: mockPipeline });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { status: string };
    expect(body.status).toBe('degraded');

    await app.close();
  });

  it('returns 503 and unhealthy status when all providers are down', async () => {
    const classifiers = [makeTestClassifier(false)];
    const detectors = [makeMockDetector(false)];
    const multiPassVlm = new MultiPassVlmClassifier(classifiers, envConfig);
    const mockPipeline = new DetectionPipelineService({
      fastDetectorUrl: envConfig.detectionServiceUrl,
      multiPassVlm,
      classifiers,
      detectors,
    });
    const app = await buildApp({ disableRateLimit: true, pipeline: mockPipeline });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body) as { status: string };
    expect(body.status).toBe('unhealthy');

    await app.close();
  });
});
