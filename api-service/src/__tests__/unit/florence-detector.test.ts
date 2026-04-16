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
