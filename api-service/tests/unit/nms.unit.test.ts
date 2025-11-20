import { describe, it, expect } from 'vitest';
import { NMSAlgorithm } from '../../src/algorithms/nms.algorithm';

/**
 * T045 [P] [US1] Unit test for NMS algorithm
 *
 * Purpose: Validate Non-Maximum Suppression with overlapping bounding boxes
 *
 * Success Criteria:
 * - Correctly calculates IoU (Intersection over Union)
 * - Merges boxes with IoU > 0.5
 * - Keeps highest confidence detection
 * - Preserves non-overlapping detections
 */

describe('NMS Algorithm Unit Tests', () => {
  it('should calculate IoU correctly for overlapping boxes', () => {
    // Arrange: Two boxes with known overlap
    const box1 = { x: 0.0, y: 0.0, width: 0.4, height: 0.4 }; // Area = 0.16
    const box2 = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 }; // Area = 0.16

    // Intersection: (0.2, 0.2) to (0.4, 0.4) = 0.2 × 0.2 = 0.04
    // Union: 0.16 + 0.16 - 0.04 = 0.28
    // IoU: 0.04 / 0.28 = 0.1428

    // Act
    const iou = NMSAlgorithm.calculateIoU(box1, box2);

    // Assert
    expect(iou).toBeCloseTo(0.1428, 3);
  });

  it('should calculate IoU = 1.0 for identical boxes', () => {
    const box1 = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    const box2 = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };

    const iou = NMSAlgorithm.calculateIoU(box1, box2);

    expect(iou).toBeCloseTo(1.0);
  });

  it('should calculate IoU = 0.0 for non-overlapping boxes', () => {
    const box1 = { x: 0.0, y: 0.0, width: 0.2, height: 0.2 };
    const box2 = { x: 0.5, y: 0.5, width: 0.2, height: 0.2 };

    const iou = NMSAlgorithm.calculateIoU(box1, box2);

    expect(iou).toBe(0.0);
  });

  it('should merge boxes with IoU > 0.5, keeping highest confidence', () => {
    // Arrange: Overlapping detections
    const detections = [
      {
        id: '1',
        label: 'Laptop',
        confidence: 0.92,
        boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      },
      {
        id: '2',
        label: 'Computer',
        confidence: 0.85,
        boundingBox: { x: 0.12, y: 0.22, width: 0.28, height: 0.38 }, // High overlap
      },
    ];

    // Act
    const result = NMSAlgorithm.apply(detections, 0.5);

    // Assert: Should keep only the higher confidence detection
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('1'); // Higher confidence (0.92)
    expect(result[0].label).toBe('Laptop');
  });

  it('should preserve non-overlapping detections', () => {
    // Arrange: Multiple distinct objects
    const detections = [
      {
        id: '1',
        label: 'Laptop',
        confidence: 0.90,
        boundingBox: { x: 0.0, y: 0.0, width: 0.3, height: 0.3 },
      },
      {
        id: '2',
        label: 'Mouse',
        confidence: 0.85,
        boundingBox: { x: 0.6, y: 0.6, width: 0.2, height: 0.2 }, // No overlap
      },
      {
        id: '3',
        label: 'Keyboard',
        confidence: 0.80,
        boundingBox: { x: 0.0, y: 0.6, width: 0.4, height: 0.3 }, // No overlap
      },
    ];

    // Act
    const result = NMSAlgorithm.apply(detections, 0.5);

    // Assert: All detections preserved
    expect(result.length).toBe(3);
  });

  it('should handle multiple overlapping detections correctly', () => {
    // Arrange: 3 detections, 2 overlap with each other but not the 3rd
    const detections = [
      {
        id: '1',
        label: 'Laptop',
        confidence: 0.95,
        boundingBox: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
      },
      {
        id: '2',
        label: 'Computer',
        confidence: 0.90,
        boundingBox: { x: 0.12, y: 0.12, width: 0.28, height: 0.28 }, // Overlaps with #1
      },
      {
        id: '3',
        label: 'Monitor',
        confidence: 0.85,
        boundingBox: { x: 0.6, y: 0.6, width: 0.2, height: 0.2 }, // No overlap
      },
    ];

    // Act
    const result = NMSAlgorithm.apply(detections, 0.5);

    // Assert: Should merge #1 and #2, keep #3
    expect(result.length).toBe(2);
    expect(result.find((d) => d.id === '1')).toBeDefined(); // Highest confidence
    expect(result.find((d) => d.id === '3')).toBeDefined(); // No overlap
    expect(result.find((d) => d.id === '2')).toBeUndefined(); // Merged into #1
  });

  it('should use configurable IoU threshold', () => {
    // Arrange: Slightly overlapping boxes
    const detections = [
      {
        id: '1',
        label: 'Object1',
        confidence: 0.90,
        boundingBox: { x: 0.0, y: 0.0, width: 0.4, height: 0.4 },
      },
      {
        id: '2',
        label: 'Object2',
        confidence: 0.85,
        boundingBox: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 }, // IoU ~ 0.14
      },
    ];

    // Act: Low threshold (merge more aggressively)
    const resultLowThreshold = NMSAlgorithm.apply(detections, 0.1);

    // Act: High threshold (merge less aggressively)
    const resultHighThreshold = NMSAlgorithm.apply(detections, 0.5);

    // Assert: Low threshold merges, high threshold preserves both
    expect(resultLowThreshold.length).toBe(1); // Merged (IoU 0.14 > 0.1)
    expect(resultHighThreshold.length).toBe(2); // Preserved (IoU 0.14 < 0.5)
  });

  it('should handle empty input', () => {
    const result = NMSAlgorithm.apply([], 0.5);
    expect(result).toEqual([]);
  });

  it('should handle single detection', () => {
    const detections = [
      {
        id: '1',
        label: 'Laptop',
        confidence: 0.90,
        boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      },
    ];

    const result = NMSAlgorithm.apply(detections, 0.5);

    expect(result).toEqual(detections);
  });

  it('should handle edge case of boxes with zero area', () => {
    const box1 = { x: 0.1, y: 0.2, width: 0.0, height: 0.0 };
    const box2 = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };

    const iou = NMSAlgorithm.calculateIoU(box1, box2);

    expect(iou).toBe(0.0); // Zero area box has no overlap
  });

  it('should handle boxes at boundaries (0-1 normalized coords)', () => {
    const box1 = { x: 0.0, y: 0.0, width: 1.0, height: 1.0 }; // Full image
    const box2 = { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }; // Quarter image

    const iou = NMSAlgorithm.calculateIoU(box1, box2);

    // Intersection: 0.5 × 0.5 = 0.25
    // Union: 1.0 (box1 contains box2)
    // IoU: 0.25 / 1.0 = 0.25
    expect(iou).toBe(0.25);
  });
});
