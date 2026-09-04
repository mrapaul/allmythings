import { apiFetch } from '@/api/client';

/**
 * Semantic query expansion WITHOUT a maintained word list: the server ranks
 * this inventory's own distinct label values against the user's query
 * (POST /v1/vocab/match). Everything about this path is optional —
 * short timeout, per-session cache, silent fallback to FTS-only — so search
 * keeps working offline and while the endpoint does not exist yet.
 */

const MATCH_TIMEOUT_MS = 1_500;
const MIN_SCORE = 0.5;
const MAX_EXPANSIONS = 6;
/** Cap the vocabulary we upload so a huge inventory can't bloat the request. */
const MAX_VOCAB = 400;

interface VocabMatchResponse {
  matches?: Array<{ value?: unknown; score?: unknown }>;
}

/** Session cache: query → expansion values (empty array is a valid answer). */
const cache = new Map<string, string[]>();

/** Test seam — clears the per-session memo. */
export function clearVocabCache(): void {
  cache.clear();
}

/** Keeps only well-formed, confident matches, capped and deduped. */
export function parseVocabMatches(payload: unknown, minScore = MIN_SCORE): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const matches = (payload as VocabMatchResponse).matches;
  if (!Array.isArray(matches)) return [];
  const out: string[] = [];
  for (const match of matches) {
    if (!match || typeof match !== 'object') continue;
    const value = (match as { value?: unknown }).value;
    const score = (match as { score?: unknown }).score;
    if (typeof value !== 'string' || !value.trim()) continue;
    if (typeof score !== 'number' || score < minScore) continue;
    const trimmed = value.trim();
    if (!out.some((v) => v.toLowerCase() === trimmed.toLowerCase())) out.push(trimmed);
    if (out.length >= MAX_EXPANSIONS) break;
  }
  return out;
}

/**
 * Returns semantically related values from `vocabulary`, or [] on any
 * failure (offline, endpoint absent, timeout, malformed payload).
 */
export async function matchVocabulary(query: string, vocabulary: string[]): Promise<string[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed || vocabulary.length === 0) return [];
  const cached = cache.get(trimmed);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MATCH_TIMEOUT_MS);
  try {
    const payload = await apiFetch<unknown>('/v1/vocab/match', {
      method: 'POST',
      body: { query: trimmed, vocabulary: vocabulary.slice(0, MAX_VOCAB) },
      signal: controller.signal,
      // A missing endpoint must fail fast and quietly, not retry.
      retry: 0,
    });
    const expansions = parseVocabMatches(payload);
    cache.set(trimmed, expansions);
    return expansions;
  } catch {
    // Negative-cache so a broken/absent endpoint isn't retried per keystroke.
    cache.set(trimmed, []);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
