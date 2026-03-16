import { ObjectDetector, BoundingBoxResult } from '../providers/detector.interface';
import { ObjectClassifier, ClassifiedObject } from '../providers/classifier.interface';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { logger } from '../utils/logger';
import { ServiceUnavailableError } from '../utils/errors';
import { EnsembleFusionService } from './ensemble-fusion.service';

export interface PipelineResult {
  detections: ClassifiedObject[];
  processingTimeMs: number;
  detector: string;
  classifier: string;
  corroborationCount?: number;
}

/**
 * Service to coordinate the multi-layered AI detection pipeline
 */
export class DetectionPipelineService {
  private detectors: { provider: ObjectDetector; breaker: CircuitBreaker }[];
  private classifiers: { provider: ObjectClassifier; breaker: CircuitBreaker }[];
  private fusionService: EnsembleFusionService;

  constructor(detectors: ObjectDetector[], classifiers: ObjectClassifier[]) {
    const breakerOptions = {
      failureThreshold: 3,
      resetTimeout: 30000,
      halfOpenRequests: 2,
    };

    this.detectors = detectors.map((d) => ({
      provider: d,
      breaker: new CircuitBreaker(d.name, breakerOptions),
    }));

    this.classifiers = classifiers.map((c) => ({
      provider: c,
      breaker: new CircuitBreaker(c.name, breakerOptions),
    }));

    this.fusionService = new EnsembleFusionService();
  }

  async detect(image: Buffer): Promise<PipelineResult> {
    const start = Date.now();
    
    // Layer 1: Attempt Parallel One-Pass Corroboration
    // We run the best available cloud LLM (Gemini) and the local fallback (Ollama) in parallel
    const providersToRun = this.classifiers.filter(c => 
      (c.provider.name === 'gemini' || c.provider.name === 'ollama') && 
      c.breaker.getState() !== 'open'
    );

    if (providersToRun.length > 0) {
      logger.info({ providers: providersToRun.map(p => p.provider.name) }, 'Starting Parallel Multi-Layered Corroboration');
      
      const resultsMap = new Map<string, ClassifiedObject[]>();
      
      const promises = providersToRun.map(async ({ provider, breaker }) => {
        try {
          const results = await breaker.execute(() => provider.classify(image, []));
          resultsMap.set(provider.name, results);
          return results;
        } catch (error) {
          logger.warn({ provider: provider.name, error: (error as Error).message }, 'Parallel provider failed');
          return [];
        }
      });

      await Promise.all(promises);

      // Fuse results for corroboration
      const fusion = await this.fusionService.fuse(resultsMap);
      
      if (fusion.detections.length > 0) {
        return {
          detections: fusion.detections,
          processingTimeMs: Date.now() - start,
          detector: 'multi-vlm-one-pass',
          classifier: Array.from(resultsMap.keys()).join('+'),
          corroborationCount: fusion.corroborationCount,
        };
      }
    }

    // Layer 2: Sequential Fallback (Original Pipeline)
    logger.info('Multi-layered parallel pass failed or no results, falling back to sequential');
    
    let boxes: BoundingBoxResult[] = [];
    let detectorUsed = 'none';

    // Try detectors (Google Vision, Grounding DINO)
    for (const { provider, breaker } of this.detectors) {
      try {
        boxes = await breaker.execute(() => provider.detect(image));
        detectorUsed = provider.name;
        break;
      } catch (error) {
        logger.warn({ provider: provider.name }, 'Detector failed');
      }
    }

    // Try classifiers sequentially
    for (const { provider, breaker } of this.classifiers) {
      try {
        const detections = await breaker.execute(() => provider.classify(image, boxes));
        if (detections.length > 0) {
          return {
            detections,
            processingTimeMs: Date.now() - start,
            detector: detectorUsed,
            classifier: provider.name,
          };
        }
      } catch (error) {
        logger.warn({ provider: provider.name }, 'Classifier fallback failed');
      }
    }

    throw new ServiceUnavailableError('All AI layers failed to produce results');
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
