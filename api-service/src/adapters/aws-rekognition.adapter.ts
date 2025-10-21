import {
  RekognitionClient,
  DetectLabelsCommand,
} from '@aws-sdk/client-rekognition';
import { ProviderAdapter } from './provider-adapter.interface';
import { Detection, BoundingBox } from '../schemas/detection.schema';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { envConfig } from '../config/env.config';
import { logger } from '../utils/logger';

/**
 * AWS Rekognition adapter
 */
export class AWSRekognitionAdapter implements ProviderAdapter {
  private client: RekognitionClient;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.client = new RekognitionClient({
      region: envConfig.awsRegion,
      credentials: envConfig.awsAccessKeyId
        ? {
            accessKeyId: envConfig.awsAccessKeyId,
            secretAccessKey: envConfig.awsSecretAccessKey!,
          }
        : undefined,
    });

    this.circuitBreaker = new CircuitBreaker('aws-rekognition', {
      failureThreshold: 5,
      resetTimeout: 60000,
      halfOpenRequests: 3,
    });
  }

  async detectObjects(imageBuffer: Buffer): Promise<Detection[]> {
    return this.circuitBreaker.execute(async () => {
      const command = new DetectLabelsCommand({
        Image: { Bytes: imageBuffer },
        MaxLabels: 50,
        MinConfidence: envConfig.ensembleConfidenceThreshold * 100,
      });

      const result = await this.client.send(command);
      const detections: Detection[] = [];

      if (result.Labels) {
        for (const label of result.Labels) {
          if (label.Name && label.Confidence && label.Instances) {
            for (const instance of label.Instances) {
              if (instance.BoundingBox) {
                const boundingBox: BoundingBox = {
                  x: instance.BoundingBox.Left || 0,
                  y: instance.BoundingBox.Top || 0,
                  width: instance.BoundingBox.Width || 0,
                  height: instance.BoundingBox.Height || 0,
                };

                detections.push({
                  id: `aws-${Math.random().toString(36).substr(2, 9)}`,
                  label: label.Name,
                  confidence: (label.Confidence || 0) / 100,
                  boundingBox,
                  ensembleDetails: {
                    providerAgreement: 1,
                    confidenceByProvider: { aws: (label.Confidence || 0) / 100 },
                    labelConsensus: 'single-provider',
                  },
                  alternativeLabels: [],
                });
              }
            }
          }
        }
      }

      logger.info(
        { detectionsCount: detections.length },
        'AWS Rekognition detection complete'
      );
      return detections;
    });
  }

  async health(): Promise<boolean> {
    try {
      return this.circuitBreaker.getState() !== 'open';
    } catch {
      return false;
    }
  }

  getName(): string {
    return 'aws';
  }
}
