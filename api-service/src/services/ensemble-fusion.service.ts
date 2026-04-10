import { ClassifiedObject } from '../providers/classifier.interface';

export interface FastPassDetection {
  label: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface FusedDetection extends ClassifiedObject {
  source: 'matched' | 'fast_only' | 'deep_only';
}

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

  fuseFastAndDeep(fast: FastPassDetection[], deep: ClassifiedObject[]): FusedDetection[] {
    const results: FusedDetection[] = [];
    const matchedFastIndices = new Set<number>();

    for (const deepObj of deep) {
      const bestMatch = this.findBestFastMatch(deepObj, fast, matchedFastIndices);

      if (bestMatch !== null) {
        matchedFastIndices.add(bestMatch.index);
        results.push({
          ...deepObj,
          boundingBox: fast[bestMatch.index].boundingBox,
          source: 'matched',
        });
      } else {
        results.push({ ...deepObj, source: 'deep_only' });
      }
    }

    for (let i = 0; i < fast.length; i++) {
      if (matchedFastIndices.has(i)) continue;
      results.push({
        boxIndex: 0,
        label: fast[i].label,
        category: 'uncategorized',
        brand: null,
        model: null,
        colors: [],
        materials: [],
        condition: null,
        estimatedValue: null,
        description: null,
        confidence: fast[i].confidence,
        boundingBox: fast[i].boundingBox,
        source: 'fast_only',
      });
    }

    return results;
  }

  private findBestFastMatch(
    deepObj: ClassifiedObject,
    fast: FastPassDetection[],
    excludeIndices: Set<number>,
  ): { index: number; score: number } | null {
    let best: { index: number; score: number } | null = null;

    const deepCx = deepObj.boundingBox.x + deepObj.boundingBox.width / 2;
    const deepCy = deepObj.boundingBox.y + deepObj.boundingBox.height / 2;

    for (let i = 0; i < fast.length; i++) {
      if (excludeIndices.has(i)) continue;

      const fastCx = fast[i].boundingBox.x + fast[i].boundingBox.width / 2;
      const fastCy = fast[i].boundingBox.y + fast[i].boundingBox.height / 2;
      const dist = Math.sqrt((deepCx - fastCx) ** 2 + (deepCy - fastCy) ** 2);

      if (dist >= 0.15) continue;

      const labelSim = this.jaccardSimilarity(deepObj.label, fast[i].label);
      if (labelSim < 0.3) continue;

      const score = labelSim * (1 - dist);
      if (!best || score > best.score) {
        best = { index: i, score };
      }
    }

    return best;
  }

  private jaccardSimilarity(a: string, b: string): number {
    const tokensA = new Set(a.toLowerCase().split(/\s+/));
    const tokensB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
    const union = new Set([...tokensA, ...tokensB]);
    if (union.size === 0) return 0;
    return intersection.size / union.size;
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
