import sharp from 'sharp';
import { z } from 'zod';
import { envConfig } from '../config/env.config';
import { OllamaVlmClient } from '../clients/ollama-vlm.client';
import type { VlmClient } from '../clients/vlm-client';
import { logger } from '../utils/logger';

/**
 * Capture-time precheck: one fast, schema-locked VLM call over a small preview
 * frame so the mobile app can steer the user BEFORE the expensive two-pass
 * detection runs.
 *
 * This is real-time guidance while the user is still framing a shot, so latency
 * IS the feature. Three things keep it fast:
 *  - its OWN small model (envConfig.precheckModel), never the 30B detector —
 *    sharing that model measured 15.1-15.7s, worse for the user than no
 *    precheck at all;
 *  - the minimum question: scene class, people present, rough object count.
 *    Brightness/blur are cheap for the client to measure on the preview frame
 *    itself and are NOT asked of the model (the `quality` field stays in the
 *    response contract, reported as 'ok', so the app can fill it in locally);
 *  - a small input and a hard output cap.
 *
 * Fail-open by design: any outage, timeout, or malformed model output yields
 * `{ processable: true, advice: null }` — a broken precheck must never block
 * capture.
 */

export type PrecheckScene = 'interior' | 'exterior' | 'person_focus' | 'document' | 'other';
export type PrecheckQuality = 'ok' | 'too_dark' | 'too_blurry' | 'too_far';
export type PrecheckDensity = 'none' | 'few' | 'moderate' | 'many' | 'too_many';

export interface PrecheckResult {
  scene: PrecheckScene;
  quality: PrecheckQuality;
  objectDensity: PrecheckDensity;
  /** Raw model count behind objectDensity; null when the model gave no usable number. */
  visibleObjectCount: number | null;
  peoplePresent: boolean;
  processable: boolean;
  advice: string | null;
}

/** Tiny response — cap generation hard so a slow model cannot ramble. */
const PRECHECK_NUM_PREDICT = 48;
/** Density bucket boundaries (upper bound inclusive); 'too_many' comes from env. */
const FEW_MAX = 5;
const MODERATE_MAX = 15;

const SCENES = ['interior', 'exterior', 'person_focus', 'document', 'other'] as const;
const QUALITIES = ['ok', 'too_dark', 'too_blurry', 'too_far'] as const;

/**
 * Strict on the fields that gate capture (scene/quality must be valid enums),
 * lenient on the rest — a bad count or missing people flag should not void an
 * otherwise usable verdict.
 */
const modelResponseSchema = z.object({
  scene: z.enum(SCENES),
  // Still accepted if a model volunteers it, but never requested.
  quality: z.enum(QUALITIES).catch('ok'),
  // Nullable so the response can distinguish "model said 0" from "no usable
  // number" — the viewfinder count pill hides on null instead of showing ~0.
  visible_object_count: z.number().int().min(0).nullable().catch(null),
  people_present: z.boolean().catch(false),
});

const SCENE_ADVICE: Record<Exclude<PrecheckScene, 'interior'>, string> = {
  exterior: 'This looks like the outdoors — inventory needs interior photos',
  person_focus: 'Point the camera at your shelves or rooms, not people',
  document: 'This looks like a document — point the camera at your items instead',
  other: 'Point the camera at an interior space with your items',
};

const QUALITY_ADVICE: Record<Exclude<PrecheckQuality, 'ok'>, string> = {
  too_dark: 'Too dark — add some light',
  too_blurry: 'Too blurry — hold the phone steady',
  too_far: 'Move closer so items are recognizable',
};

const TOO_MANY_ADVICE = 'A lot of items in frame — a few closer shots will work better';

/**
 * Deliberately minimal: three fields, no quality assessment, no explanation.
 * Every extra field the model has to produce costs tokens, and tokens are the
 * whole latency budget here.
 */
export function buildPrecheckPrompt(): string {
  return `Classify this photo for a home inventory app.

Return ONLY this JSON, nothing else:
{"scene": "interior|exterior|person_focus|document|other", "visible_object_count": <int>, "people_present": true|false}

- scene: interior = indoor home space (room, shelf, drawer, closet, cabinet); exterior = outdoors; person_focus = a person is the main subject; document = mostly paper/screen/text; other = anything else.
- visible_object_count: rough count of distinct household objects (0 if none).
- people_present: true if any person is visible.`;
}

export interface PrecheckServiceOptions {
  /** Count above which objectDensity becomes 'too_many'. */
  maxObjects?: number;
  /** Overall deadline for the model call; past it the precheck fails open. */
  timeoutMs?: number;
  /** Longest edge of the frame handed to the model. */
  maxDimension?: number;
}

export class PrecheckService {
  private readonly client: VlmClient;
  private readonly maxObjects: number;
  private readonly timeoutMs: number;
  private readonly maxDimension: number;

