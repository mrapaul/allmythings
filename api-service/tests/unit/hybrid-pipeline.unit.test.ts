import { describe, it, expect, vi } from 'vitest';
import { HybridPipelineService } from '../../src/services/hybrid-pipeline.service';

describe('HybridPipelineService', () => {
  it('calls classifier once with all OWLv2 boxes', async () => {
    const detector = {
      detect: vi.fn().mockResolvedValue([
        { boxIndex: 0, coarseLabel: 'sofa', confidence: 0.5, box: { x: 0, y: 0, width: 0.3, height: 0.3 } },
        { boxIndex: 1, coarseLabel: 'plant', confidence: 0.4, box: { x: 0.5, y: 0.5, width: 0.2, height: 0.2 } },
      ]),
    };
    const classifier = {
      name: 'qwen',
      classify: vi.fn().mockImplementation(async (_img, dets) => dets.map((d: any) => ({
        boxIndex: d.boxIndex ?? 0,
        label: `detailed ${d.coarseLabel}`,
        category: 'Furniture',
        brand: null, model: null, colors: ['brown'], materials: ['wood'],
        condition: 'good', estimatedValue: null, description: null,
        confidence: 0.9,
        boundingBox: d.box,
      }))),
      generateDetectionPrompt: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    const svc = new HybridPipelineService(detector as any, classifier as any);
    const dummyImg = Buffer.from([0xff, 0xd8, 0xff]);
    const out = await svc.detect(dummyImg);
    expect(out).toHaveLength(2);
    expect(detector.detect).toHaveBeenCalledTimes(1);
    expect(classifier.classify).toHaveBeenCalledTimes(1);
    expect(out[0].label).toBe('detailed sofa');
  });

  it('returns empty array when detector returns no boxes', async () => {
    const detector = { detect: vi.fn().mockResolvedValue([]) };
    const classifier = {
      name: 'qwen', classify: vi.fn(), generateDetectionPrompt: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    const svc = new HybridPipelineService(detector as any, classifier as any);
    const out = await svc.detect(Buffer.from([0xff]));
    expect(out).toEqual([]);
    expect(classifier.classify).not.toHaveBeenCalled();
  });
});
