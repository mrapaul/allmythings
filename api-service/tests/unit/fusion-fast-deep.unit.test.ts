import { describe, it, expect } from 'vitest';
import { EnsembleFusionService } from '../../src/services/ensemble-fusion.service';
import { ClassifiedObject } from '../../src/providers/classifier.interface';

function makeObj(overrides: Partial<ClassifiedObject> & { label: string }): ClassifiedObject {
  return {
    boxIndex: 0,
    category: 'Furniture',
    brand: null,
    model: null,
    colors: [],
    materials: [],
    condition: null,
    estimatedValue: null,
    description: null,
    confidence: 0.8,
    boundingBox: { x: 0.1, y: 0.2, width: 0.1, height: 0.1 },
    ...overrides,
  };
}

interface FastPassDetection {
  label: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

describe('EnsembleFusionService.fuseFastAndDeep', () => {
  const service = new EnsembleFusionService();

  it('should match fast and deep detections by proximity + label', () => {
    const fast: FastPassDetection[] = [
      { label: 'lamp', confidence: 0.85, boundingBox: { x: 0.5, y: 0.3, width: 0.1, height: 0.15 } },
    ];
    const deep: ClassifiedObject[] = [
      makeObj({ label: 'brass floor lamp', boundingBox: { x: 0.52, y: 0.32, width: 0.08, height: 0.12 }, confidence: 0.9 }),
    ];

    const result = service.fuseFastAndDeep(fast, deep);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('brass floor lamp');
    expect(result[0].boundingBox).toEqual(fast[0].boundingBox);
    expect(result[0].source).toBe('matched');
  });

  it('should keep deep-only objects with VLM bounding box', () => {
    const fast: FastPassDetection[] = [];
    const deep: ClassifiedObject[] = [
      makeObj({ label: 'painting', boundingBox: { x: 0.3, y: 0.1, width: 0.2, height: 0.3 } }),
    ];

    const result = service.fuseFastAndDeep(fast, deep);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('deep_only');
    expect(result[0].boundingBox).toEqual(deep[0].boundingBox);
  });

  it('should keep fast-only objects with null attributes', () => {
    const fast: FastPassDetection[] = [
      { label: 'chair', confidence: 0.75, boundingBox: { x: 0.7, y: 0.6, width: 0.1, height: 0.15 } },
    ];
    const deep: ClassifiedObject[] = [];

    const result = service.fuseFastAndDeep(fast, deep);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('fast_only');
    expect(result[0].label).toBe('chair');
    expect(result[0].colors).toEqual([]);
    expect(result[0].materials).toEqual([]);
  });

  it('should return union of all detections (no drops)', () => {
    const fast: FastPassDetection[] = [
      { label: 'lamp', confidence: 0.85, boundingBox: { x: 0.5, y: 0.3, width: 0.1, height: 0.15 } },
      { label: 'chair', confidence: 0.75, boundingBox: { x: 0.1, y: 0.8, width: 0.15, height: 0.15 } },
    ];
    const deep: ClassifiedObject[] = [
      makeObj({ label: 'floor lamp', boundingBox: { x: 0.52, y: 0.32, width: 0.08, height: 0.12 } }),
      makeObj({ label: 'vase', boundingBox: { x: 0.8, y: 0.1, width: 0.05, height: 0.08 } }),
    ];

    const result = service.fuseFastAndDeep(fast, deep);
    expect(result).toHaveLength(3);
  });
});
