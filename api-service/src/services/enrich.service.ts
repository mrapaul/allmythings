import sharp from 'sharp';
import { z } from 'zod';
import { envConfig } from '../config/env.config';
import { OllamaVlmClient } from '../clients/ollama-vlm.client';
import type { VlmClient } from '../clients/vlm-client';
import { stripAndParseJson } from './vlm-detector.parse';
import { logger } from '../utils/logger';

/**
 * Item enrichment: one close-look VLM pass over a SINGLE item's crop after it
 * has been saved, extracting the resale-grade detail (brand marks, model
 * hints, era/style, material) that scene-level detection cannot resolve.
 *
 * Design constraints, in order:
 *  - Fail-open, never block: any outage, timeout, or unparseable output
 *    returns the caller's existing label unchanged with empty attributes.
 *    Enrichment is a bonus layer on an already-saved item.
 *  - Serialized, never a stampede: a big save fans out one enrich request per
 *    item; an internal FIFO queue with concurrency 1 feeds them to the model
 *    one at a time, so 50 thumbnails never contend for the detection model.
 *  - The DETECTION model, not the precheck one: a crop is exactly where the
 *    big model's reading of logos and textures pays off, and this is async
 *    background work where 10-20s per item is fine.
 */

export interface EnrichAttributes {
  color?: string;
  material?: string;
  style?: string;
  era?: string;
  brand?: string;
  model?: string;
}

export interface EnrichResult {
  label: string;
  attributes: EnrichAttributes;
  confidence: number | null;
  description: string;
}

export const ATTRIBUTE_KEYS = [
  'color',
  'material',
  'style',
  'era',
  'brand',
  'model',
] as const;

/** Attribute values that mean "the model saw nothing" and must be dropped. */
const EMPTY_ATTRIBUTE_VALUES = /^(unknown|null|none|n\/a|not visible|unclear)$/i;

/**
 * Strict only on the label — a nameless answer is useless; everything else is
 * salvaged field-by-field so one bad value never voids the whole enrichment.
 */
const modelResponseSchema = z.object({
  label: z.string().trim().min(1),
  attributes: z.record(z.string(), z.unknown()).catch({}),
  confidence: z.number().min(0).max(1).nullable().catch(null),
  description: z.string().trim().catch(''),
});

/**
 * Pass-1 prompt style: schema-locked, JSON only, self-describing label, no
 * enumeration chatter. No is_possession — the item is already inventory.
 */
export function buildEnrichPrompt(existingLabel?: string): string {
  const priorLine = existingLabel
    ? `\nThe item was previously labeled "${existingLabel}". Keep that label unless the close-up clearly shows a better or more specific name.`
    : '';
  return `You are a resale appraiser examining a close-up photo of ONE household item.${priorLine}

Output exactly ONE JSON object with this structure and NOTHING else:
{"label": "specific self-describing name with visible color/material/type", "attributes": {"color": "...", "material": "...", "style": "...", "era": "...", "brand": "...", "model": "..."}, "confidence": <number 0-1>, "description": "one or two sentences a resale listing could use"}

Rules (MANDATORY):
- "label" names the single main item, specific and self-describing: "walnut mid-century sideboard", not "cabinet".
- Each attribute reports ONLY what is visibly supported by this photo; use null for anything you cannot see. Do not guess.
- "brand" and "model" ONLY from visible logos, badges, labels, or unmistakable signature design. Never invent them.
- "era" is a period or decade ("mid-century", "1980s", "contemporary") only when the design clearly shows it.
- "confidence" is your overall confidence in the label, 0 to 1.
- No markdown, no explanation, no keys other than those shown.`;
}

export interface EnrichServiceOptions {
  /** Deadline for one model call (queue wait time is not counted). */
  timeoutMs?: number;
  /** Longest edge of the crop handed to the model. */
  maxDimension?: number;
}

export class EnrichService {
  private readonly client: VlmClient;
  private readonly timeoutMs: number;
  private readonly maxDimension: number;
  /** FIFO tail — every enrich chains behind the previous one (concurrency 1). */
  private queueTail: Promise<unknown> = Promise.resolve();
  private queueDepth = 0;

