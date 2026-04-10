import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DetectionPipelineService } from '../../services/detection-pipeline.service';
import { MultiPassVlmClassifier } from '../../services/multi-pass-vlm.classifier';
import { envConfig } from '../../config/env.config';
import { ObjectDetector } from '../../providers/detector.interface';
import { ObjectClassifier, ClassifiedObject } from '../../providers/classifier.interface';


describe('DetectionPipelineService', () => {
  let pipeline: DetectionPipelineService;
  let mockDetector: ObjectDetector;
  let mockClassifier: ObjectClassifier;
  let mockMultiPassVlm: MultiPassVlmClassifier;

  const testImage = Buffer.from('test-image');
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
      detect: vi.fn().mockResolvedValue([]),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    mockClassifier = {
      name: 'gemini',
      classify: vi.fn().mockResolvedValue(sampleClassified),
      generateDetectionPrompt: vi.fn().mockResolvedValue('prompt'),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    mockMultiPassVlm = new MultiPassVlmClassifier([mockClassifier], envConfig);
    vi.spyOn(mockMultiPassVlm, 'detect').mockResolvedValue(sampleClassified);

    pipeline = new DetectionPipelineService({
      fastDetectorUrl: envConfig.detectionServiceUrl,
      multiPassVlm: mockMultiPassVlm,
      classifiers: [mockClassifier],
      detectors: [mockDetector],
    });
  });

  describe('happy path', () => {
    it('should detect and classify when deep pass succeeds', async () => {
      const result = await pipeline.detect(testImage);

      // FusedDetection extends ClassifiedObject with a 'source' field
      expect(result.detections).toHaveLength(sampleClassified.length);
      expect(result.detections[0]).toMatchObject(sampleClassified[0]);
      // Fast pass fails (no real service), so detector is 'none'
      expect(result.detector).toBe('none');
      expect(result.classifier).toBe('multi-pass-vlm');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('detector fallback', () => {
    it('should still return deep pass results when fast detector is unavailable', async () => {
      const mockDetector2 = {
        name: 'test-detector-2',
        detect: vi.fn().mockResolvedValue([]),
        healthCheck: vi.fn().mockResolvedValue(true),
      };

      const fallbackMultiPassVlm = new MultiPassVlmClassifier([mockClassifier], envConfig);
      vi.spyOn(fallbackMultiPassVlm, 'detect').mockResolvedValue(sampleClassified);

      const pipelineWithFallback = new DetectionPipelineService({
        fastDetectorUrl: envConfig.detectionServiceUrl,
        multiPassVlm: fallbackMultiPassVlm,
        classifiers: [mockClassifier],
        detectors: [mockDetector, mockDetector2],
      });
      const result = await pipelineWithFallback.detect(testImage);

      expect(result.detections).toHaveLength(sampleClassified.length);
      expect(result.detections[0]).toMatchObject(sampleClassified[0]);
    });
  });

  describe('all providers fail', () => {
    it('should return empty detections when both fast and deep pass fail', async () => {
      vi.spyOn(mockMultiPassVlm, 'detect').mockRejectedValue(new Error('VLM unavailable'));

      const result = await pipeline.detect(testImage);

      expect(result.detections).toEqual([]);
      expect(result.detector).toBe('none');
      expect(result.classifier).toBe('none');
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
