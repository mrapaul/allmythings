import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleVisionDetector } from '../../providers/google-vision.detector';

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
    vi.clearAllMocks();
    detector = new GoogleVisionDetector(config);
    mockClient = (ImageAnnotatorClient as any).mock.results[0]?.value;
  });

  it('should normalize vertex-based bounding boxes', async () => {
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
    expect(results[0].box.x).toBeCloseTo(0.1);
    expect(results[0].box.y).toBeCloseTo(0.2);
    expect(results[0].box.width).toBeCloseTo(0.4);
    expect(results[0].box.height).toBeCloseTo(0.6);
    expect(results[0].coarseLabel).toBe('Chair');
    expect(results[0].confidence).toBe(0.87);
  });

  it('should return empty array when no objects detected', async () => {
    mockClient.objectLocalization.mockResolvedValueOnce([{ localizedObjectAnnotations: [] }]);
    const results = await detector.detect(Buffer.from('fake-image'));
    expect(results).toHaveLength(0);
  });

  it('should return true for health check when configured', async () => {
    expect(await detector.healthCheck()).toBe(true);
  });
});
