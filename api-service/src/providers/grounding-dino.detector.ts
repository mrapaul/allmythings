import { ObjectDetector, BoundingBoxResult } from './detector.interface';
import { EnvConfig } from '../config/env.config';
import { logger } from '../utils/logger';

export class GroundingDinoDetector implements ObjectDetector {
  readonly name = 'grounding-dino';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly prompt: string;
  private readonly boxThreshold: number;
  private readonly textThreshold: number;

  constructor(config: EnvConfig) {
    this.baseUrl = config.detectionServiceUrl;
    this.timeoutMs = config.detectionTimeoutMs;
    this.prompt = config.detectionPrompt;
    this.boxThreshold = config.detectionBoxThreshold;
    this.textThreshold = config.detectionTextThreshold;
  }

  async detect(image: Buffer): Promise<BoundingBoxResult[]> {
    const formData = new FormData();
    formData.append('file', new Blob([image]), 'image.jpg');
    formData.append('prompt', this.prompt);
    formData.append('box_threshold', String(this.boxThreshold));
    formData.append('text_threshold', String(this.textThreshold));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/detect`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Detection service returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      logger.debug({ count: data.detections?.length }, 'GroundingDinoDetector: received detections');

      return (data.detections || []).map((d: any) => ({
        box: { x: d.box.x, y: d.box.y, width: d.box.w ?? d.box.width, height: d.box.h ?? d.box.height },
        coarseLabel: d.coarse_label || d.label || 'object',
        confidence: d.confidence,
      }));
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
