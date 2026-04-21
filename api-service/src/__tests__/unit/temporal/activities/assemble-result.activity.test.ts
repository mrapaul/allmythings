import { describe, it, expect } from 'vitest';
import { assembleResult } from '../../../../temporal/activities/assemble-result.activity';
import { EnrichedItem, SavedPhoto, PipelineError } from '../../../../temporal/shared-types';

describe('assembleResult activity', () => {
  const saved: SavedPhoto = {
    photoId: 'aaa-bbb',
    photoPath: '/tmp/photos/aaa-bbb.jpg',
    thumbnailPath: '/tmp/photos/aaa-bbb_thumb.jpg',
    bytes: 12345,
  };

  const item: EnrichedItem = {
    id: 'item-1',
    regionIndex: 0,
    label: 'lamp',
    confidence: 0.9,
    bbox: { x: 0, y: 0, width: 0.1, height: 0.1 },
    enrichmentTier: 'qwen7b',
    attributes: {
      name: 'lamp', category: 'lighting', color: null, material: null, condition: null,
      estimatedValue: null, description: 'lamp', searchTags: ['lamp'],
    },
  };

  it('builds DetectResult with photoUrl, counts, traceId, processingMs', async () => {
    const result = await assembleResult({
      saved,
      items: [item],
      errors: [],
      traceId: 'trace-abc',
      startedAtMs: Date.now() - 1500,
    });

    expect(result.photoId).toBe('aaa-bbb');
    expect(result.photoUrl).toBe('/photos/aaa-bbb.jpg');
    expect(result.itemCount).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.errors).toEqual([]);
    expect(result.traceId).toBe('trace-abc');
    expect(result.processingMs).toBeGreaterThanOrEqual(1500);
  });

  it('carries forward pipeline errors', async () => {
    const err: PipelineError = {
      step: 'enrich-items', code: 'tier_exhausted', message: 'all tiers failed', retryable: false,
    };
    const result = await assembleResult({
      saved, items: [], errors: [err], traceId: 't', startedAtMs: Date.now(),
    });
    expect(result.errors).toEqual([err]);
    expect(result.itemCount).toBe(0);
  });

  it('processingMs is non-negative even for near-instant calls', async () => {
    const result = await assembleResult({
      saved, items: [], errors: [], traceId: 't', startedAtMs: Date.now(),
    });
    expect(result.processingMs).toBeGreaterThanOrEqual(0);
  });
});
