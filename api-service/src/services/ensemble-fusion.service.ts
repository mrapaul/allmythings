import { ClassifiedObject } from '../providers/classifier.interface';

export interface FusionResult {
  detections: ClassifiedObject[];
  corroborationCount: number;
}

/**
 * Service to merge and corroborat results from multiple AI providers
 */
export class EnsembleFusionService {
  /**
   * Fuse results from multiple providers into a single optimized list
   */
  async fuse(results: Map<string, ClassifiedObject[]>): Promise<FusionResult> {
    const allDetections: Array<{ provider: string; obj: ClassifiedObject }> = [];
    results.forEach((objs, provider) => {
      objs.forEach((obj) => allDetections.push({ provider, obj }));
    });

    if (allDetections.length === 0) {
      return { detections: [], corroborationCount: 0 };
    }

    const fused: ClassifiedObject[] = [];
    const usedIndices = new Set<number>();
    let corroborationCount = 0;

    // Sort by confidence to pick the best anchors first
    allDetections.sort((a, b) => b.obj.confidence - a.obj.confidence);

    for (let i = 0; i < allDetections.length; i++) {
      if (usedIndices.has(i)) continue;

      const base = allDetections[i];
      const cluster = [base];
      usedIndices.add(i);

      // Look for matches from other providers
      for (let j = i + 1; j < allDetections.length; j++) {
        if (usedIndices.has(j)) continue;

        const other = allDetections[j];
        if (base.provider === other.provider) continue; // Don't match same provider

        const iou = this.calculateIoU(base.obj.boundingBox, other.obj.boundingBox);
        
        // If they overlap significantly, they are likely the same object
        if (iou > 0.4) {
          cluster.push(other);
          usedIndices.add(j);
          corroborationCount++;
        }
      }

      // Merge the cluster into a single representative object
      fused.push(this.mergeCluster(cluster));
    }

    return { detections: fused, corroborationCount };
  }

  /**
   * Merge a cluster of corroborated objects into one
   */
  private mergeCluster(cluster: Array<{ provider: string; obj: ClassifiedObject }>): ClassifiedObject {
    if (cluster.length === 1) return cluster[0].obj;

    // Pick the most specific label (usually from Gemini or longest string)
    const geminiMatch = cluster.find((c) => c.provider === 'gemini');
    const bestObj = geminiMatch ? geminiMatch.obj : cluster[0].obj;

    // Calculate average confidence but boost it for corroboration
    const avgConfidence = cluster.reduce((sum, c) => sum + c.obj.confidence, 0) / cluster.length;
    const boostedConfidence = Math.min(0.99, avgConfidence + (cluster.length - 1) * 0.05);

    return {
      ...bestObj,
      confidence: boostedConfidence,
      // Metadata can be combined if needed
    };
  }

  /**
   * Standard Intersection over Union calculation
   */
  private calculateIoU(boxA: { x: number; y: number; width: number; height: number }, boxB: { x: number; y: number; width: number; height: number }): number {
    const xA = Math.max(boxA.x, boxB.x);
    const yA = Math.max(boxA.y, boxB.y);
    const xB = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
    const yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    const boxAArea = boxA.width * boxA.height;
    const boxBArea = boxB.width * boxB.height;

    return interArea / (boxAArea + boxBArea - interArea);
  }
}
