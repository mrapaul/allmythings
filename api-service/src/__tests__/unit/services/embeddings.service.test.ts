import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EmbeddingsService,
  cosineSimilarity,
  normalizeText,
} from '../../../services/embeddings.service';

/**
 * The embedding backend is always mocked here: these tests pin the caching,
 * batching and never-throw contracts, not model quality.
 */

const BASE_URL = 'http://127.0.0.1:11434';

/** Deterministic pseudo-vector so identical text always embeds identically. */
function vectorFor(text: string): number[] {
  const dims = 8;
  const out = new Array(dims).fill(0);
  for (let i = 0; i < text.length; i++) {
    out[i % dims] = (out[i % dims] as number) + text.charCodeAt(i) / 100;
  }
  return out;
}

function okFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (_url: string, init: { body: string }) => {
    const { input } = JSON.parse(init.body) as { input: string[] };
    return {
      ok: true,
      json: async () => ({ embeddings: input.map(vectorFor) }),
      text: async () => '',
    };
  });
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const service = (overrides: Partial<{ batchSize: number; cacheSize: number; enabled: boolean; failureThreshold: number }> = {}) =>
  new EmbeddingsService({
    baseUrl: BASE_URL,
    model: 'nomic-embed-text:v1.5',
    timeoutMs: 500,
    ...overrides,
  });

describe('normalizeText', () => {
  it('collapses case and whitespace so repeated labels share a cache key', () => {
    expect(normalizeText('  Framed   PAINTING ')).toBe('framed painting');
    expect(normalizeText('framed painting')).toBe(normalizeText('Framed Painting'));
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors and 0 for orthogonal ones', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('returns 0 rather than NaN for empty, mismatched or zero vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('EmbeddingsService', () => {
  it('embeds texts and keys the result by normalized text', async () => {
    globalThis.fetch = okFetch() as unknown as typeof globalThis.fetch;
    const svc = service();
    const out = await svc.embed(['Framed Painting', 'snake plant']);
    expect(out.get('framed painting')).toEqual(vectorFor('framed painting'));
    expect(out.get('snake plant')).toBeDefined();
  });

  it('serves repeats from the LRU cache without another model call', async () => {
    const fetchMock = okFetch();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const svc = service();
    await svc.embed(['framed painting', 'snake plant']);
    await svc.embed(['FRAMED PAINTING', 'snake plant']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(svc.stats()).toMatchObject({ hits: 2, misses: 2, calls: 1 });
  });

  it('de-duplicates within one call', async () => {
    const fetchMock = okFetch();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    await service().embed(['book', 'book', 'Book']);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body) as {
      input: string[];
    };
    expect(body.input).toEqual(['book']);
  });

  it('splits large inputs into batches', async () => {
    const fetchMock = okFetch();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const texts = Array.from({ length: 7 }, (_, i) => `item ${i}`);
    const out = await service({ batchSize: 3 }).embed(texts);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(out.size).toBe(7);
  });

  it('evicts the least-recently-used entry past the cache size', async () => {
    const fetchMock = okFetch();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const svc = service({ cacheSize: 2 });
    await svc.embed(['a']);
    await svc.embed(['b']);
    await svc.embed(['a']); // touch 'a' so 'b' becomes the eviction victim
    await svc.embed(['c']);
    expect(svc.stats().cached).toBe(2);
    await svc.embed(['b']);
    expect(svc.stats().calls).toBe(4); // 'b' had to be re-fetched
  });

  it('returns an empty map instead of throwing when the backend errors', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'boom',
      json: async () => ({}),
    })) as unknown as typeof globalThis.fetch;
    const out = await service().embed(['sofa']);
    expect(out.size).toBe(0);
  });

  it('returns an empty map instead of throwing when the backend is unreachable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof globalThis.fetch;
    const out = await service().embed(['sofa']);
    expect(out.size).toBe(0);
  });

  it('tolerates a response whose vector count does not match the input', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embeddings: [[1, 2, 3]] }),
      text: async () => '',
    })) as unknown as typeof globalThis.fetch;
    const out = await service().embed(['sofa', 'lamp']);
    expect(out.size).toBe(0);
  });

  it('mutes the backend after consecutive failures and stops calling it', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const svc = service({ failureThreshold: 2 });
    await svc.embed(['a']);
    expect(svc.available).toBe(true);
    await svc.embed(['b']);
    expect(svc.available).toBe(false);
    await svc.embed(['c']);
    expect(fetchMock).toHaveBeenCalledTimes(2); // third call short-circuited
  });

  it('never calls the backend when disabled', async () => {
    const fetchMock = okFetch();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const svc = service({ enabled: false });
    expect(svc.available).toBe(false);
    expect((await svc.embed(['sofa'])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('embedOne returns null when unavailable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof globalThis.fetch;
    expect(await service().embedOne('sofa')).toBeNull();
  });

  it('ignores blank texts', async () => {
    const fetchMock = okFetch();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    expect((await service().embed(['', '   '])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
