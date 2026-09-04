import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import { cosineSimilarity, normalizeText, type EmbeddingsService } from '../services/embeddings.service';
import { logger } from '../utils/logger';

/**
 * POST /v1/vocab/match — semantic ranking of a client-supplied vocabulary.
 *
 * Lets the app do meaning-based search ("couch" finding the user's "navy blue
 * sofa") without shipping a synonym table it would have to maintain. The
 * vocabulary comes from the caller's own inventory, so nothing about home
 * objects is hardcoded server-side.
 *
 * Fast by construction: the query plus every vocabulary entry go through the
 * shared embedding LRU, so a repeat search over the same inventory costs one
 * short embedding call for the query alone.
 */

const MAX_MATCHES = 25;
const MAX_VOCABULARY = 2_000;
const MAX_TERM_LENGTH = 200;
/**
 * Relevance floor. Calibrated against the same label-pair set as the dedupe
 * thresholds: unrelated home objects score <= 0.51 on average and 0.758 at
 * worst, while genuine synonym pairs start around 0.60. 0.6 keeps recall
 * generous for search (a ranked list tolerates a loose tail far better than a
 * silent merge does) while cutting the obviously-unrelated bulk.
 */
const DEFAULT_MIN_SCORE = 0.6;

const requestSchema = z.object({
  query: z.string().trim().min(1).max(MAX_TERM_LENGTH),
  vocabulary: z.array(z.string().max(MAX_TERM_LENGTH)).max(MAX_VOCABULARY),
  limit: z.number().int().min(1).max(MAX_MATCHES).optional(),
  minScore: z.number().min(-1).max(1).optional(),
});

export interface VocabMatch {
  value: string;
  score: number;
}

export async function vocabRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const embeddings = (app as any).embeddings as EmbeddingsService | undefined;

  app.post(
    '/v1/vocab/match',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Rank a vocabulary against a query by embedding similarity',
        description:
          'Semantic search helper: returns the vocabulary entries closest in meaning to the query, ranked by cosine similarity. Returns an empty match list (not an error) when the embedding backend is unavailable, so callers can fall back to substring search.',
        tags: ['semantics'],
        body: {
          type: 'object',
          required: ['query', 'vocabulary'],
          properties: {
            query: { type: 'string', description: 'Free-text search term' },
            vocabulary: {
              type: 'array',
              items: { type: 'string' },
              description: 'Candidate values to rank, e.g. the user\'s item labels',
            },
            limit: { type: 'integer', minimum: 1, maximum: MAX_MATCHES },
            minScore: { type: 'number', minimum: -1, maximum: 1 },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['matches'],
            properties: {
              matches: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['value', 'score'],
                  properties: {
                    value: { type: 'string' },
                    score: { type: 'number' },
                  },
                },
              },
              degraded: {
                type: 'boolean',
                description: 'True when embeddings were unavailable and no ranking was possible',
              },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = requestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_request', message: parsed.error.message });
      }
      const { query, vocabulary } = parsed.data;
      const limit = parsed.data.limit ?? MAX_MATCHES;
      const minScore = parsed.data.minScore ?? DEFAULT_MIN_SCORE;

      if (!embeddings) {
        return reply.code(200).send({ matches: [], degraded: true });
      }

      const terms = dedupeTerms(vocabulary);
      if (terms.length === 0) {
        return reply.code(200).send({ matches: [], degraded: false });
      }

      const vectors = await embeddings.embed([query, ...terms]);
      const queryVector = vectors.get(normalizeText(query));
      if (!queryVector) {
        logger.warn({ vocabulary: terms.length }, 'vocab_match_degraded');
        return reply.code(200).send({ matches: [], degraded: true });
      }

      const matches: VocabMatch[] = [];
      for (const term of terms) {
        const vector = vectors.get(normalizeText(term));
        if (!vector) continue;
        const score = cosineSimilarity(queryVector, vector);
        if (score < minScore) continue;
        matches.push({ value: term, score: Math.round(score * 1000) / 1000 });
      }
      matches.sort((a, b) => b.score - a.score || a.value.localeCompare(b.value));

      logger.info(
        { query, vocabulary: terms.length, matches: matches.length },
        'vocab_match_complete',
      );
      return reply.code(200).send({ matches: matches.slice(0, limit), degraded: false });
    },
  );
}

/** Keep the caller's original casing but collapse duplicates by cache key. */
function dedupeTerms(vocabulary: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of vocabulary) {
    const key = normalizeText(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(raw.trim());
  }
  return out;
}
