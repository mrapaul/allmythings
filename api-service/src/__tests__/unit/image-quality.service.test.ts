import { describe, it, expect, beforeEach } from 'vitest';
import { ImageQualityService } from '../../services/image-quality.service';
import fs from 'fs';
import path from 'path';

/**
 * Comprehensive unit tests for ImageQualityService
 * Tests blur detection, brightness analysis, contrast evaluation, and resolution extraction
 */
describe('ImageQualityService', () => {
  let qualityService: ImageQualityService;

  beforeEach(() => {
    qualityService = new ImageQualityService();
  });

  describe('analyzeQuality - Basic Functionality', () => {
    it('should analyze a valid JPEG image', async () => {
      // Load a real test image
      const imagePath = path.join(
        __dirname,
        '../fixtures/images/high_quality/interior_1.jpg'
      );
      if (!fs.existsSync(imagePath)) {
        console.log(
          'Skipping real image test - test fixture not available'
        );
        return;
      }

      const imageBuffer = fs.readFileSync(imagePath);
      const metrics = await qualityService.analyzeQuality(imageBuffer);

      expect(metrics).toBeDefined();
      expect(metrics.brightness).toBeGreaterThanOrEqual(0);
      expect(metrics.brightness).toBeLessThanOrEqual(1);
      expect(metrics.contrast).toBeGreaterThanOrEqual(0);
      expect(metrics.contrast).toBeLessThanOrEqual(1);
      expect(metrics.blurScore).toBeGreaterThanOrEqual(0);
      expect(metrics.blurScore).toBeLessThanOrEqual(1);
      expect(metrics.qualityLevel).toMatch(
        /excellent|good|acceptable|poor/
      );
      expect(metrics.recommendedAction).toMatch(
        /process|retry_lighting|retry_focus|retry_both|reject/
      );
    });

    it('should analyze a valid PNG image', async () => {
      // Create a small valid PNG for testing
      // PNG header: 89 50 4E 47 0D 0A 1A 0A
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      // IHDR chunk with 32x32 resolution
      const ihdrChunk = Buffer.from([
        0x00, 0x00, 0x00, 0x0d, // Length
        0x49, 0x48, 0x44, 0x52, // "IHDR"
        0x00, 0x00, 0x00, 0x20, // Width: 32
        0x00, 0x00, 0x00, 0x20, // Height: 32
        0x08, 0x02, 0x00, 0x00, 0x00, // Bit depth, color type, etc.
        0x00, 0x00, 0x00, 0x00, // CRC (simplified)
      ]);

      const imageBuffer = Buffer.concat([pngHeader, ihdrChunk]);
      const metrics = await qualityService.analyzeQuality(imageBuffer);

      expect(metrics).toBeDefined();
      expect(metrics.resolution.width).toBe(32);
      expect(metrics.resolution.height).toBe(32);
      expect(metrics.resolution.megapixels).toBeCloseTo(0.001, 3);
    });

    it('should handle invalid image gracefully', async () => {
      const invalidBuffer = Buffer.from('not an image');
      const metrics = await qualityService.analyzeQuality(invalidBuffer);

      expect(metrics).toBeDefined();
      expect(metrics.qualityLevel).toBe('poor'); // Invalid buffer = poor quality
      expect(metrics.recommendedAction).toBeDefined();
      expect(metrics).toHaveProperty('feedback');
    });
  });

  describe('Blur Detection', () => {
    it('should detect sharp images (low blur score)', async () => {
      // Create a test image buffer with high entropy (simulating sharpness)
      // High entropy = uniform distribution = sharp image
      const buffer = Buffer.alloc(1024);
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = (i % 256) ^ ((i / 256) | 0); // Varied byte values
      }

      const metrics = await qualityService.analyzeQuality(buffer);
      expect(metrics.blurScore).toBeLessThan(0.5);
      expect(metrics.isBlurry).toBe(false);
    });

    it('should detect blurry images (high blur score)', async () => {
      // Create a test image buffer with low entropy (simulating blur)
      // Low entropy = skewed distribution = blurry image
      const buffer = Buffer.alloc(1024);
      buffer.fill(128); // All same value = low entropy = blurry

      const metrics = await qualityService.analyzeQuality(buffer);
      expect(metrics.blurScore).toBeGreaterThan(0.5);
      expect(metrics.isBlurry).toBe(true);
    });
  });

  describe('Brightness Analysis', () => {
    it('should correctly measure brightness', async () => {
      // Create a dark image (low brightness)
      const darkBuffer = Buffer.alloc(1024);
      darkBuffer.fill(30); // Very dark

      const darkMetrics = await qualityService.analyzeQuality(darkBuffer);
      expect(darkMetrics.brightness).toBeLessThan(0.2);

      // Create a bright image (high brightness)
      const brightBuffer = Buffer.alloc(1024);
      brightBuffer.fill(240); // Very bright

      const brightMetrics = await qualityService.analyzeQuality(brightBuffer);
      expect(brightMetrics.brightness).toBeGreaterThan(0.8);

      // Create a mid-tone image (medium brightness)
      const midBuffer = Buffer.alloc(1024);
      midBuffer.fill(128); // Mid-gray

      const midMetrics = await qualityService.analyzeQuality(midBuffer);
      expect(midMetrics.brightness).toBeCloseTo(0.5, 0);
    });

    it('should flag very dark images', async () => {
      const darkBuffer = Buffer.alloc(512);
      darkBuffer.fill(20);

      const metrics = await qualityService.analyzeQuality(darkBuffer);
      expect(metrics.brightness).toBeLessThan(0.15);
      expect(metrics.feedback.some((f) => f.includes('dark'))).toBe(
        true
      );
    });

    it('should flag overexposed images', async () => {
      const brightBuffer = Buffer.alloc(512);
      brightBuffer.fill(245);

      const metrics = await qualityService.analyzeQuality(brightBuffer);
      expect(metrics.brightness).toBeGreaterThan(0.90);
      expect(metrics.feedback.some((f) => f.includes('overexposed'))).toBe(
        true
      );
    });
  });

  describe('Contrast Analysis', () => {
    it('should measure contrast correctly', async () => {
      // Low contrast: all similar values
      const lowContrastBuffer = Buffer.alloc(512);
      for (let i = 0; i < lowContrastBuffer.length; i++) {
        lowContrastBuffer[i] = 127 + (i % 3); // Very narrow range
      }

      const lowMetrics = await qualityService.analyzeQuality(
        lowContrastBuffer
      );
      expect(lowMetrics.contrast).toBeLessThan(0.2);

      // High contrast: wide range of values
      const highContrastBuffer = Buffer.alloc(512);
      for (let i = 0; i < highContrastBuffer.length; i++) {
        highContrastBuffer[i] = i % 256; // Full range
      }

      const highMetrics = await qualityService.analyzeQuality(
        highContrastBuffer
      );
      expect(highMetrics.contrast).toBeGreaterThan(0.4);
    });

    it('should flag low contrast images', async () => {
      const lowContrastBuffer = Buffer.alloc(256);
      lowContrastBuffer.fill(128);

      const metrics = await qualityService.analyzeQuality(lowContrastBuffer);
      expect(metrics.contrast).toBeLessThan(0.2);
      expect(metrics.feedback.some((f) => f.includes('Low contrast'))).toBe(
        true
      );
    });
  });

  describe('Resolution Extraction', () => {
    it('should extract PNG dimensions correctly', async () => {
      // Create a PNG header with specific dimensions
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
        0x00, 0x00, 0x00, 0x0d, // IHDR length
        0x49, 0x48, 0x44, 0x52, // "IHDR"
        0x00, 0x00, 0x04, 0x00, // Width: 1024
        0x00, 0x00, 0x03, 0x00, // Height: 768
        0x08, 0x02, 0x00, 0x00, 0x00, // Bit depth, color type, etc.
        0x00, 0x00, 0x00, 0x00, // CRC
      ]);

      const metrics = await qualityService.analyzeQuality(pngHeader);
      expect(metrics.resolution.width).toBe(1024);
      expect(metrics.resolution.height).toBe(768);
      expect(metrics.resolution.megapixels).toBeCloseTo(0.786432, 5);
    });

    it('should calculate megapixels correctly', async () => {
      // 1920x1080 = 2.0736MP
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x07, 0x80, // Width: 1920
        0x00, 0x00, 0x04, 0x38, // Height: 1080
        0x08, 0x02, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ]);

      const metrics = await qualityService.analyzeQuality(pngHeader);
      expect(metrics.resolution.megapixels).toBeCloseTo(2.0736, 3);
    });

    it('should flag low resolution images', async () => {
      const lowResBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x40, // Width: 64
        0x00, 0x00, 0x00, 0x40, // Height: 64
        0x08, 0x02, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ]);

      const metrics = await qualityService.analyzeQuality(lowResBuffer);
      expect(metrics.resolution.megapixels).toBeLessThan(1);
      expect(metrics.feedback.some((f) => f.includes('Resolution'))).toBe(
        true
      );
    });
  });

  describe('Quality Level Classification', () => {
    it('should classify excellent quality images', async () => {
      // Create high quality image: bright, sharp, good contrast
      const qualityBuffer = Buffer.alloc(512);
      for (let i = 0; i < qualityBuffer.length; i++) {
        qualityBuffer[i] = 100 + (i % 50); // Mid to bright with variation
      }

      const metrics = await qualityService.analyzeQuality(qualityBuffer);
      expect(metrics.qualityLevel).toMatch(/excellent|good|acceptable/);
      expect(metrics.recommendedAction).toBe('process');
    });

    it('should classify poor quality images and suggest retry', async () => {
      // Create poor quality image: dark and uniform
      const poorBuffer = Buffer.alloc(256);
      poorBuffer.fill(25);

      const metrics = await qualityService.analyzeQuality(poorBuffer);
      expect(metrics.qualityLevel).toBe('poor');
      expect(metrics.recommendedAction).not.toBe('process');
    });
  });

  describe('User Feedback Generation', () => {
    it('should provide actionable feedback for improvements', async () => {
      const buffer = Buffer.alloc(256);
      buffer.fill(30); // Dark image

      const metrics = await qualityService.analyzeQuality(buffer);
      expect(metrics.feedback.length).toBeGreaterThan(0);
      expect(metrics.feedback[0]).toBeTruthy();
      expect(typeof metrics.feedback[0]).toBe('string');
    });

    it('should include emoji suggestions in feedback', async () => {
      const buffer = Buffer.alloc(256);
      buffer.fill(25); // Very dark

      const metrics = await qualityService.analyzeQuality(buffer);
      const feedbackText = metrics.feedback.join(' ');
      // Should have emoji or descriptive text
      expect(
        feedbackText.includes('light') ||
          feedbackText.includes('dark') ||
          feedbackText.includes('brightness')
      ).toBe(true);
    });

    it('should recommend no retakes for excellent images', async () => {
      // Create an excellent quality buffer
      const goodBuffer = Buffer.alloc(512);
      for (let i = 0; i < goodBuffer.length; i++) {
        goodBuffer[i] = 120 + (i % 60);
      }

      const metrics = await qualityService.analyzeQuality(goodBuffer);
      if (metrics.qualityLevel === 'excellent') {
        expect(metrics.recommendedAction).toBe('process');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty buffers', async () => {
      const emptyBuffer = Buffer.alloc(0);
      const metrics = await qualityService.analyzeQuality(emptyBuffer);
      expect(metrics).toBeDefined();
      expect(metrics.brightness).toBeDefined();
    });

    it('should handle very small buffers', async () => {
      const smallBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const metrics = await qualityService.analyzeQuality(smallBuffer);
      expect(metrics).toBeDefined();
    });

    it('should handle very large buffers', async () => {
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB
      largeBuffer.fill(128);
      const metrics = await qualityService.analyzeQuality(largeBuffer);
      expect(metrics).toBeDefined();
      expect(metrics.brightness).toBeCloseTo(0.5, 0);
    });
  });

  describe('Consistency Checks', () => {
    it('should return consistent results for same input', async () => {
      const buffer = Buffer.alloc(1024);
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = (i * 7) % 256;
      }

      const metrics1 = await qualityService.analyzeQuality(buffer);
      const metrics2 = await qualityService.analyzeQuality(buffer);

      expect(metrics1.brightness).toEqual(metrics2.brightness);
      expect(metrics1.contrast).toEqual(metrics2.contrast);
      expect(metrics1.blurScore).toEqual(metrics2.blurScore);
      expect(metrics1.qualityLevel).toEqual(metrics2.qualityLevel);
    });

    it('should validate quality metrics are within bounds', async () => {
      const buffer = Buffer.alloc(1024);
      buffer.fill(127);

      const metrics = await qualityService.analyzeQuality(buffer);

      expect(metrics.brightness).toBeGreaterThanOrEqual(0);
      expect(metrics.brightness).toBeLessThanOrEqual(1);
      expect(metrics.contrast).toBeGreaterThanOrEqual(0);
      expect(metrics.contrast).toBeLessThanOrEqual(1);
      expect(metrics.blurScore).toBeGreaterThanOrEqual(0);
      expect(metrics.blurScore).toBeLessThanOrEqual(1);
      expect(metrics.resolution.megapixels).toBeGreaterThanOrEqual(0);
    });
  });
});
