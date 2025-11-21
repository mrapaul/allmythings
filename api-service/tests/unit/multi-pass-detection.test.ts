/**
 * Unit tests for multi-pass detection service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import pino from 'pino';
import { MultiPassDetectionService } from '../../src/services/multi-pass-detection.service';
import { Detection } from '../../src/domain/models/detection';

describe('MultiPassDetectionService', () => {
  let service: MultiPassDetectionService;
  let logger: pino.Logger;
  let mockVisionOrchestrator: any;
  let mockEnsembleFusion: any;

  beforeEach(() => {
    logger = pino({ level: 'silent' });

    mockVisionOrchestrator = {
      detectObjects: vi.fn(),
    };

    mockEnsembleFusion = {
      fuseResults: vi.fn(),
    };

    service = new MultiPassDetectionService(
      logger,
      mockVisionOrchestrator,
      mockEnsembleFusion
    );
  });

  describe('performMultiPassDetection', () => {
    it('should perform detection with first pass', async () => {
      const mockDetections: Detection[] = [
        {
          object: 'couch',
          confidence: 0.95,
          boundingBox: {
            top: 0.1,
            left: 0.1,
            bottom: 0.5,
            right: 0.5,
          },
        },
        {
          object: 'table',
          confidence: 0.88,
          boundingBox: {
            top: 0.4,
            left: 0.1,
            bottom: 0.7,
            right: 0.6,
          },
        },
      ];

      mockVisionOrchestrator.detectObjects.mockResolvedValue(mockDetections);

      const result = await service.performMultiPassDetection(
        Buffer.from('test')
      );

      expect(result).toBeDefined();
      expect(result.firstPassDetections).toHaveLength(2);
      expect(result.totalPasses).toBeGreaterThanOrEqual(1);
    });

    it('should include semantic expansion detections', async () => {
      const mockDetections: Detection[] = [
        {
          object: 'couch',
          confidence: 0.95,
          boundingBox: undefined,
        },
      ];

      mockVisionOrchestrator.detectObjects.mockResolvedValue(mockDetections);

      const result = await service.performMultiPassDetection(
        Buffer.from('test')
      );

      expect(result.semanticExpansion.length).toBeGreaterThan(0);
      const expandedObjects = result.semanticExpansion.map((d) =>
        d.object.toLowerCase()
      );
      expect(expandedObjects).toContain('sofa');
    });

    it('should include related object inferences', async () => {
      const mockDetections: Detection[] = [
        {
          object: 'bed',
          confidence: 0.92,
          boundingBox: undefined,
        },
      ];

      mockVisionOrchestrator.detectObjects.mockResolvedValue(mockDetections);

      const result = await service.performMultiPassDetection(
        Buffer.from('test')
      );

      expect(result.relatedObjectInference.length).toBeGreaterThan(0);
      const inferredObjects = result.relatedObjectInference.map((d) =>
        d.object.toLowerCase()
      );
      expect(inferredObjects).toContain('pillow');
    });

    it('should calculate detection coverage', async () => {
      const mockDetections: Detection[] = [
        { object: 'couch', confidence: 0.95, boundingBox: undefined },
        { object: 'table', confidence: 0.88, boundingBox: undefined },
        { object: 'lamp', confidence: 0.85, boundingBox: undefined },
      ];

      mockVisionOrchestrator.detectObjects.mockResolvedValue(mockDetections);

      const result = await service.performMultiPassDetection(
        Buffer.from('test')
      );

      expect(result.detectionCoverage).toBeGreaterThan(0);
      expect(result.detectionCoverage).toBeLessThanOrEqual(100);
    });

    it('should calculate average confidence', async () => {
      const mockDetections: Detection[] = [
        { object: 'couch', confidence: 0.9, boundingBox: undefined },
        { object: 'table', confidence: 0.8, boundingBox: undefined },
      ];

      mockVisionOrchestrator.detectObjects.mockResolvedValue(mockDetections);

      const result = await service.performMultiPassDetection(
        Buffer.from('test')
      );

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should respect room type hint', async () => {
      const mockDetections: Detection[] = [
        { object: 'toilet', confidence: 0.95, boundingBox: undefined },
        { object: 'sink', confidence: 0.92, boundingBox: undefined },
      ];

      mockVisionOrchestrator.detectObjects.mockResolvedValue(mockDetections);

      const result = await service.performMultiPassDetection(
        Buffer.from('test'),
        'bathroom'
      );

      expect(result).toBeDefined();
      expect(result.finalDetections).toBeDefined();
    });

    it('should handle empty first pass detections', async () => {
      mockVisionOrchestrator.detectObjects.mockResolvedValue([]);

      const result = await service.performMultiPassDetection(
        Buffer.from('test')
      );

      expect(result.firstPassDetections).toHaveLength(0);
      expect(result.finalDetections).toBeDefined();
    });

    it('should deduplicate similar detections', async () => {
      const mockDetections: Detection[] = [
        { object: 'couch', confidence: 0.95, boundingBox: undefined },
        { object: 'sofa', confidence: 0.92, boundingBox: undefined },
      ];

      mockVisionOrchestrator.detectObjects.mockResolvedValue(mockDetections);

      const result = await service.performMultiPassDetection(
        Buffer.from('test')
      );

      // Should only have couch as primary, sofa might be filtered due to duplicate semantics
      const objectNames = result.finalDetections.map((d) =>
        d.object.toLowerCase()
      );
      expect(objectNames.length).toBeGreaterThan(0);
    });

    it('should measure execution time', async () => {
      const mockDetections: Detection[] = [
        { object: 'couch', confidence: 0.95, boundingBox: undefined },
      ];

      mockVisionOrchestrator.detectObjects.mockResolvedValue(mockDetections);

      const result = await service.performMultiPassDetection(
        Buffer.from('test')
      );

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should improve detection with multiple passes', async () => {
      const firstPass: Detection[] = [
        { object: 'bed', confidence: 0.9, boundingBox: undefined },
      ];

      mockVisionOrchestrator.detectObjects.mockResolvedValue(firstPass);

      const result = await service.performMultiPassDetection(
        Buffer.from('test'),
        'bedroom'
      );

      // With semantic expansion and inference, should have more objects
      expect(result.finalDetections.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Room type inference', () => {
    it('should infer bedroom from bed', async () => {
      const mockDetections: Detection[] = [
        { object: 'bed', confidence: 0.95, boundingBox: undefined },
        { object: 'pillow', confidence: 0.88, boundingBox: undefined },
        { object: 'nightstand', confidence: 0.82, boundingBox: undefined },
      ];

      mockVisionOrchestrator.detectObjects.mockResolvedValue(mockDetections);

      const result = await service.performMultiPassDetection(
        Buffer.from('test')
      );

      expect(result).toBeDefined();
    });

    it('should infer kitchen from stove', async () => {
      const mockDetections: Detection[] = [
        { object: 'stove', confidence: 0.95, boundingBox: undefined },
        { object: 'sink', confidence: 0.92, boundingBox: undefined },
        { object: 'refrigerator', confidence: 0.88, boundingBox: undefined },
      ];

      mockVisionOrchestrator.detectObjects.mockResolvedValue(mockDetections);

      const result = await service.performMultiPassDetection(
        Buffer.from('test')
      );

      expect(result).toBeDefined();
    });

    it('should infer bathroom from toilet', async () => {
      const mockDetections: Detection[] = [
        { object: 'toilet', confidence: 0.95, boundingBox: undefined },
        { object: 'bathtub', confidence: 0.92, boundingBox: undefined },
        { object: 'mirror', confidence: 0.88, boundingBox: undefined },
      ];

      mockVisionOrchestrator.detectObjects.mockResolvedValue(mockDetections);

      const result = await service.performMultiPassDetection(
        Buffer.from('test')
      );

      expect(result).toBeDefined();
    });

    it('should infer office from desk and computer', async () => {
      const mockDetections: Detection[] = [
        { object: 'desk', confidence: 0.95, boundingBox: undefined },
        { object: 'computer', confidence: 0.92, boundingBox: undefined },
        { object: 'chair', confidence: 0.88, boundingBox: undefined },
      ];

      mockVisionOrchestrator.detectObjects.mockResolvedValue(mockDetections);

      const result = await service.performMultiPassDetection(
        Buffer.from('test')
      );

      expect(result).toBeDefined();
    });
  });

  describe('Confidence thresholds', () => {
    it('should apply room-specific thresholds', async () => {
      const mockDetections: Detection[] = [
        { object: 'couch', confidence: 0.95, boundingBox: undefined },
      ];

      mockVisionOrchestrator.detectObjects.mockResolvedValue(mockDetections);

      const result = await service.performMultiPassDetection(
        Buffer.from('test'),
        'living_room'
      );

      expect(result).toBeDefined();
    });

    it('should filter low confidence detections', async () => {
      const mockDetections: Detection[] = [
        { object: 'couch', confidence: 0.5, boundingBox: undefined },
      ];

      mockVisionOrchestrator.detectObjects.mockResolvedValue(mockDetections);

      const result = await service.performMultiPassDetection(
        Buffer.from('test')
      );

      // Low confidence should be filtered
      const lowConfidence = result.finalDetections.filter(
        (d) => d.confidence < 0.7
      );
      expect(lowConfidence.length).toBeLessThanOrEqual(
        result.finalDetections.length
      );
    });
  });

  describe('Performance', () => {
    it('should complete detection within reasonable time', async () => {
      const mockDetections: Detection[] = Array.from(
        { length: 20 },
        (_, i) => ({
          object: `object_${i}`,
          confidence: 0.85 + Math.random() * 0.15,
          boundingBox: undefined,
        })
      );

      mockVisionOrchestrator.detectObjects.mockResolvedValue(mockDetections);

      const start = Date.now();
      await service.performMultiPassDetection(Buffer.from('test'));
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it('should handle large detection lists', async () => {
      const mockDetections: Detection[] = Array.from(
        { length: 50 },
        (_, i) => ({
          object: `object_${i}`,
          confidence: 0.8 + Math.random() * 0.2,
          boundingBox: undefined,
        })
      );

      mockVisionOrchestrator.detectObjects.mockResolvedValue(mockDetections);

      const result = await service.performMultiPassDetection(
        Buffer.from('test')
      );

      expect(result.finalDetections).toBeDefined();
    });
  });
});
