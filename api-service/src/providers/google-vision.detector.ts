import { ImageAnnotatorClient } from '@google-cloud/vision';
import { ObjectDetector, BoundingBoxResult } from './detector.interface';
import { EnvConfig } from '../config/env.config';
import { logger } from '../utils/logger';

export class GoogleVisionDetector implements ObjectDetector {
  readonly name = 'google-vision';
  private client: ImageAnnotatorClient;
  private projectId: string;

  constructor(config: EnvConfig) {
    this.projectId = config.googleProjectId;
    this.client = new ImageAnnotatorClient({
      projectId: config.googleProjectId || undefined,
      keyFilename: config.googleCredentials || undefined,
    });
  }

  async detect(image: Buffer): Promise<BoundingBoxResult[]> {
    if (!this.client.objectLocalization) {
      throw new Error('GoogleVisionDetector: objectLocalization method not available');
    }
    const response = await this.client.objectLocalization({ image: { content: image } });
    const result = response[0];
    const annotations = result.localizedObjectAnnotations || [];

    logger.debug({ count: annotations.length }, 'GoogleVisionDetector: received annotations');

    return annotations.map((obj) => {
      const vertices = obj.boundingPoly?.normalizedVertices || [];
      const xs = vertices.map((v) => v.x || 0);
      const ys = vertices.map((v) => v.y || 0);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);

      return {
        box: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        coarseLabel: obj.name || 'object',
        confidence: obj.score || 0,
      };
    });
  }

  async healthCheck(): Promise<boolean> {
    return !!(this.client && this.projectId);
  }
}
