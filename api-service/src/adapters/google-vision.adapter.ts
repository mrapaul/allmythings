import { ImageAnnotatorClient } from '@google-cloud/vision';
import { ProviderAdapter } from './provider-adapter.interface';
import { Detection, BoundingBox } from '../schemas/detection.schema';
import { CircuitBreaker, CircuitState } from '../utils/circuit-breaker';
import { envConfig } from '../config/env.config';
import { logger } from '../utils/logger';

/**
 * Google Cloud Vision API adapter
 */
export class GoogleVisionAdapter implements ProviderAdapter {
  private client: ImageAnnotatorClient;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.client = new ImageAnnotatorClient({
      projectId: envConfig.googleProjectId,
      keyFilename: envConfig.googleCredentials,
    });

    this.circuitBreaker = new CircuitBreaker('google-vision', {
      failureThreshold: 5,
      resetTimeout: 60000,
      halfOpenRequests: 3,
    });
  }

  async detectObjects(imageBuffer: Buffer): Promise<Detection[]> {
    return this.circuitBreaker.execute(async () => {
      if (!this.client.objectLocalization) {
        logger.error(
          'objectLocalization method not found on Google Vision client'
        );
        return [];
      }
      const [result] = await this.client.objectLocalization({
        image: { content: imageBuffer },
      });

      const detections: Detection[] = [];

      if (result.localizedObjectAnnotations) {
        for (const obj of result.localizedObjectAnnotations) {
          if (obj.name && obj.score && obj.boundingPoly?.normalizedVertices) {
            const vertices = obj.boundingPoly.normalizedVertices;
            const boundingBox = this.normalizeBoundingBox(vertices);

            detections.push({
              id: `google-${Math.random().toString(36).substr(2, 9)}`,
              label: obj.name,
              confidence: obj.score,
              boundingBox,
              ensembleDetails: {
                providerAgreement: 1,
                confidenceByProvider: { google: obj.score },
                labelConsensus: 'single-provider',
              },
              alternativeLabels: [],
            });
          }
        }
      }

      logger.info(
        { detectionsCount: detections.length },
        'Google Vision detection complete'
      );
      return detections;
    });
  }

  private normalizeBoundingBox(vertices: Array<{ x?: number | null; y?: number | null }>): BoundingBox {
    const xs = vertices.map((v) => v.x || 0);
    const ys = vertices.map((v) => v.y || 0);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  health(): Promise<boolean> {
    try {
      // Simple health check - verify client is initialized
      return Promise.resolve(this.circuitBreaker.getState() !== CircuitState.OPEN);
    } catch {
      return Promise.resolve(false);
    }
  }

  getName(): string {
    return 'google';
  }
}
