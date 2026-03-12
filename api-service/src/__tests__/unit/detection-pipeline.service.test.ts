import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DetectionPipelineService } from '../../services/detection-pipeline.service';
import { ObjectDetector, BoundingBoxResult } from '../../providers/detector.interface';
import { ObjectClassifier, ClassifiedObject } from '../../providers/classifier.interface';
import { ServiceUnavailableError } from '../../utils/errors';

// Mock implementations
function makeMockDetector(name: string, result: BoundingBoxResult[] | Error): ObjectDetector {
  return {
    name,
    detect: vi.fn().mockImplementation(() => {
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve(result);
    }),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

function makeMockClassifier(name: string, result: ClassifiedObject[] | Error): ObjectClassifier {
  return {
    name,
    classify: vi.fn().mockImplementation(() => {
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve(result);
    }),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

const sampleBoxes: BoundingBoxResult[] = [
  { box: { x: 0.1, y: 0.05, width: 0.25, height: 0.85 }, coarseLabel: 'furniture', confidence: 0.9 },
];

const sampleClassified: ClassifiedObject[] = [
  {
    boxIndex: 0,
    label: 'IKEA BILLY bookcase',
    category: 'living room furniture',
    brand: 'IKEA',
    model: 'BILLY',
    colors: ['birch'],
    materials: ['particleboard'],
    condition: 'good',
    estimatedValue: { low: 40, high: 70 },
    description: 'Standard IKEA bookcase',
    confidence: 0.92,
    boundingBox: { x: 0.1, y: 0.05, width: 0.25, height: 0.85 },
  },
];

const testImage = Buffer.from('fake-image-data');

describe('DetectionPipelineService', () => {
  describe('happy path', () => {
    it('should detect and classify when all providers succeed', async () => {
      const detector = makeMockDetector('grounding-dino', sampleBoxes);
      const classifier = makeMockClassifier('gemini', sampleClassified);
      const pipeline = new DetectionPipelineService([detector], [classifier]);

      const result = await pipeline.detect(testImage);

      expect(result.detections).toEqual(sampleClassified);
      expect(result.detector).toBe('grounding-dino');
      expect(result.classifier).toBe('gemini');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(detector.detect).toHaveBeenCalledWith(testImage);
      expect(classifier.classify).toHaveBeenCalledWith(testImage, sampleBoxes);
    });
  });

  describe('detector fallback', () => {
    it('should fall back to secondary detector when primary fails', async () => {
      const primaryDetector = makeMockDetector('grounding-dino', new Error('Primary detector down'));
      const secondaryDetector = makeMockDetector('google-vision', sampleBoxes);
      const classifier = makeMockClassifier('gemini', sampleClassified);

      const pipeline = new DetectionPipelineService(
        [primaryDetector, secondaryDetector],
        [classifier]
      );

      const result = await pipeline.detect(testImage);

      expect(result.detector).toBe('google-vision');
      expect(result.classifier).toBe('gemini');
      expect(result.detections).toEqual(sampleClassified);
      expect(primaryDetector.detect).toHaveBeenCalledOnce();
      expect(secondaryDetector.detect).toHaveBeenCalledOnce();
    });
  });

  describe('classifier fallback', () => {
    it('should fall back to secondary classifier when primary fails', async () => {
      const detector = makeMockDetector('grounding-dino', sampleBoxes);
      const primaryClassifier = makeMockClassifier('gemini', new Error('Gemini API quota exceeded'));
      const secondaryClassifier = makeMockClassifier('ollama', sampleClassified);

      const pipeline = new DetectionPipelineService(
        [detector],
        [primaryClassifier, secondaryClassifier]
      );

      const result = await pipeline.detect(testImage);

      expect(result.detector).toBe('grounding-dino');
      expect(result.classifier).toBe('ollama');
      expect(result.detections).toEqual(sampleClassified);
      expect(primaryClassifier.classify).toHaveBeenCalledOnce();
      expect(secondaryClassifier.classify).toHaveBeenCalledOnce();
    });
  });

  describe('ollama-only mode', () => {
    it('should classify with empty detections when all detectors fail', async () => {
      const failingDetector = makeMockDetector('grounding-dino', new Error('Detector unavailable'));
      const classifier = makeMockClassifier('ollama', sampleClassified);

      const pipeline = new DetectionPipelineService([failingDetector], [classifier]);

      const result = await pipeline.detect(testImage);

      expect(result.detector).toBe('none');
      expect(result.classifier).toBe('ollama');
      expect(result.detections).toEqual(sampleClassified);
      // Classifier called with empty detections array
      expect(classifier.classify).toHaveBeenCalledWith(testImage, []);
    });
  });

  describe('all providers fail', () => {
    it('should throw ServiceUnavailableError when all classification providers fail', async () => {
      const detector = makeMockDetector('grounding-dino', sampleBoxes);
      const failingClassifier = makeMockClassifier('gemini', new Error('All classifiers down'));

      const pipeline = new DetectionPipelineService([detector], [failingClassifier]);

      await expect(pipeline.detect(testImage)).rejects.toThrow(ServiceUnavailableError);
      await expect(pipeline.detect(testImage)).rejects.toThrow('All classification providers failed');
    });
  });

  describe('healthCheck', () => {
    it('should return health status for all providers', async () => {
      const detector = makeMockDetector('grounding-dino', sampleBoxes);
      const classifier = makeMockClassifier('gemini', sampleClassified);
      const pipeline = new DetectionPipelineService([detector], [classifier]);

      const health = await pipeline.healthCheck();

      expect(health).toEqual({ 'grounding-dino': true, gemini: true });
    });
  });
});
