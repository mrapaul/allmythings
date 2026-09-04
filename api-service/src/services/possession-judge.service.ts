import { logger } from '../utils/logger';
import { normalizeText } from './embeddings.service';
import { POSSESSION_RULE_DETAILED } from './vlm-detector.parse';

/**
 * Fallback judge for inventory-ness, used ONLY when the detector model omitted
 * or mangled the `is_possession` flag it was asked for.
 *
 * Why an LLM and not embeddings: classifying a label against an abstract
 * concept ("is this a movable belonging?") was measured to fail with
 * nomic-embed-text — cosine distances to a concept phrase compress into a narrow
 * band with wrong ordering ("car" ranking closer to a household concept than
 * "cup", "elephant" beating "fork"). An LLM asked the same question directly
 * gets it right, so this is a text-only yes/no call over the same Ollama model
 * the detector already uses. Embeddings remain the right tool for the different
 * job of comparing two labels to each other.
 *
 * Cost control:
 *  - one verdict per DISTINCT label string, memoized in an LRU, because labels
 *    repeat constantly across passes, tiles and requests;
 *  - uncached labels are batched into a single call per pass;
 *  - the flag path means this is normally never reached at all (measured: the
 *    production model emitted the flag on 100% of items across the oracle).
 *
 * Fail-open by construction: any outage, timeout, or unparseable answer leaves
 * the label unjudged, and an unjudged label is KEPT. A judge failure must never
 * silently empty someone's inventory.
 */

export interface PossessionJudgeOptions {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  /** Max distinct labels memoized. */
  cacheSize?: number;
  /** Max labels asked about in one call. */
  batchSize?: number;
  /** Consecutive failures that mute the judge. */
  failureThreshold?: number;
  cooldownMs?: number;
  enabled?: boolean;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_CACHE_SIZE = 2_000;
const DEFAULT_BATCH_SIZE = 40;
const DEFAULT_FAILURE_THRESHOLD = 2;
const DEFAULT_COOLDOWN_MS = 120_000;

export interface PossessionJudgeStats {
  hits: number;
  misses: number;
  calls: number;
  failures: number;
  cached: number;
  muted: boolean;
}

interface OllamaGenerateResponse {
  response?: string;
  error?: string;
}

export class PossessionJudge {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly cacheSize: number;
  private readonly batchSize: number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly enabled: boolean;

  /** Insertion-ordered Map used as an LRU of label -> verdict. */
  private readonly cache = new Map<string, boolean>();
  private consecutiveFailures = 0;
  private mutedUntil = 0;
  private hits = 0;
  private misses = 0;
  private calls = 0;
  private failures = 0;

  constructor(opts: PossessionJudgeOptions) {
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

  get available(): boolean {
    return this.enabled && Date.now() >= this.mutedUntil;
  }

  stats(): PossessionJudgeStats {
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
   * Verdicts for the given labels, keyed by normalized label. A label absent
   * from the map was not judged (unknown) — callers must keep such items.
   */
  async judge(labels: readonly string[]): Promise<Map<string, boolean>> {
    const out = new Map<string, boolean>();
    const pending: string[] = [];
    for (const raw of labels) {
      const key = normalizeText(raw);
      if (!key) continue;
      const cached = this.touch(key);
      if (cached !== undefined) {
        this.hits += 1;
        out.set(key, cached);
      } else if (!pending.includes(key)) {
        this.misses += 1;
        pending.push(key);
      }
    }
    if (pending.length === 0 || !this.available) return out;

    for (let i = 0; i < pending.length; i += this.batchSize) {
      const batch = pending.slice(i, i + this.batchSize);
      const verdicts = await this.askBatch(batch);
      if (!verdicts) break; // judge down — leave the rest unjudged (kept)
      for (const [key, verdict] of verdicts) {
        this.store(key, verdict);
        out.set(key, verdict);
      }
    }
    return out;
  }

  private touch(key: string): boolean | undefined {
    if (!this.cache.has(key)) return undefined;
    const hit = this.cache.get(key) as boolean;
    this.cache.delete(key);
    this.cache.set(key, hit);
    return hit;
  }

  private store(key: string, verdict: boolean): void {
    this.cache.set(key, verdict);
    while (this.cache.size > this.cacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  /** One text-only classification call. Returns null on any failure. */
  private async askBatch(batch: string[]): Promise<Map<string, boolean> | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    this.calls += 1;
    try {
      const resp = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: buildJudgePrompt(batch),
          stream: false,
          format: 'json',
          options: { temperature: 0 },
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return this.onFailure(`HTTP ${resp.status}: ${text.slice(0, 160)}`);
      }
      const data = (await resp.json()) as OllamaGenerateResponse;
      if (data.error) return this.onFailure(data.error);
      const verdicts = parseJudgeResponse(data.response ?? '', batch);
      if (verdicts.size === 0) return this.onFailure('no usable verdicts in response');
      this.consecutiveFailures = 0;
      logger.info(
        { asked: batch.length, judged: verdicts.size, model: this.model },
        'possession_judge_batch_ok',
      );
      return verdicts;
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
        'possession_judge_muted',
      );
    } else {
      logger.warn({ model: this.model, reason }, 'possession_judge_failed_open');
    }
    return null;
  }
}

/**
 * Text-only prompt. Reuses the detector's own long-form definition so the judge
 * and the vision pass are held to one standard, stated as a principle with
 * contrasts rather than as a list of objects.
 */
export function buildJudgePrompt(labels: readonly string[]): string {
  return `You are auditing names of things seen in a photo of someone's home, for a home inventory.

${POSSESSION_RULE_DETAILED}

For EACH name below, output true if it is a possession and false if it is not.

Names:
${labels.map((l, i) => `${i + 1}. ${l}`).join('\n')}

Return ONLY valid JSON, no markdown and no explanation, mapping every name above to its boolean verdict:
{"verdicts": [{"name": "<the name exactly as given>", "is_possession": true}, ...]}`;
}

/**
 * Read verdicts back, accepting both the array form asked for and the object
 * map form models sometimes prefer. Only names we actually asked about are kept,
 * matched on the normalized string.
 */
export function parseJudgeResponse(
  raw: string,
  asked: readonly string[],
): Map<string, boolean> {
  const out = new Map<string, boolean>();
  const wanted = new Set(asked.map(normalizeText));
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim().replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, ''));
  } catch {
    return out;
  }
  if (parsed === null || typeof parsed !== 'object') return out;
  const body = (parsed as Record<string, unknown>).verdicts ?? parsed;

  const record = (name: unknown, verdict: unknown): void => {
    if (typeof name !== 'string') return;
    const key = normalizeText(name);
    if (!wanted.has(key)) return;
    const value = coerceBoolean(verdict);
    if (value !== null) out.set(key, value);
  };

  if (Array.isArray(body)) {
    for (const entry of body) {
      if (entry === null || typeof entry !== 'object') continue;
      const o = entry as Record<string, unknown>;
      record(o.name ?? o.object ?? o.label, o.is_possession ?? o.isPossession ?? o.possession);
    }
    return out;
  }
  if (typeof body === 'object') {
    for (const [name, verdict] of Object.entries(body as Record<string, unknown>)) {
      record(name, verdict);
    }
  }
  return out;
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === 'yes') return true;
    if (v === 'false' || v === 'no') return false;
  }
  return null;
}
