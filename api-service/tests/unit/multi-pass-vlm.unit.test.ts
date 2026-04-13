import { describe, it, expect, vi } from 'vitest';
import { MultiPassVlmClassifier, deduplicateObjects, cropQuadrant, jaccardSimilarity } from '../../src/services/multi-pass-vlm.classifier';
import { ClassifiedObject } from '../../src/providers/classifier.interface';

vi.mock('sharp', () => {
  const sharpInstance = {
    metadata: vi.fn().mockResolvedValue({ width: 100, height: 100 }),
    extract: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.alloc(10)),
  };
  return { default: vi.fn().mockReturnValue(sharpInstance) };
});

function makeObj(overrides: Partial<ClassifiedObject> = {}): ClassifiedObject {
  return {
    boxIndex: 0,
    label: 'lamp',
    category: 'Lighting',
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

describe('jaccardSimilarity', () => {
  it('should return 1.0 for identical labels', () => {
    expect(jaccardSimilarity('table lamp', 'table lamp')).toBe(1.0);
  });

  it('should return > 0.3 for overlapping labels', () => {
    expect(jaccardSimilarity('ceramic lamp', 'lamp')).toBeGreaterThan(0.3);
  });

  it('should return 0.0 for completely different labels', () => {
    expect(jaccardSimilarity('lamp', 'plant')).toBe(0.0);
  });

  it('should be case-insensitive', () => {
    expect(jaccardSimilarity('Table Lamp', 'table lamp')).toBe(1.0);
  });
});

describe('deduplicateObjects', () => {
  it('should merge spatially close objects with similar labels', () => {
    const objects = [
      makeObj({ label: 'table lamp', boundingBox: { x: 0.5, y: 0.3, width: 0.1, height: 0.15 }, confidence: 0.9 }),
      makeObj({ label: 'lamp', boundingBox: { x: 0.52, y: 0.32, width: 0.08, height: 0.12 }, confidence: 0.7 }),
    ];
    const result = deduplicateObjects(objects);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.9);
  });

  it('should keep spatially distant objects even with same label', () => {
    const objects = [
      makeObj({ label: 'chair', boundingBox: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 } }),
      makeObj({ label: 'chair', boundingBox: { x: 0.8, y: 0.8, width: 0.1, height: 0.1 } }),
    ];
    const result = deduplicateObjects(objects);
    expect(result).toHaveLength(2);
  });

  it('should keep spatially close objects with different labels', () => {
    const objects = [
      makeObj({ label: 'lamp', boundingBox: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 } }),
      makeObj({ label: 'vase', boundingBox: { x: 0.52, y: 0.52, width: 0.08, height: 0.08 } }),
    ];
    const result = deduplicateObjects(objects);
    expect(result).toHaveLength(2);
  });
});

describe('cropQuadrant', () => {
  it('should return correct crop coords for top-left with 55% overlap', () => {
    const crop = cropQuadrant('top-left', 1000, 800, 0.55);
    expect(crop).toEqual({ x: 0, y: 0, width: 550, height: 440 });
  });

  it('should return correct crop coords for bottom-right', () => {
    const crop = cropQuadrant('bottom-right', 1000, 800, 0.55);
    expect(crop).toEqual({ x: 450, y: 360, width: 550, height: 440 });
  });
});

describe('MultiPassVlmClassifier primary selection', () => {
  const config = { multiPassQuadrantOverlap: 0.55, multiPassRetryThreshold: 2 } as any;

  function makeClassifier(name: string, results: ClassifiedObject[] = []) {
    return {
      name,
      classify: vi.fn().mockResolvedValue(results),
      generateDetectionPrompt: vi.fn().mockResolvedValue(''),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
  }

  it('uses ollama as primary when available', async () => {
    const ollama = makeClassifier('ollama', [makeObj()]);
    const gemini = makeClassifier('gemini', [makeObj(), makeObj(), makeObj()]);
    const classifier = new MultiPassVlmClassifier([gemini, ollama], config);
    await classifier.detect(Buffer.alloc(10));
    expect(ollama.classify).toHaveBeenCalled();
    expect(gemini.classify).not.toHaveBeenCalled();
  });

  it('falls back to gemini when ollama is not registered', async () => {
    const gemini = makeClassifier('gemini', [makeObj(), makeObj(), makeObj()]);
    const classifier = new MultiPassVlmClassifier([gemini], config);
    await classifier.detect(Buffer.alloc(10));
    expect(gemini.classify).toHaveBeenCalled();
  });

  it('tries secondary (not primary) when primary returns below threshold', async () => {
    const ollama = makeClassifier('ollama', []); // returns 0, below threshold of 2
    const gemini = makeClassifier('gemini', [makeObj()]);
    const classifier = new MultiPassVlmClassifier([ollama, gemini], config);
    await classifier.detect(Buffer.alloc(10));
    expect(ollama.classify).toHaveBeenCalled();
    expect(gemini.classify).toHaveBeenCalled(); // secondary should fire
  });
});
