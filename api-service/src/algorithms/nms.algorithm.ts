import { Detection, BoundingBox } from '../schemas/detection.schema';

/**
 * Non-Maximum Suppression (NMS) algorithm
 * Merges overlapping detections based on IoU (Intersection over Union)
 */

export class NMSAlgorithm {
  /**
   * Apply NMS to filter overlapping detections
   * @param detections Array of detections
   * @param iouThreshold IoU threshold (default 0.5)
   * @returns Filtered detections with overlaps merged
   */
  static apply(detections: Detection[], iouThreshold = 0.5): Detection[] {
    if (detections.length === 0) return [];

    // Sort by confidence (descending)
    const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
    const keep: Detection[] = [];

    while (sorted.length > 0) {
      const current = sorted.shift()!;
      keep.push(current);

      // Remove detections with high IoU overlap
      const remaining: Detection[] = [];
      for (const detection of sorted) {
        const iou = this.calculateIoU(current.boundingBox, detection.boundingBox);
        if (iou < iouThreshold) {
          remaining.push(detection);
        }
      }
      sorted.length = 0;
      sorted.push(...remaining);
    }

    return keep;
  }

  /**
   * Calculate Intersection over Union (IoU)
   */
  private static calculateIoU(box1: BoundingBox, box2: BoundingBox): number {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

    if (x2 < x1 || y2 < y1) return 0; // No overlap

    const intersectionArea = (x2 - x1) * (y2 - y1);
    const box1Area = box1.width * box1.height;
    const box2Area = box2.width * box2.height;
    const unionArea = box1Area + box2Area - intersectionArea;

    return intersectionArea / unionArea;
  }
}
