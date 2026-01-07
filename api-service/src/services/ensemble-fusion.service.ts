import { BoundingBox, Detection } from '../schemas/detection.schema';
import { NMSAlgorithm } from '../algorithms/nms.algorithm';
import { envConfig } from '../config/env.config';
import { logger } from '../utils/logger';

/**
 * Ensemble fusion service - combines results from multiple providers
 */

export class EnsembleFusionService {
  private readonly providerWeights = {
    meta: envConfig.metaWeight,
    google: envConfig.googleWeight,
    aws: envConfig.awsWeight,
    tensorflow: envConfig.tensorflowWeight,
    gemini: envConfig.geminiWeight,
    ollama: envConfig.ollamaWeight,
  };

  /**
   * Fuse detections from multiple providers using ensemble techniques
   */
  fuseDetections(providerDetections: Map<string, Detection[]>): Detection[] {
    // Combine all detections
    const allDetections: Detection[] = [];
    for (const [, detections] of providerDetections) {
      allDetections.push(...detections);
    }

    if (allDetections.length === 0) {
      return [];
    }

    // Apply Non-Maximum Suppression to merge overlapping boxes
    const nmsDetections = NMSAlgorithm.apply(
      allDetections,
      envConfig.nmsIouThreshold
    );

    // Apply confidence fusion with weighted voting
    const fusedDetections = this.applyConfidenceFusion(
      nmsDetections,
      providerDetections
    );

    // Filter by confidence threshold
    const filteredDetections = fusedDetections.filter(
      (d) => d.confidence >= envConfig.ensembleConfidenceThreshold
    );

    logger.info(
      {
        inputDetections: allDetections.length,
        afterNMS: nmsDetections.length,
        afterFusion: fusedDetections.length,
        afterFiltering: filteredDetections.length,
      },
      'Ensemble fusion complete'
    );

    return filteredDetections;
  }

  /**
   * Apply weighted confidence fusion
   */
  private applyConfidenceFusion(
    detections: Detection[],
    providerDetections: Map<string, Detection[]>
  ): Detection[] {
    return detections.map((detection) => {
      const providers = Array.from(providerDetections.keys());
      const confidenceByProvider: Record<string, number> = {};
      let totalWeight = 0;
      let weightedSum = 0;

      for (const provider of providers) {
        const providerDetectionList = providerDetections.get(provider) || [];
        const matchingDetection = providerDetectionList.find(
          (d) =>
            this.isSimilarLabel(d.label, detection.label) &&
            this.isSimilarBoundingBox(d.boundingBox, detection.boundingBox)
        );

        if (matchingDetection) {
          const weight = this.providerWeights[provider as keyof typeof this.providerWeights] || 0.25;
          confidenceByProvider[provider] = matchingDetection.confidence;
          weightedSum += matchingDetection.confidence * weight;
          totalWeight += weight;
        }
      }

      const fusedConfidence = totalWeight > 0 ? weightedSum / totalWeight : detection.confidence;

      return {
        ...detection,
        confidence: fusedConfidence,
        ensembleDetails: {
          providerAgreement: Object.keys(confidenceByProvider).length,
          confidenceByProvider,
          labelConsensus: this.determineLabelConsensus(
            Object.keys(confidenceByProvider).length
          ),
        },
      };
    });
  }

  private isSimilarLabel(label1: string, label2: string): boolean {
    const l1 = label1.toLowerCase();
    const l2 = label2.toLowerCase();
    return l1 === l2 || l1.includes(l2) || l2.includes(l1);
  }

  private isSimilarBoundingBox(box1: BoundingBox, box2: BoundingBox): boolean {
    const threshold = 0.3; // 30% overlap
    const dx = Math.abs(box1.x - box2.x);
    const dy = Math.abs(box1.y - box2.y);
    const dw = Math.abs(box1.width - box2.width);
    const dh = Math.abs(box1.height - box2.height);

    return dx < threshold && dy < threshold && dw < threshold && dh < threshold;
  }

  private determineLabelConsensus(agreement: number): string {
    if (agreement === 4) return 'unanimous';
    if (agreement >= 3) return 'majority';
    if (agreement === 2) return 'split';
    return 'single-provider';
  }

  /**
   * Calculate ensemble metrics
   */
  calculateMetrics(
    detections: Detection[],
    providersUsed: number
  ): {
    providersUsed: number;
    averageConfidence: number;
    consensusRate: number;
  } {
    if (detections.length === 0) {
      return {
        providersUsed,
        averageConfidence: 0,
        consensusRate: 0,
      };
    }

    const avgConfidence =
      detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length;

    const consensusDetections = detections.filter(
      (d) => d.ensembleDetails.providerAgreement >= 2
    );
    const consensusRate = consensusDetections.length / detections.length;

    return {
      providersUsed,
      averageConfidence: avgConfidence,
      consensusRate,
    };
  }
}
