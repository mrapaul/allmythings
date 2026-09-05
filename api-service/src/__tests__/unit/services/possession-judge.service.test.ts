import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PossessionJudge,
  buildJudgePrompt,
  parseJudgeResponse,
} from '../../../services/possession-judge.service';

/**
 * The judge LLM is always mocked: these tests pin the caching, batching and
 * fail-open contracts, not the model's judgement quality.
 */

const BASE_URL = 'http://127.0.0.1:11434';

/** Backend that answers false for anything containing 'wall' or 'person'. */
function okFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (_url: string, init: { body: string }) => {
    const { prompt } = JSON.parse(init.body) as { prompt: string };
    const names = [...prompt.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1] as string);
    return {
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          verdicts: names.map((name) => ({
            name,
            is_possession: !/wall|person/i.test(name),
          })),
        }),
      }),
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

const judge = (
  overrides: Partial<{
    batchSize: number;
    cacheSize: number;
    enabled: boolean;
    failureThreshold: number;
    numCtx: number;
  }> = {},
) =>
  new PossessionJudge({
    baseUrl: BASE_URL,
    model: 'qwen3-vl:30b-a3b-instruct',
    timeoutMs: 500,
    ...overrides,
  });

describe('buildJudgePrompt', () => {
  it('states the rule by contrast and never enumerates objects to exclude', () => {
    const p = buildJudgePrompt(['plaster wall', 'yellow armchair']);
    expect(p).toContain('could carry or move out of the home');
    expect(p).toContain('the ceiling it hangs from is not');
    expect(p).toContain('1. plaster wall');
    expect(p).toContain('2. yellow armchair');
    expect(p).not.toContain('Do NOT include wall, walls, floor');
  });
});

describe('parseJudgeResponse', () => {
  const asked = ['plaster wall', 'yellow armchair'];

  it('reads the array form', () => {
    const out = parseJudgeResponse(
      JSON.stringify({
        verdicts: [
          { name: 'plaster wall', is_possession: false },
          { name: 'yellow armchair', is_possession: true },
        ],
      }),
      asked,
    );
    expect(out.get('plaster wall')).toBe(false);
    expect(out.get('yellow armchair')).toBe(true);
  });

  it('reads the object-map form models sometimes prefer', () => {
    const out = parseJudgeResponse(
      JSON.stringify({ 'plaster wall': false, 'yellow armchair': true }),
      asked,
    );
    expect(out.get('plaster wall')).toBe(false);
    expect(out.get('yellow armchair')).toBe(true);
  });

  it('coerces string booleans and matches names case-insensitively', () => {
    const out = parseJudgeResponse(
      JSON.stringify({ verdicts: [{ name: 'Plaster Wall', is_possession: 'no' }] }),
      asked,
    );
    expect(out.get('plaster wall')).toBe(false);
  });

  it('ignores names that were not asked about and unusable verdicts', () => {
    const out = parseJudgeResponse(
      JSON.stringify({
        verdicts: [
          { name: 'a thing nobody asked about', is_possession: false },
          { name: 'plaster wall', is_possession: 'maybe' },
        ],
      }),
      asked,
    );
    expect(out.size).toBe(0);
  });

  it('returns an empty map for unparseable output', () => {
    expect(parseJudgeResponse('not json', asked).size).toBe(0);
    expect(parseJudgeResponse('', asked).size).toBe(0);
    expect(parseJudgeResponse('null', asked).size).toBe(0);
  });

  it('tolerates markdown fences', () => {
    const out = parseJudgeResponse(
      '```json\n{"verdicts":[{"name":"plaster wall","is_possession":false}]}\n```',
      asked,
    );
    expect(out.get('plaster wall')).toBe(false);
  });
});

describe('PossessionJudge', () => {
  it('judges labels in one call and returns verdicts by normalized label', async () => {
    globalThis.fetch = okFetch() as unknown as typeof globalThis.fetch;
    const out = await judge().judge(['Plaster Wall', 'yellow armchair']);
    expect(out.get('plaster wall')).toBe(false);
    expect(out.get('yellow armchair')).toBe(true);
  });

  it('sends the detector-sized num_ctx so Ollama reuses the loaded runner', async () => {
    const fetchMock = okFetch();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    await judge({ numCtx: 16384 }).judge(['yellow armchair']);
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.options.num_ctx).toBe(16384);
  });

  it('memoizes verdicts per distinct label string', async () => {
    const fetchMock = okFetch();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const j = judge();
    await j.judge(['plaster wall', 'yellow armchair']);
    await j.judge(['PLASTER WALL', 'yellow armchair', 'yellow armchair']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(j.stats()).toMatchObject({ hits: 3, misses: 2, calls: 1 });
  });

  it('batches uncached labels', async () => {
    const fetchMock = okFetch();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const labels = Array.from({ length: 5 }, (_, i) => `thing ${i}`);
    const out = await judge({ batchSize: 2 }).judge(labels);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(out.size).toBe(5);
  });

  it('evicts the least-recently-used verdict past the cache size', async () => {
    const fetchMock = okFetch();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const j = judge({ cacheSize: 2 });
    await j.judge(['a']);
    await j.judge(['b']);
    await j.judge(['a']); // touch 'a'
    await j.judge(['c']); // evicts 'b'
    expect(j.stats().cached).toBe(2);
    await j.judge(['b']);
    expect(j.stats().calls).toBe(4);
  });

  it('fails open (empty map) when the backend errors', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'boom',
      json: async () => ({}),
    })) as unknown as typeof globalThis.fetch;
    expect((await judge().judge(['plaster wall'])).size).toBe(0);
  });

  it('fails open when the backend is unreachable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof globalThis.fetch;
    expect((await judge().judge(['plaster wall'])).size).toBe(0);
  });

  it('fails open when the answer is unparseable', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ response: 'I think the wall is not a possession.' }),
      text: async () => '',
    })) as unknown as typeof globalThis.fetch;
    expect((await judge().judge(['plaster wall'])).size).toBe(0);
  });

  it('mutes itself after consecutive failures and stops calling', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('down');
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const j = judge({ failureThreshold: 2 });
    await j.judge(['a']);
    expect(j.available).toBe(true);
    await j.judge(['b']);
    expect(j.available).toBe(false);
    await j.judge(['c']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never calls the backend when disabled', async () => {
    const fetchMock = okFetch();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const j = judge({ enabled: false });
    expect(j.available).toBe(false);
    expect((await j.judge(['plaster wall'])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a text-only request with no image payload', async () => {
    const fetchMock = okFetch();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    await judge().judge(['plaster wall']);
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    ) as Record<string, unknown>;
    expect(body.images).toBeUndefined();
    expect(body.format).toBe('json');
  });
});