  constructor(client: VlmClient, opts?: EnrichServiceOptions) {
    this.client = client;
    this.timeoutMs = opts?.timeoutMs ?? envConfig.enrichTimeoutMs;
    this.maxDimension = opts?.maxDimension ?? envConfig.enrichMaxDimension;
  }

  /**
   * Enqueue one crop for enrichment. Requests run strictly one at a time in
   * arrival order; the returned promise resolves when THIS crop is done.
   * Never rejects — failures resolve to the fail-open result.
   */
  async enrich(image: Buffer, existingLabel?: string): Promise<EnrichResult> {
    this.queueDepth += 1;
    if (this.queueDepth > 1) {
      logger.info({ queueDepth: this.queueDepth }, 'enrich_queued');
    }
    const run = this.queueTail.then(() => this.enrichNow(image, existingLabel));
    // The tail must survive a rejected run so one failure cannot jam the queue.
    this.queueTail = run.catch(() => undefined);
    try {
      return await run;
    } finally {
      this.queueDepth -= 1;
    }
  }

  private async enrichNow(image: Buffer, existingLabel?: string): Promise<EnrichResult> {
    const startedAt = Date.now();
    try {
      const base64 = await this.toModelInput(image);
      const raw = await this.generateWithDeadline(base64, existingLabel);
      const result = this.toResult(raw, existingLabel);
      logger.info(
        {
          durationMs: Date.now() - startedAt,
          model: this.client.modelName,
          label: result.label,
          attributeCount: Object.keys(result.attributes).length,
          enriched: result.confidence !== null,
        },
        'enrich_completed',
      );
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.warn(
        { err: message, durationMs: Date.now() - startedAt, existingLabel },
        'enrich_failed_open',
      );
      return failOpenResult(existingLabel);
    }
  }

  /** Downscale + re-encode to a small JPEG; undecodable input goes through as-is. */
  private async toModelInput(image: Buffer): Promise<string> {
    try {
      const jpeg = await sharp(image)
        .rotate()
        .resize(this.maxDimension, this.maxDimension, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
      return jpeg.toString('base64');
    } catch {
      return image.toString('base64');
    }
  }

  /** The Ollama client retries transient failures; enforce one hard deadline here. */
  private async generateWithDeadline(
    imageBase64: string,
    existingLabel?: string,
  ): Promise<string> {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`enrich deadline of ${this.timeoutMs}ms exceeded`)),
        this.timeoutMs,
      );
    });
    try {
      return await Promise.race([
        this.client.generateJson(buildEnrichPrompt(existingLabel), imageBase64),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private toResult(raw: string, existingLabel?: string): EnrichResult {
    let salvaged: unknown;
    try {
      salvaged = stripAndParseJson(raw);
    } catch {
      logger.warn({ raw: raw.slice(0, 160) }, 'enrich_unparseable_fail_open');
      return failOpenResult(existingLabel);
    }
    const parsed = modelResponseSchema.safeParse(salvaged);
    if (!parsed.success) {
      logger.warn({ raw: raw.slice(0, 160) }, 'enrich_invalid_fail_open');
      return failOpenResult(existingLabel);
    }
    const { label, attributes, confidence, description } = parsed.data;
    return {
      label,
      attributes: toAttributes(attributes),
      confidence,
      description,
    };
  }
}

/**
 * Wire enrichment to the detection model over the same Ollama backend the
 * detector chain uses. Bounded output: attributes are short, so a runaway
 * generation is a failure, not a feature.
 */
export function createEnrichService(): EnrichService {
  const client = new OllamaVlmClient({
    baseUrl: envConfig.ollamaBaseUrl,
    model: envConfig.enrichModel,
    timeoutMs: envConfig.enrichTimeoutMs,
    numPredict: 512,
    temperature: 0,
  });
  return new EnrichService(client);
}

// ---------------------------------------------------------------------------

function failOpenResult(existingLabel?: string): EnrichResult {
  return {
    label: existingLabel ?? '',
    attributes: {},
    confidence: null,
    description: '',
  };
}

/** Keep only the known attribute keys whose value is a real, non-empty string. */
function toAttributes(raw: Record<string, unknown>): EnrichAttributes {
  const out: EnrichAttributes = {};
  for (const key of ATTRIBUTE_KEYS) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length === 0 || EMPTY_ATTRIBUTE_VALUES.test(trimmed)) continue;
    out[key] = trimmed;
  }
  return out;
}