  constructor(client: VlmClient, opts?: PrecheckServiceOptions) {
    this.client = client;
    this.maxObjects = opts?.maxObjects ?? envConfig.precheckMaxObjects;
    this.timeoutMs = opts?.timeoutMs ?? envConfig.precheckTimeoutMs;
    this.maxDimension = opts?.maxDimension ?? envConfig.precheckMaxDimension;
  }

  async precheck(image: Buffer): Promise<PrecheckResult> {
    const startedAt = Date.now();
    try {
      const base64 = await this.toModelInput(image);
      const raw = await this.generateWithDeadline(base64);
      const result = this.toResult(raw);
      logger.info(
        {
          durationMs: Date.now() - startedAt,
          model: this.client.modelName,
          scene: result.scene,
          density: result.objectDensity,
          processable: result.processable,
        },
        'precheck_completed',
      );
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.warn(
        { err: message, durationMs: Date.now() - startedAt },
        'precheck_failed_open',
      );
      return failOpenResult();
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
        .jpeg({ quality: 80 })
        .toBuffer();
      return jpeg.toString('base64');
    } catch {
      return image.toString('base64');
    }
  }

  /** The Ollama client retries transient failures; enforce one hard deadline here. */
  private async generateWithDeadline(imageBase64: string): Promise<string> {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`precheck deadline of ${this.timeoutMs}ms exceeded`)),
        this.timeoutMs,
      );
    });
    try {
      return await Promise.race([
        this.client.generateJson(buildPrecheckPrompt(), imageBase64),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private toResult(raw: string): PrecheckResult {
    const parsed = modelResponseSchema.safeParse(salvageJson(raw));
    if (!parsed.success) {
      logger.warn({ raw: raw.slice(0, 160) }, 'precheck_unparseable_fail_open');
      return failOpenResult();
    }
    const { scene, quality, visible_object_count, people_present } = parsed.data;
    const objectDensity = bucketDensity(visible_object_count ?? 0, this.maxObjects);
    // Quality is the client's job now (brightness/blur on the preview frame),
    // so a non-'ok' value only appears when a model volunteers one.
    const processable = scene === 'interior' && quality === 'ok';
    return {
      scene,
      quality,
      objectDensity,
      visibleObjectCount: visible_object_count,
      peoplePresent: people_present,
      processable,
      advice: adviceFor(scene, quality, objectDensity),
    };
  }
}

/**
 * Wire the precheck to its OWN small model on the shared Ollama backend, pinned
 * resident via keep_alive so the first shot of a session is not a cold load.
 */
export function createPrecheckService(): PrecheckService {
  const client = new OllamaVlmClient({
    baseUrl: envConfig.ollamaBaseUrl,
    model: envConfig.precheckModel,
    timeoutMs: envConfig.precheckTimeoutMs,
    keepAlive: envConfig.precheckKeepAlive,
    numPredict: PRECHECK_NUM_PREDICT,
    temperature: 0,
    retryDelayMs: 250,
  });
  return new PrecheckService(client);
}

// ---------------------------------------------------------------------------

function failOpenResult(): PrecheckResult {
  return {
    scene: 'interior',
    quality: 'ok',
    objectDensity: 'moderate',
    visibleObjectCount: null,
    peoplePresent: false,
    processable: true,
    advice: null,
  };
}

/** Minimal tolerant JSON extraction: strip fences, isolate the outer object. */
function salvageJson(raw: string): unknown {
  const text = raw
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return normalizeEnumEchoes(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return null;
  }
}

/**
 * Small models routinely echo the prompt's pipe-separated option list instead of
 * choosing from it — measured with qwen3-vl:2b-instruct, which answers
 * `"scene": "interior|room"`. Take the first alternative rather than failing the
 * whole precheck open on a verdict the model did actually make.
 */
function normalizeEnumEchoes(parsed: unknown): unknown {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed;
  const out: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
  for (const key of ['scene', 'quality'] as const) {
    const value = out[key];
    if (typeof value === 'string' && value.includes('|')) {
      out[key] = value.split('|')[0]?.trim();
    }
  }
  return out;
}

function bucketDensity(count: number, maxObjects: number): PrecheckDensity {
  if (count > maxObjects) return 'too_many';
  if (count > MODERATE_MAX) return 'many';
  if (count > FEW_MAX) return 'moderate';
  if (count > 0) return 'few';
  return 'none';
}

function adviceFor(
  scene: PrecheckScene,
  quality: PrecheckQuality,
  density: PrecheckDensity,
): string | null {
  if (scene !== 'interior') return SCENE_ADVICE[scene];
  if (quality !== 'ok') return QUALITY_ADVICE[quality];
  if (density === 'too_many') return TOO_MANY_ADVICE;
  return null;
}
