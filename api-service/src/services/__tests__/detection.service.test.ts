/**
 * Unit tests for DetectionService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DetectionService } from '../detection.service';
import { VisionOrchestratorService } from '../vision-orchestrator.service';
import { ImageProcessingError } from '../../utils/errors';
import { DetectionResponse } from '../../schemas/detection.schema';

// Mock VisionOrchestratorService
vi.mock('../vision-orchestrator.service');

describe('DetectionService', () => {
  let detectionService: DetectionService;
  let mockOrchestrator: VisionOrchestratorService;

  const mockDetectionResponse: DetectionResponse = {
    success: true,
    ensembleMode: 'partial',
    processingTimeMs: 1000,
    detections: [
      {
        id: 'det-1',
        label: 'laptop',
        confidence: 0.92,
        boundingBox: { x: 0.2, y: 0.3, width: 0.4, height: 0.5 },
        ensembleDetails: {
          providerAgreement: 2,
          confidenceByProvider: { google: 0.95, aws: 0.89 },
          labelConsensus: 'majority',
        },
        alternativeLabels: [],
      },
    ],
    providerResults: [],
    ensembleMetrics: {
      providersUsed: 2,
      averageConfidence: 0.92,
      consensusRate: 1.0,
    },
  };

  beforeEach(() => {
    mockOrchestrator = new VisionOrchestratorService();
    detectionService = new DetectionService(mockOrchestrator);

    // Mock orchestrator method
    vi.spyOn(mockOrchestrator, 'detectObjects').mockResolvedValue(
      mockDetectionResponse
    );
  });

  describe('detectObjects', () => {
    it('should detect objects in valid JPEG image', async () => {
      // Create a minimal JPEG buffer
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(100).fill(0)]);

      const result = await detectionService.detectObjects(jpegBuffer);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.detections).toHaveLength(1);
      expect(result.detections[0].label).toBe('laptop');
      expect(mockOrchestrator.detectObjects).toHaveBeenCalledWith(jpegBuffer);
    });

    it('should detect objects in valid PNG image', async () => {
      // Create a minimal PNG buffer
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, ...Array(100).fill(0)]);

      const result = await detectionService.detectObjects(pngBuffer);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(mockOrchestrator.detectObjects).toHaveBeenCalled();
    });

    it('should filter detections by minConfidence', async () => {
      const multiDetectionResponse: DetectionResponse = {
        ...mockDetectionResponse,
        detections: [
          { ...mockDetectionResponse.detections[0], confidence: 0.95 },
          { ...mockDetectionResponse.detections[0], id: 'det-2', confidence: 0.65 },
          { ...mockDetectionResponse.detections[0], id: 'det-3', confidence: 0.80 },
        ],
      };

      vi.spyOn(mockOrchestrator, 'detectObjects').mockResolvedValue(
        multiDetectionResponse
      );

      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(100).fill(0)]);
      const result = await detectionService.detectObjects(jpegBuffer, {
        minConfidence: 0.8,
      });

      expect(result.detections).toHaveLength(2);
      expect(result.detections.every(d => d.confidence >= 0.8)).toBe(true);
    });

    it('should reject empty buffer', async () => {
      const emptyBuffer = Buffer.from([]);

      await expect(
        detectionService.detectObjects(emptyBuffer)
      ).rejects.toThrow(ImageProcessingError);
    });

    it('should reject oversized image', async () => {
      // Create buffer > 10MB
      const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024);
      oversizedBuffer[0] = 0xFF;
      oversizedBuffer[1] = 0xD8;
      oversizedBuffer[2] = 0xFF;

      await expect(
        detectionService.detectObjects(oversizedBuffer)
      ).rejects.toThrow(ImageProcessingError);
    });

    it('should reject unsupported format', async () => {
      // Create a BMP-like buffer (unsupported)
      const bmpBuffer = Buffer.from([0x42, 0x4D, ...Array(100).fill(0)]);

      await expect(
        detectionService.detectObjects(bmpBuffer)
      ).rejects.toThrow(ImageProcessingError);
    });
  });

  describe('validateImage', () => {
    it('should validate JPEG format', async () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(100).fill(0)]);

      const metadata = await detectionService.validateImage(jpegBuffer);

      expect(metadata.format).toBe('jpeg');
      expect(metadata.mimeType).toBe('image/jpeg');
      expect(metadata.size).toBe(jpegBuffer.length);
    });

    it('should validate PNG format', async () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, ...Array(100).fill(0)]);

      const metadata = await detectionService.validateImage(pngBuffer);

      expect(metadata.format).toBe('png');
      expect(metadata.mimeType).toBe('image/png');
    });

    it('should validate WebP format', async () => {
      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50, ...Array(100).fill(0)
      ]);

      const metadata = await detectionService.validateImage(webpBuffer);

      expect(metadata.format).toBe('webp');
      expect(metadata.mimeType).toBe('image/webp');
    });
  });

  describe('generateThumbnail', () => {
    it('should generate thumbnail (placeholder)', async () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(100).fill(0)]);

      const thumbnail = await detectionService.generateThumbnail(jpegBuffer);

      // For Phase 1, returns original buffer
      expect(thumbnail).toBe(jpegBuffer);
    });
  });
});
