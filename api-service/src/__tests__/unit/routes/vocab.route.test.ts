process.env.NODE_ENV = 'development';

import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { vocabRoute } from '../../../routes/vocab.route';
import { normalizeText, type Embedding, type EmbeddingsService } from '../../../services/embeddings.service';

/**
 * Embeddings are mocked with a small hand-built vector space so ranking is
 * deterministic: axis 0 = "seating"-ness, axis 1 = "lighting"-ness,
 * axis 2 = "plant"-ness.
 */
const SPACE: Record<string, number[]> = {
  couch: [1, 0, 0],
  'navy blue sofa': [0.97, 0.24, 0],
  'wicker armchair': [0.8, 0, 0.6],
  'brass floor lamp': [0, 1, 0],
  'snake plant': [0, 0, 1],
};

function embeddings(overrides: { fail?: boolean } = {}): EmbeddingsService {
  const calls: string[][] = [];
  const svc = {
    modelName: 'fake',
    available: !overrides.fail,
    stats: () => ({ hits: 0, misses: 0, calls: calls.length, failures: 0, cached: 0, muted: false }),
    embed: async (texts: readonly string[]) => {
      calls.push([...texts]);
      const out = new Map<string, Embedding>();
      if (overrides.fail) return out; // backend down: no vectors, no throw
      for (const t of texts) {
        const vec = SPACE[normalizeText(t)];
        if (vec) out.set(normalizeText(t), vec);
      }
      return out;
    },
    embedOne: async () => null,
  } as unknown as EmbeddingsService;
  return svc;
}

async function makeApp(svc: EmbeddingsService | null): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (svc) (app as any).embeddings = svc;
  await app.register(vocabRoute);
  return app;
}

function match(app: FastifyInstance, body: unknown) {
  return app.inject({ method: 'POST', url: '/v1/vocab/match', payload: body as object });
}

describe('POST /v1/vocab/match', () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app.close();
  });

  it('ranks the vocabulary by semantic closeness to the query', async () => {
    app = await makeApp(embeddings());
    const res = await match(app, {
      query: 'couch',
      vocabulary: ['brass floor lamp', 'navy blue sofa', 'wicker armchair', 'snake plant'],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { matches: Array<{ value: string; score: number }> };
    // "navy blue sofa" outranks "wicker armchair"; the lamp and plant fall
    // below the relevance floor entirely — no synonym table involved.
    expect(body.matches.map((m) => m.value)).toEqual(['navy blue sofa', 'wicker armchair']);
    expect(body.matches[0]!.score).toBeGreaterThan(body.matches[1]!.score);
  });

  it('honors the minScore floor and the limit cap', async () => {
    app = await makeApp(embeddings());
    const res = await match(app, {
      query: 'couch',
      vocabulary: ['navy blue sofa', 'wicker armchair'],
      minScore: 0.9,
    });
    expect((res.json() as { matches: unknown[] }).matches).toHaveLength(1);

    const limited = await match(app, {
      query: 'couch',
      vocabulary: ['navy blue sofa', 'wicker armchair'],
      limit: 1,
    });
    expect((limited.json() as { matches: unknown[] }).matches).toHaveLength(1);
  });

  it('de-duplicates the vocabulary case-insensitively', async () => {
    app = await makeApp(embeddings());
    const res = await match(app, {
      query: 'couch',
      vocabulary: ['navy blue sofa', 'Navy Blue Sofa', 'NAVY BLUE SOFA'],
    });
    expect((res.json() as { matches: unknown[] }).matches).toHaveLength(1);
  });

  it('skips vocabulary entries the backend could not embed', async () => {
    app = await makeApp(embeddings());
    const res = await match(app, {
      query: 'couch',
      vocabulary: ['navy blue sofa', 'an item outside the fake vector space'],
    });
    expect((res.json() as { matches: Array<{ value: string }> }).matches.map((m) => m.value)).toEqual(
      ['navy blue sofa'],
    );
  });

  it('degrades to an empty match list when embeddings are unavailable', async () => {
    app = await makeApp(embeddings({ fail: true }));
    const res = await match(app, { query: 'couch', vocabulary: ['navy blue sofa'] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ matches: [], degraded: true });
  });

  it('degrades when no embedding service is wired at all', async () => {
    app = await makeApp(null);
    const res = await match(app, { query: 'couch', vocabulary: ['navy blue sofa'] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ matches: [], degraded: true });
  });

  it('returns an empty result for an empty vocabulary', async () => {
    app = await makeApp(embeddings());
    const res = await match(app, { query: 'couch', vocabulary: [] });
    expect(res.json()).toEqual({ matches: [], degraded: false });
  });

  it('rejects a malformed request', async () => {
    app = await makeApp(embeddings());
    expect((await match(app, { vocabulary: ['sofa'] })).statusCode).toBe(400);
    expect((await match(app, { query: '   ', vocabulary: ['sofa'] })).statusCode).toBe(400);
    expect(
      (await match(app, { query: 'sofa', vocabulary: ['sofa'], limit: 999 })).statusCode,
    ).toBe(400);
  });
});
