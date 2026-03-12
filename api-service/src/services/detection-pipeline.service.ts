import { ObjectDetector, BoundingBoxResult } from '../providers/detector.interface';
import { ObjectClassifier, ClassifiedObject } from '../providers/classifier.interface';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { ServiceUnavailableError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface PipelineResult {
  detections: ClassifiedObject[];
  processingTimeMs: number;
  detector: string;
  classifier: string;
}

export class DetectionPipelineService {
  private detectors: Array<{ provider: ObjectDetector; breaker: CircuitBreaker }>;
  private classifiers: Array<{ provider: ObjectClassifier; breaker: CircuitBreaker }>;

  constructor(detectors: ObjectDetector[], classifiers: ObjectClassifier[]) {
    this.detectors = detectors.map(p => ({
      provider: p,
      breaker: new CircuitBreaker(p.name, { failureThreshold: 3, resetTimeout: 30000, halfOpenRequests: 1 }),
    }));
    this.classifiers = classifiers.map(p => ({
      provider: p,
      breaker: new CircuitBreaker(p.name, { failureThreshold: 3, resetTimeout: 30000, halfOpenRequests: 1 }),
    }));
  }

  async detect(image: Buffer): Promise<PipelineResult> {
    const start = Date.now();
    let boxes: BoundingBoxResult[] = [];
    let detectorUsed = 'none';

    // Stage 1: Try detectors with fallback
    for (const { provider, breaker } of this.detectors) {
      try {
        boxes = await breaker.execute(() => provider.detect(image));
        detectorUsed = provider.name;
        break;
      } catch (error) {
        logger.warn(
          { provider: provider.name, error: (error as Error).message },
          'Detector failed, trying next'
        );
      }
    }

    // Stage 2: Classify (or Ollama-only mode if no detections)
    let classifiedObjects: ClassifiedObject[] = [];
    let classifierUsed = 'none';

    for (const { provider, breaker } of this.classifiers) {
      try {
        classifiedObjects = await breaker.execute(() => provider.classify(image, boxes));
        classifierUsed = provider.name;
        break;
      } catch (error) {
        logger.warn(
          { provider: provider.name, error: (error as Error).message },
          'Classifier failed, trying next'
        );
      }
    }

    if (classifierUsed === 'none') {
      throw new ServiceUnavailableError('All classification providers failed');
    }

    return {
      detections: classifiedObjects,
      processingTimeMs: Date.now() - start,
      detector: detectorUsed,
      classifier: classifierUsed,
    };
  }

  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const { provider } of this.detectors) {
      results[provider.name] = await provider.healthCheck();
    }
    for (const { provider } of this.classifiers) {
      results[provider.name] = await provider.healthCheck();
    }
    return results;
  }
}
