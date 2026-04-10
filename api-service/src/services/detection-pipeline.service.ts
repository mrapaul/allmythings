import { ObjectDetector } from '../providers/detector.interface';
import { ObjectClassifier, ClassifiedObject } from '../providers/classifier.interface';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { logger } from '../utils/logger';
import { EnsembleFusionService, FastPassDetection, FusedDetection } from './ensemble-fusion.service';
import { MultiPassVlmClassifier } from './multi-pass-vlm.classifier';

export interface FastPassResult {
  detections: FastPassDetection[];
  processingTimeMs: number;
}

export interface DeepPassResult {
  detections: ClassifiedObject[];
  processingTimeMs: number;
  provider: string;
}

export interface FullPipelineResult {
  fastPass: FastPassResult | null;
  deepPass: DeepPassResult | null;
  fused: FusedDetection[];
  totalProcessingMs: number;
}

export interface PipelineResult {
  detections: ClassifiedObject[];
  processingTimeMs: number;
  detector: string;
  classifier: string;
  corroborationCount?: number;
}

interface PipelineOptions {
  fastDetectorUrl: string;
  multiPassVlm: MultiPassVlmClassifier;
  classifiers: ObjectClassifier[];
  detectors: ObjectDetector[];
}

export class DetectionPipelineService {
  private fastDetectorUrl: string;
  private multiPassVlm: MultiPassVlmClassifier;
  private fusionService: EnsembleFusionService;
  private detectors: { provider: ObjectDetector; breaker: CircuitBreaker }[];
  private classifiers: { provider: ObjectClassifier; breaker: CircuitBreaker }[];

  constructor(options: PipelineOptions) {
    this.fastDetectorUrl = options.fastDetectorUrl;
    this.multiPassVlm = options.multiPassVlm;
    this.fusionService = new EnsembleFusionService();

    const breakerOptions = { failureThreshold: 3, resetTimeout: 30000, halfOpenRequests: 2 };
    this.detectors = options.detectors.map((d) => ({ provider: d, breaker: new CircuitBreaker(d.name, breakerOptions) }));
    this.classifiers = options.classifiers.map((c) => ({ provider: c, breaker: new CircuitBreaker(c.name, breakerOptions) }));
  }

  async detectFull(image: Buffer): Promise<FullPipelineResult> {
    const start = Date.now();

    const [fastPass, deepPass] = await Promise.all([
      this.runFastPass(image),
      this.runDeepPass(image),
    ]);

    const fastDetections = fastPass?.detections || [];
    const deepDetections = deepPass?.detections || [];
    const fused = this.fusionService.fuseFastAndDeep(fastDetections, deepDetections);

    return {
      fastPass,
      deepPass,
      fused,
      totalProcessingMs: Date.now() - start,
    };
  }

  async detect(image: Buffer): Promise<PipelineResult> {
    const result = await this.detectFull(image);

    return {
      detections: result.fused,
      processingTimeMs: result.totalProcessingMs,
      detector: result.fastPass ? 'yoloe' : 'none',
      classifier: result.deepPass?.provider || 'none',
    };
  }

  private async runFastPass(image: Buffer): Promise<FastPassResult | null> {
    const start = Date.now();
    try {
      const detections = await this.callFastDetector(image);
      return { detections, processingTimeMs: Date.now() - start };
    } catch (error) {
      logger.warn({ error: (error as Error).message }, 'Fast pass failed, continuing with deep pass only');
      return null;
    }
  }

  private async callFastDetector(image: Buffer): Promise<FastPassDetection[]> {
    const formData = new FormData();
    formData.append('file', new Blob([image], { type: 'image/jpeg' }), 'image.jpg');

    const response = await fetch(`${this.fastDetectorUrl}/detect/fast`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Fast detector returned ${response.status}`);
    }

    const data: any = await response.json();
    return (data.detections || []).map((d: any) => ({
      label: d.label,
      confidence: d.confidence,
      boundingBox: {
        x: d.box[0],
        y: d.box[1],
        width: d.box[2],
        height: d.box[3],
      },
    }));
  }

  private async runDeepPass(image: Buffer): Promise<DeepPassResult | null> {
    const start = Date.now();
    try {
      const detections = await this.multiPassVlm.detect(image);
      return {
        detections,
        processingTimeMs: Date.now() - start,
        provider: 'multi-pass-vlm',
      };
    } catch (error) {
      logger.warn({ error: (error as Error).message }, 'Deep pass failed');
      return null;
    }
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
