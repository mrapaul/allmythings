import { ObjectDetector } from '../providers/detector.interface';
import { ObjectClassifier, ClassifiedObject } from '../providers/classifier.interface';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { EnsembleFusionService, FastPassDetection, FusedDetection } from './ensemble-fusion.service';
import { MultiPassVlmClassifier } from './multi-pass-vlm.classifier';
import { HybridPipelineService } from './hybrid-pipeline.service';
import { withSpan } from '../telemetry/pipeline-tracer';
import { StepResult, isOk, isFail } from '../telemetry/step-result';
import { injectTraceHeaders } from '../telemetry/trace-context';

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
  errors: Array<{ step: string; code: string; message: string; retryable: boolean }>;
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
  hybrid?: HybridPipelineService;
  hybridEnabled?: boolean;
}

export class DetectionPipelineService {
  private fastDetectorUrl: string;
  private multiPassVlm: MultiPassVlmClassifier;
  private fusionService: EnsembleFusionService;
  private detectors: { provider: ObjectDetector; breaker: CircuitBreaker }[];
  private classifiers: { provider: ObjectClassifier; breaker: CircuitBreaker }[];
  private hybrid?: HybridPipelineService;
  private hybridEnabled: boolean;

  constructor(options: PipelineOptions) {
    this.fastDetectorUrl = options.fastDetectorUrl;
    this.multiPassVlm = options.multiPassVlm;
    this.fusionService = new EnsembleFusionService();
    this.hybrid = options.hybrid;
    this.hybridEnabled = !!options.hybridEnabled;

    const breakerOptions = { failureThreshold: 3, resetTimeout: 30000, halfOpenRequests: 2 };
    this.detectors = options.detectors.map((d) => ({ provider: d, breaker: new CircuitBreaker(d.name, breakerOptions) }));
    this.classifiers = options.classifiers.map((c) => ({ provider: c, breaker: new CircuitBreaker(c.name, breakerOptions) }));
  }

  async detectFull(image: Buffer, photoId = 'unknown'): Promise<FullPipelineResult> {
    const start = Date.now();
    const errors: FullPipelineResult['errors'] = [];

    const outer = await withSpan('detection.pipeline', { 'detection.photo_id': photoId }, async () => {
      const [fastRes, deepRes] = await Promise.all([
        this.runFastPass(image, photoId),
        this.runDeepPass(image, photoId),
      ]);

      const fastPass = isOk(fastRes) ? fastRes.value : null;
      if (isFail(fastRes)) errors.push({ step: 'fast_pass', code: fastRes.error.code, message: fastRes.error.message, retryable: fastRes.error.retryable });

      const deepPass = isOk(deepRes) ? deepRes.value : null;
      if (isFail(deepRes)) errors.push({ step: 'deep_pass', code: deepRes.error.code, message: deepRes.error.message, retryable: deepRes.error.retryable });

      const fastDetections = fastPass?.detections ?? [];
      const deepDetections = deepPass?.detections ?? [];
      const fused = this.fusionService.fuseFastAndDeep(fastDetections, deepDetections);

      return { fastPass, deepPass, fused, totalProcessingMs: Date.now() - start, errors };
    });

    if (isOk(outer)) return outer.value;
    return {
      fastPass: null,
      deepPass: null,
      fused: [],
      totalProcessingMs: Date.now() - start,
      errors: [{ step: 'pipeline', code: outer.error.code, message: outer.error.message, retryable: outer.error.retryable }, ...errors],
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

  private async runFastPass(image: Buffer, photoId: string): Promise<StepResult<FastPassResult>> {
    return withSpan('detection.fast_pass', { 'detection.photo_id': photoId }, async () => {
      const start = Date.now();
      const detections = await this.callFastDetector(image);
      return { detections, processingTimeMs: Date.now() - start };
    });
  }

  private async callFastDetector(image: Buffer): Promise<FastPassDetection[]> {
    const headers: Record<string, string> = {};
    injectTraceHeaders(headers);

    const formData = new FormData();
    formData.append('file', new Blob([image], { type: 'image/jpeg' }), 'image.jpg');

    const response = await fetch(`${this.fastDetectorUrl}/detect/fast`, {
      method: 'POST',
      headers,
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

  private async runDeepPass(image: Buffer, photoId: string): Promise<StepResult<DeepPassResult>> {
    return withSpan('detection.deep_pass', { 'detection.photo_id': photoId, 'detection.hybrid': this.hybridEnabled }, async () => {
      const start = Date.now();
      const detections = this.hybridEnabled && this.hybrid
        ? await this.hybrid.detect(image)
        : await this.multiPassVlm.detect(image);
      return {
        detections,
        processingTimeMs: Date.now() - start,
        provider: this.hybridEnabled ? 'hybrid-owlv2-qwen' : 'multi-pass-vlm',
      };
    });
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
