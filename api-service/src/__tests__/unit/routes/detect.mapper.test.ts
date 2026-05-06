import { describe, expect, it } from 'vitest';
import { mapPipelineDetectionToItem, mapSceneToItems } from '../../../routes/detect.mapper';
import type { PipelineDetection, SceneObservation } from '../../../types/pipeline';

const baseDetection: PipelineDetection = {
  id: 'd1',
  bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  primaryLabel: 'Sofa',
  alternateLabels: [
    { label: 'Couch', confidence: 0.7 },
    { label: 'Loveseat', confidence: 0.4 },
  ],
  vlmStructuredAttributes: {
    description: 'Brown leather two-seater',
    category: 'Furniture',
    color: 'brown',
    material: 'leather',
    style: 'modern',
  },
  agreementScore: 0.9,
  contributingSignals: [],
  confidence: 0.85,
};

describe('mapPipelineDetectionToItem', () => {
  it('maps primaryLabel + box and harvests tags from VLM attributes', () => {
    const item = mapPipelineDetectionToItem(baseDetection);
    expect(item.label).toBe('Sofa');
    expect(item.description).toBe('Brown leather two-seater');
    expect(item.category).toBe('Furniture');
    expect(item.box).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    expect(item.tags).toEqual(expect.arrayContaining(['brown', 'leather', 'modern']));
    expect(item.tags).not.toContain('Brown leather two-seater');
    expect(item.tags).not.toContain('Furniture');
  });

  it('falls back to "Unknown" category when VLM omits it', () => {
    const d: PipelineDetection = {
      ...baseDetection,
      vlmStructuredAttributes: { color: 'red' },
    };
    expect(mapPipelineDetectionToItem(d).category).toBe('Unknown');
  });

  it('produces empty description when VLM omits it', () => {
    const d: PipelineDetection = {
      ...baseDetection,
      vlmStructuredAttributes: { category: 'X' },
    };
    expect(mapPipelineDetectionToItem(d).description).toBe('');
  });

  it('limits tag count to 8', () => {
    const d: PipelineDetection = {
      ...baseDetection,
      vlmStructuredAttributes: {
        description: 'd',
        category: 'c',
        color: 'a',
        material: 'b',
        style: 'c',
        room: 'd',
        subcategory: 'e',
        condition: 'f',
        size: 'g',
        brand: 'h',
        extra1: 'i',
        extra2: 'j',
      },
    };
    expect(mapPipelineDetectionToItem(d).tags.length).toBeLessThanOrEqual(8);
  });

  it('mapSceneToItems maps every detection in order', () => {
    const scene: SceneObservation = {
      sceneId: 's',
      runId: 'r',
      frameIds: ['f1'],
      detections: [baseDetection, { ...baseDetection, id: 'd2', primaryLabel: 'Chair' }],
      agreementCoverage: 1,
      agreementPrecision: 1,
      selfDiagnosisTriggered: false,
      rerunDepth: 0,
      flagged: false,
      processingMs: 10,
      errors: [],
      tileErrors: [],
    };
    const items = mapSceneToItems(scene);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.label)).toEqual(['Sofa', 'Chair']);
  });
});
