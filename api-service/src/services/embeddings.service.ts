import { logger } from '../utils/logger';

/**
 * Text-embedding client (Ollama `/api/embed`).
 *
 * Exists so the detection pipeline can ask "do these two labels name the same
 * kind of thing?" and "is this label a possession or part of the building?"
 * without any hardcoded vocabulary of home objects. Callers embed a batch of
 * labels once per pass and then do cheap synchronous cosine comparisons.
 *
 * Two properties matter more than raw quality here:
 *  1. Caching — detection labels repeat constantly ("framed painting",
 *     "white ceramic planter", "snake plant" recur across passes, tiles and
 *     requests), so an LRU keyed on the normalized text keeps the hit rate high
 *     and the model calls rare.
 *  2. Graceful degradation — an embedding outage must never fail a detection.
 *     Every failure path returns *fewer* vectors instead of throwing, and
 *     callers fall back to exact/token matching when a vector is missing.
 */

export type Embedding = readonly number[];

export interface EmbeddingsServiceOptions {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  /** Max distinct texts retained in the LRU cache. */
  cacheSize?: number;
  /** Max texts sent in a single /api/embed call. */
  batchSize?: number;
  /** Consecutive failures that mute the backend. */
  failureThreshold?: number;
  /** How long the backend stays muted after tripping the threshold. */
  cooldownMs?: number;
  /** Escape hatch: false disables all embedding calls (pure fallback mode). */
  enabled?: boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_SIZE = 4_000;
const DEFAULT_BATCH_SIZE = 64;
const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 60_000;

export interface EmbeddingsStats {
  hits: number;
  misses: number;
  calls: number;
  failures: number;
  cached: number;
  muted: boolean;
}

/** Cache/compare key: case- and whitespace-insensitive, punctuation preserved. */
export function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Cosine similarity in [-1, 1]; 0 when either vector is empty or zero-length. */
export function cosineSimilarity(a: Embedding, b: Embedding): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

interface OllamaEmbedResponse {
  embeddings?: number[][];
  error?: string;
}

export class EmbeddingsService {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly cacheSize: number;
  private readonly batchSize: number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly enabled: boolean;

  /** Insertion-ordered Map used as an LRU: oldest key is evicted first. */
  private readonly cache = new Map<string, Embedding>();
  private consecutiveFailures = 0;
  private mutedUntil = 0;
  private hits = 0;
  private misses = 0;
  private calls = 0;
  private failures = 0;

  constructor(opts: EmbeddingsServiceOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cacheSize = opts.cacheSize ?? DEFAULT_CACHE_SIZE;
    this.batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
    this.failureThreshold = opts.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.enabled = opts.enabled ?? true;
  }

  get modelName(): string {
    return this.model;
  }

  /** False while the backend is muted after repeated failures, or when disabled. */
  get available(): boolean {
    return this.enabled && Date.now() >= this.mutedUntil;
  }

  stats(): EmbeddingsStats {
    return {
      hits: this.hits,
      misses: this.misses,
      calls: this.calls,
      failures: this.failures,
      cached: this.cache.size,
      muted: !this.available,
    };
  }

  /**
   * Embed every text, returning a map keyed by normalized text. Cached texts
   * cost nothing; the rest are fetched in batches. Texts whose vectors could
   * not be obtained are simply absent from the map — never an exception.
   */
  async embed(texts: readonly string[]): Promise<Map<string, Embedding>> {
    const out = new Map<string, Embedding>();
    const pending: string[] = [];
    for (const raw of texts) {
      const key = normalizeText(raw);
      if (!key) continue;
      const cached = this.touch(key);
      if (cached) {
        this.hits += 1;
        out.set(key, cached);
      } else if (!out.has(key) && !pending.includes(key)) {
        this.misses += 1;
        pending.push(key);
      }
    }
    if (pending.length === 0 || !this.available) {
      if (pending.length > 0) {
        logger.debug(
          { pending: pending.length, model: this.model },
          'embeddings_skipped_backend_muted',
        );
      }
      return out;
    }

    for (let i = 0; i < pending.length; i += this.batchSize) {
      const batch = pending.slice(i, i + this.batchSize);
      const vectors = await this.fetchBatch(batch);
      if (!vectors) break; // backend down — leave the rest unembedded
      batch.forEach((key, idx) => {
        const vec = vectors[idx];
        if (!vec || vec.length === 0) return;
        this.store(key, vec);
        out.set(key, vec);
      });
    }
    return out;
  }

  /** Convenience single-text form. Returns null when unavailable. */
  async embedOne(text: string): Promise<Embedding | null> {
    const map = await this.embed([text]);
    return map.get(normalizeText(text)) ?? null;
  }

  private touch(key: string): Embedding | undefined {
    const hit = this.cache.get(key);
    if (!hit) return undefined;
    // Re-insert to mark as most-recently-used.
    this.cache.delete(key);
    this.cache.set(key, hit);
    return hit;
  }

  private store(key: string, vec: Embedding): void {
    this.cache.set(key, vec);
    while (this.cache.size > this.cacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  /** One /api/embed call. Returns null on any failure (never throws). */
  private async fetchBatch(batch: string[]): Promise<number[][] | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    this.calls += 1;
    try {
      const resp = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, input: batch }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return this.onFailure(`HTTP ${resp.status}: ${text.slice(0, 160)}`);
      }
      const data = (await resp.json()) as OllamaEmbedResponse;
      if (data.error) return this.onFailure(data.error);
      if (!Array.isArray(data.embeddings) || data.embeddings.length !== batch.length) {
        return this.onFailure(
          `unexpected shape: got ${Array.isArray(data.embeddings) ? data.embeddings.length : 'none'} for ${batch.length} inputs`,
        );
      }
      this.consecutiveFailures = 0;
      logger.debug({ count: batch.length, model: this.model }, 'embeddings_batch_ok');
      return data.embeddings;
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? `timed out after ${this.timeoutMs}ms`
          : err instanceof Error
            ? err.message
            : 'unknown error';
      return this.onFailure(message);
    } finally {
      clearTimeout(timer);
    }
  }

  private onFailure(reason: string): null {
    this.failures += 1;
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.mutedUntil = Date.now() + this.cooldownMs;
      this.consecutiveFailures = 0;
      logger.warn(
        { model: this.model, reason, cooldownMs: this.cooldownMs },
        'embeddings_backend_muted',
      );
    } else {
      logger.warn({ model: this.model, reason }, 'embeddings_request_failed');
    }
    return null;
  }
}
