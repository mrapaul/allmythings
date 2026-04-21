import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichItem } from '../../../../temporal/activities/enrich-item.activity';
import { FlorenceRegion } from '../../../../temporal/shared-types';

describe('enrichItem activity', () => {
  beforeEach(() => vi.restoreAllMocks());

  const region: FlorenceRegion = {
    caption: 'wooden desk lamp',
    x: 0.1, y: 0.2, width: 0.15, height: 0.25,
    regionIndex: 0,
  };

  function mockOllamaOk(json: object) {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: JSON.stringify(json) }),
    } as Response);
  }

  it('returns an EnrichedItem with tier + structured attributes', async () => {
    mockOllamaOk({
      name: 'Brass desk lamp',
      category: 'lighting',
      color: 'gold/brass',
      material: 'metal',
      condition: 'good',
      estimated_value: '40-60 EUR',
      description: 'Modern brass desk lamp with adjustable arm',
      search_tags: ['brass', 'lamp', 'desk'],
    });

    const item = await enrichItem({
      imageBase64: Buffer.from('img').toString('base64'),
      region,
      tier: 'qwen7b',
      model: 'qwen2.5vl:7b',
    });

    expect(item.enrichmentTier).toBe('qwen7b');
    expect(item.label).toBe('Brass desk lamp');
    expect(item.attributes.category).toBe('lighting');
    expect(item.attributes.color).toBe('gold/brass');
    expect(item.bbox.x).toBe(region.x);
    expect(item.regionIndex).toBe(0);
    expect(item.attributes.searchTags).toEqual(expect.arrayContaining(['brass', 'lamp', 'desk']));
  });

  it('throws retryable ApplicationFailure on 5xx from Ollama', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'boom',
    } as Response);

    await expect(enrichItem({
      imageBase64: 'x',
      region,
      tier: 'qwen7b',
      model: 'qwen2.5vl:7b',
    })).rejects.toMatchObject({
      name: 'ApplicationFailure',
      nonRetryable: false,
    });
  });

  it('throws non-retryable error when Ollama response JSON cannot be parsed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: 'not json at all' }),
    } as Response);

    await expect(enrichItem({
      imageBase64: 'x',
      region,
      tier: 'qwen7b',
      model: 'qwen2.5vl:7b',
    })).rejects.toMatchObject({
      name: 'ApplicationFailure',
      type: 'OllamaJsonParseError',
    });
  });

  it('builds florence-only item without calling Ollama when tier is florence-only', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const item = await enrichItem({
      imageBase64: 'x',
      region,
      tier: 'florence-only',
      model: null,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(item.enrichmentTier).toBe('florence-only');
    expect(item.label).toBe('wooden desk lamp');
    expect(item.attributes.category).toBe('household item');
  });
});
