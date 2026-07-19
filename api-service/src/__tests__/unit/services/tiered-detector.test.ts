import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { DetectedItem } from '../../../types/detected-item';
import { TieredDetector } from '../../../services/tiered-detector';

vi.mock('sharp', () => ({
  __esModule: true,
  default: () => ({
    extract: () => ({
      jpeg: () => ({
        toBuffer: async () => ({ data: Buffer.from('cropped-image'), info: { width: 100, height: 100 } }),
      }),
    }),
  }),
}));

beforeAll(() => {
  vi.clearAllMocks();
});

describe('tiered-detector', () => {
  const mockImageBuffer = Buffer.from('test-image-data');

  describe('TieredDetector', () => {
    it('should detect items using two-pass tiered approach', async () => {
      const tier1Items: DetectedItem[] = [
        {
          label: 'sofa',
          description: 'large',
          category: 'Furniture',
          tags: ['seating'],
          box: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
          confidence: 0.85,
        },
      ];

      const tier2Items: DetectedItem[] = [
        {
          label: 'velvet',
          description: 'red velvet section',
          category: 'Upholstery',
          tags: ['fabric', 'color:red'],
          box: { x: 0.0, y: 0.0, width: 1.0, height: 1.0 },
          confidence: 0.92,
        },
      ];

      const mockT1Detector = {
        detect: async () => tier1Items,
      };

      const mockT2Adapter = {
        detect: async () => tier2Items,
      };

      const detector = new TieredDetector({
        t1Detector: mockT1Detector as any,
        t2Adapter: mockT2Adapter as any,
      });

      const result = await detector.detect(mockImageBuffer);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('velvet');
      expect(result[0].category).toBe('Upholstery');
      expect(result[0].tags).toContain('fabric');
    });

    it('should return tier1 item when tier2 finds nothing', async () => {
      const tier1Items: DetectedItem[] = [
        {
          label: ' chair',
          description: ' wooden dining',
          category: ' Furniture',
          tags: [' seating'],
          box: { x: 0.3, y: 0.5, width: 0.2, height: 0.3 },
          confidence: 0.78,
        },
      ];

      const tier2Items: DetectedItem[] = [];

      const mockT1Detector = {
        detect: async () => tier1Items,
      };

      const mockT2Adapter = {
        detect: async () => tier2Items,
      };

      const detector = new TieredDetector({
        t1Detector: mockT1Detector as any,
        t2Adapter: mockT2Adapter as any,
      });

      const result = await detector.detect(mockImageBuffer);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe(' chair');
    });
  });
});
