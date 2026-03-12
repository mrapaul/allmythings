import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroundingDinoDetector } from '../../providers/grounding-dino.detector';

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

    const results = await detector.detect(Buffer.from('fake-image-data'));
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
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok' }) });
    expect(await detector.healthCheck()).toBe(true);
  });

  it('should return false for health check when service is down', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await detector.healthCheck()).toBe(false);
  });
});
