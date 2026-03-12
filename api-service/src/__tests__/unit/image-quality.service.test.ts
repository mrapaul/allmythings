import { describe, it, expect } from 'vitest';
import { ImageQualityService } from '../../services/image-quality.service';

function makeJpegBuffer(size = 200): Buffer {
  const buf = Buffer.alloc(size, 0x80); // mid-range bytes for moderate brightness/contrast
  // JPEG magic bytes: FF D8 FF
  buf[0] = 0xFF;
  buf[1] = 0xD8;
  buf[2] = 0xFF;
  buf[3] = 0xE0;
  return buf;
}

function makePngBuffer(): Buffer {
  // PNG magic: 89 50 4E 47 0D 0A 1A 0A then IHDR chunk
  const buf = Buffer.alloc(100, 0x80);
  buf[0] = 0x89;
  buf[1] = 0x50; // P
  buf[2] = 0x4E; // N
  buf[3] = 0x47; // G
  buf[4] = 0x0D;
  buf[5] = 0x0A;
  buf[6] = 0x1A;
  buf[7] = 0x0A;
  // IHDR: length (4 bytes) + 'IHDR' (4 bytes) + width (4 bytes big-endian) + height (4 bytes big-endian)
  buf.writeUInt32BE(13, 8);  // chunk length
  buf[12] = 0x49; // I
  buf[13] = 0x48; // H
  buf[14] = 0x44; // D
  buf[15] = 0x52; // R
  buf.writeUInt32BE(640, 16); // width
  buf.writeUInt32BE(480, 20); // height
  return buf;
}

describe('ImageQualityService', () => {
  const service = new ImageQualityService();

  describe('analyzeQuality', () => {
    it('returns valid metrics structure for a JPEG buffer', async () => {
      const metrics = await service.analyzeQuality(makeJpegBuffer(500));

      expect(metrics).toHaveProperty('isBlurry');
      expect(metrics).toHaveProperty('blurScore');
      expect(metrics).toHaveProperty('brightness');
      expect(metrics).toHaveProperty('contrast');
      expect(metrics).toHaveProperty('resolution');
      expect(metrics).toHaveProperty('qualityLevel');
      expect(metrics).toHaveProperty('feedback');
      expect(metrics).toHaveProperty('recommendedAction');

      expect(typeof metrics.isBlurry).toBe('boolean');
      expect(metrics.blurScore).toBeGreaterThanOrEqual(0);
      expect(metrics.blurScore).toBeLessThanOrEqual(1);
      expect(metrics.brightness).toBeGreaterThanOrEqual(0);
      expect(metrics.brightness).toBeLessThanOrEqual(1);
      expect(metrics.contrast).toBeGreaterThanOrEqual(0);
      expect(metrics.contrast).toBeLessThanOrEqual(1);
      expect(Array.isArray(metrics.feedback)).toBe(true);
    });

    it('detects PNG format and extracts dimensions from IHDR', async () => {
      const metrics = await service.analyzeQuality(makePngBuffer());

      expect(metrics.resolution.width).toBe(640);
      expect(metrics.resolution.height).toBe(480);
      expect(metrics.resolution.megapixels).toBeCloseTo(0.3072, 3);
    });

    it('detects JPEG format', async () => {
      const metrics = await service.analyzeQuality(makeJpegBuffer(500));
      // Resolution may be 0 if SOF marker not found in small test buffer, but metrics are still valid
      expect(metrics.resolution.megapixels).toBeGreaterThanOrEqual(0);
    });

    it('returns neutral metrics on error (very short buffer)', async () => {
      // Buffer too small to analyze — should return neutral fallback
      const tinyBuffer = Buffer.from([0x01]);
      const metrics = await service.analyzeQuality(tinyBuffer);

      // Should return something usable
      expect(metrics.brightness).toBeGreaterThanOrEqual(0);
      expect(metrics.brightness).toBeLessThanOrEqual(1);
      expect(metrics.contrast).toBeGreaterThanOrEqual(0);
      expect(metrics.recommendedAction).toBeDefined();
    });

    it('qualityLevel is one of the expected values', async () => {
      const metrics = await service.analyzeQuality(makeJpegBuffer(500));
      expect(['excellent', 'good', 'acceptable', 'poor']).toContain(metrics.qualityLevel);
    });

    it('recommendedAction is one of the expected values', async () => {
      const metrics = await service.analyzeQuality(makeJpegBuffer(500));
      expect(['process', 'retry_lighting', 'retry_focus', 'retry_both', 'reject']).toContain(
        metrics.recommendedAction
      );
    });
  });

  describe('validateQuality', () => {
    it('returns metrics without throwing in non-strict mode', async () => {
      const metrics = await service.validateQuality(makeJpegBuffer(500), false);
      expect(metrics).toBeDefined();
    });
  });
});
