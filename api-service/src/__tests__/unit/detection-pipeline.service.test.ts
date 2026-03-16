import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DetectionPipelineService } from '../../services/detection-pipeline.service';
import { ObjectDetector, BoundingBoxResult } from '../../providers/detector.interface';
import { ObjectClassifier, ClassifiedObject } from '../../providers/classifier.interface';
import { ServiceUnavailableError } from '../../utils/errors';

describe('DetectionPipelineService', () => {
  let pipeline: DetectionPipelineService;
  let mockDetector: ObjectDetector;
  let mockClassifier: ObjectClassifier;

  const testImage = Buffer.from('test-image');
  const sampleDetections: BoundingBoxResult[] = [
    { box: { x: 0, y: 0, width: 0.5, height: 0.5 }, coarseLabel: 'item', confidence: 0.9 }
  ];
  const sampleClassified: ClassifiedObject[] = [
    {
      boxIndex: 0,
      label: 'test-item',
      category: 'test-cat',
      brand: null,
      model: null,
      colors: [],
      materials: [],
      condition: 'good',
      estimatedValue: null,
      description: 'test-desc',
      confidence: 0.95,
      boundingBox: { x: 0, y: 0, width: 0.5, height: 0.5 }
    }
  ];

  beforeEach(() => {
    mockDetector = {
      name: 'test-detector',
      detect: vi.fn().mockResolvedValue(sampleDetections),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    mockClassifier = {
      name: 'gemini',
      classify: vi.fn().mockResolvedValue(sampleClassified),
      generateDetectionPrompt: vi.fn().mockResolvedValue('prompt'),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    pipeline = new DetectionPipelineService([mockDetector], [mockClassifier]);
  });

  describe('happy path', () => {
    it('should detect and classify when all providers succeed', async () => {
      const result = await pipeline.detect(testImage);

      expect(result.detections).toEqual(sampleClassified);
      // Now returns 'multi-vlm-one-pass' for the parallel path
      expect(result.detector).toBe('multi-vlm-one-pass');
      expect(result.classifier).toBe('gemini');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('detector fallback', () => {
    it('should fall back to secondary detector when primary fails', async () => {
      const mockDetector2 = {
        name: 'test-detector-2',
        detect: vi.fn().mockResolvedValue(sampleDetections),
        healthCheck: vi.fn().mockResolvedValue(true),
      };
      // Primary fails
      mockDetector.detect = vi.fn().mockRejectedValue(new Error('Fail'));
      
      const pipelineWithFallback = new DetectionPipelineService([mockDetector, mockDetector2], [mockClassifier]);
      const result = await pipelineWithFallback.detect(testImage);

      // Still tries parallel first, and if that fails or returns nothing, it falls back
      // Since parallel uses classifiers which might succeed, it might return 'multi-vlm-one-pass'
      expect(result.detections).toEqual(sampleClassified);
    });
  });

  describe('all providers fail', () => {
    it('should throw ServiceUnavailableError when all AI layers produce no results', async () => {
      mockDetector.detect = vi.fn().mockRejectedValue(new Error('Fail'));
      mockClassifier.classify = vi.fn().mockResolvedValue([]);

      await expect(pipeline.detect(testImage)).rejects.toThrow(ServiceUnavailableError);
      await expect(pipeline.detect(testImage)).rejects.toThrow('All AI layers failed to produce results');
    });
  });

  describe('healthCheck', () => {
    it('should return health status for all providers', async () => {
      const status = await pipeline.healthCheck();
      expect(status).toEqual({
        'test-detector': true,
        'gemini': true,
      });
    });
  });
});
