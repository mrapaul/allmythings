import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { envConfig } from '../config/env.config';
import { BadRequestError, PayloadTooLargeError } from '../utils/errors';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  PipelineClient,
  PipelineUnavailableError,
  QueueFullError,
} from '../clients/pipeline.client';
import { mapSceneToItems } from './detect.mapper';
import { parseDetectTier, qualityTierUnavailableMessage } from './detect-tier';
import { parseDetectMode } from './detect-mode';
import { parseDetectVocab } from './detect-vocab';
import type { DetectOptions, Detector } from '../services/vlm-detector';
import type { VlmRunStore } from '../services/vlm-run-store';
import { annotatePhotoFireAndForget } from '../services/photo-annotator';
import { DetectorUnavailableError } from '../clients/vlm-client';
import type { DetectGate } from '../utils/concurrency';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PIPELINE_DEADLINE_BUFFER_MS = 250;
/** Retry hint for the sync VLM path when the detector gate is full. */
const VLM_QUEUE_RETRY_AFTER_S = 15;

export async function detectRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = (app as any).pipeline as PipelineClient | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vlmDetector = (app as any).vlmDetector as Detector | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualityVlmDetector = (app as any).qualityVlmDetector as Detector | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vlmRuns = (app as any).vlmRuns as VlmRunStore | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualityVlmRuns = (app as any).qualityVlmRuns as VlmRunStore | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detectGate = (app as any).detectGate as DetectGate | undefined;

  app.post(
    '/v1/detect',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Detect home objects in 1–3 image frames',
        description:
          'Query params: `tier` (standard|quality) selects the VLM engine; `mode` (full|scout, default full) selects the detection depth — scout runs pass 1 + adaptive tiles only, skipping the pass-2 audit (cheaper, less exhaustive); `async=1` registers a background run and returns 202. Multipart parts: 1–3 image files plus an optional `vocab` text field (JSON array of strings or comma-separated) with the owner\'s existing inventory names; when it matches a detected object the VLM uses that exact name (VLM path only, ignored by the legacy pipeline path). The annotated render of a detection photo is derivable as `${base}/photos/<photoSha256>.jpg?annotated=1` (photoSha256 is in the 202 body and the SSE meta event); it 404s until rendered, so clients fall back to the raw photo.',
        tags: ['vision'],
        consumes: ['multipart/form-data'],
        response: {
          200: {
            type: 'object',
            required: ['items'],
            properties: {
              items: { type: 'array', items: { $ref: 'DetectedItem' } },
              scene: {
                type: 'object',
                nullable: true,
                properties: {
                  type: { type: 'string' },
                  estimatedTotalItems: { type: 'number', nullable: true },
                  verdict: { type: 'string' },
                  verdictReason: { type: 'string', nullable: true },
                },
              },
              mergeSuggestions: {
                type: 'array',
                description:
                  'Pairs the pipeline suspects are one physical object but did not merge; itemIndexA/itemIndexB index into items. Present the merge to the user rather than applying it.',
                items: {
                  type: 'object',
                  required: ['itemIndexA', 'itemIndexB', 'reason', 'confidence'],
                  properties: {
                    itemIndexA: { type: 'integer' },
                    itemIndexB: { type: 'integer' },
                    reason: { type: 'string' },
                    confidence: { type: 'number' },
                  },
                },
              },
            },
          },
          202: {
            type: 'object',
            required: ['runId', 'statusUrl'],
            properties: {
              runId: { type: 'string' },
              statusUrl: { type: 'string' },
              photoSha256: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Section-08 §7: accept 1–3 multipart parts. Each part is an
      // independent capture frame; the pipeline's cross_frame_dedup uses
      // every frame as its own signal class for agreement scoring.
      //
      // Every part is ALWAYS fully consumed (toBuffer), even after a
      // validation error: bailing out of request.parts() mid-stream leaves
      // bytes on the wire and corrupts the next request on a keep-alive
      // socket. The first validation error wins; the rest of the body is
      // drained and discarded.
      const frames: Array<{ buffer: Buffer; mime: string; sha256: string }> = [];
      let rejected: PayloadTooLargeError | BadRequestError | null = null;
      // First `vocab` text field wins; extras are drained and ignored.
      let vocabRaw: string | undefined;
      for await (const part of request.parts()) {
        if (part.type !== 'file') {
          // The optional `vocab` field (owner's existing inventory names)
          // primes the VLM prompts; ignored by the legacy pipeline path.
          if (vocabRaw === undefined && part.fieldname === 'vocab') {
            vocabRaw = typeof part.value === 'string' ? part.value : '';
          }
          continue;
        }
        const buf = await part.toBuffer();
        if (frames.length >= 3) continue;
        if (rejected) continue;
        if (buf.length > MAX_IMAGE_SIZE) {
          rejected = new PayloadTooLargeError(
            `Frame ${frames.length} exceeds ${MAX_IMAGE_SIZE} bytes`,
          );
          continue;
        }
        const mime = part.mimetype ?? 'image/jpeg';
        if (!SUPPORTED.has(mime)) {
          rejected = new BadRequestError(`Unsupported mime: ${mime}`);
          continue;
        }
        frames.push({
          buffer: buf,
          mime,
          sha256: crypto.createHash('sha256').update(buf).digest('hex'),
        });
      }

      if (rejected) throw rejected;

      if (frames.length === 0) {
        throw new BadRequestError('No image file uploaded');
      }

      // Owner-vocabulary priming (optional multipart `vocab` field). Bad JSON
      // shape is a 400 invalid_body; everything else is cleaned silently.
      const vocabParsed = parseDetectVocab(vocabRaw);
      if (!vocabParsed.ok) {
        return reply.code(400).send({ error: 'invalid_body', message: vocabParsed.message });
      }
      const vocab = vocabParsed.vocab.length > 0 ? vocabParsed.vocab : undefined;

      // Quality-tier selection (?tier=quality routes to the env-configured
      // quality VLM) and scout-mode selection (?mode=scout runs a single
      // VLM pass, skipping the pass-2 audit). Both reject unservable/unknown
      // values BEFORE any frame processing (no photo is persisted, no
      // detector runs).
      const mode = parseDetectMode(request.query);
      const tier = parseDetectTier(request.query);
      if (tier === 'quality' && (envConfig.detector !== 'vlm' || !qualityVlmDetector)) {
        throw new BadRequestError(qualityTierUnavailableMessage());
      }
      // Per-request detect overrides; 'full' keeps the detector's configured
      // default. Only an explicit scout mode narrows the run (never widens a
      // configured single-pass detector).
      const detectOpts: DetectOptions | undefined =
        mode === 'scout' ? { twoPass: false, vocab } : vocab ? { vocab } : undefined;

      // Idempotency formula (must match mobile detection_repository
      // exactly, see scene_observation §7): sha256 of concatenated
      // per-frame sha256 *bytes*. For a single-frame burst this collapses
      // to sha256(sha256(frame)) which is still stable.
      const concatenated = Buffer.concat(
        frames.map((f) => Buffer.from(f.sha256, 'hex')),
      );
      const burstIdempotencyKey = crypto
        .createHash('sha256')
        .update(concatenated)
        .digest('hex');

      const traceparent = request.headers['traceparent']?.toString();
      const traceId =
        traceparent?.split('-')[1] ?? crypto.randomBytes(16).toString('hex');
      const requestId = request.id;

      // VLM path: synchronous two-pass detection, no sidecar required.
      if (envConfig.detector === 'vlm') {
        const tierRuns = tier === 'quality' ? qualityVlmRuns : vlmRuns;
        const tierDetector = tier === 'quality' ? qualityVlmDetector : vlmDetector;
        // async=1: register a background run and return immediately — the
        // mobile app polls /v1/detect/status/<runId> (survives disconnects).
        const wantsAsync =
          (request.query as Record<string, unknown> | undefined)?.async === '1';
        if (wantsAsync) {
          if (!tierRuns) {
            return reply.code(503).send({ error: 'detector_unavailable' });
          }
          const frame = frames[0]!;
          await persistFrame(frame);
          const run = tierRuns.start(frame.buffer, frame.sha256, detectOpts);
          return reply.code(202).send({
            runId: run.runId,
            photoSha256: frame.sha256,
            statusUrl: `/v1/detect/status/${run.runId}`,
          });
        }
        if (!tierDetector) {
          return reply.code(503).send({ error: 'detector_unavailable' });
        }
        return runVlmPath({
          reply,
          vlmDetector: tierDetector,
          detectGate,
          frame: frames[0]!,
          detectOpts,
        });
      }

      if (!pipeline) {
        return reply.code(503).send({ error: 'pipeline_unavailable' });
      }

      return runPipelinePath({
        reply,
        pipeline,
        frames,
        burstIdempotencyKey,
        traceId,
        requestId,
      });
    },
  );
}

// ---------------------------------------------------------------------------

interface VlmPathArgs {
  reply: FastifyReply;
  vlmDetector: Detector;
  detectGate: DetectGate | undefined;
  frame: { buffer: Buffer; mime: string; sha256: string };
  detectOpts?: DetectOptions;
}

async function persistFrame(frame: {
  buffer: Buffer;
  mime: string;
  sha256: string;
}): Promise<void> {
  const photoDir = path.join(envConfig.photoDir, 'photos');
  await fs.mkdir(photoDir, { recursive: true });
  const ext =
    frame.mime === 'image/png' ? 'png' : frame.mime === 'image/webp' ? 'webp' : 'jpg';
  await fs.writeFile(path.join(photoDir, `${frame.sha256}.${ext}`), frame.buffer);
}

async function runVlmPath(args: VlmPathArgs) {
  const { reply, vlmDetector, detectGate, frame, detectOpts } = args;
  // Backpressure, mirroring the pipeline path's queue_full contract: when the
  // detector gate is full (another run holds the GPU-bound model), reject
  // fast with Retry-After instead of accepting and doubling everyone's
  // latency against a serial Ollama.
  if (detectGate && !detectGate.tryAcquire()) {
    reply.header('Retry-After', String(VLM_QUEUE_RETRY_AFTER_S));
    return reply
      .code(503)
      .send({ error: 'queue_full', retry_after_s: VLM_QUEUE_RETRY_AFTER_S });
  }
  try {
    // Persist so /photos/<sha> resolves, matching the pipeline path.
    await persistFrame(frame);
    const { scene, items, mergeSuggestions } = await vlmDetector.detect(
      frame.buffer,
      detectOpts,
    );
    const sent = reply.code(200).send({ scene, items, mergeSuggestions });
    // Annotated burn-in AFTER the response: fire-and-forget, never blocks the
    // detect; a failure only logs (the annotated URL 404s, client falls back
    // to the raw photo).
    annotatePhotoFireAndForget(
      path.join(envConfig.photoDir, 'photos'),
      frame.sha256,
      frame.buffer,
      items,
    );
    return sent;
  } catch (err) {
    if (err instanceof DetectorUnavailableError) {
      return reply.code(503).send({ error: 'detector_unavailable', message: err.message });
    }
    throw err;
  } finally {
    detectGate?.release();
  }
}

// ---------------------------------------------------------------------------

interface BurstPathArgs {
  reply: FastifyReply;
  pipeline: PipelineClient;
  frames: Array<{ buffer: Buffer; mime: string; sha256: string }>;
  burstIdempotencyKey: string;
  traceId: string;
  requestId: string;
}

async function runPipelinePath(args: BurstPathArgs) {
  const {
    reply,
    pipeline,
    frames,
    burstIdempotencyKey,
    traceId,
    requestId,
  } = args;

  // Persist each frame under photoDir/photos/<sha>.<ext>; the pipeline
  // sidecar reads frames by absolute path (wire shape: photo_paths: []).
  const photoDir = path.join(envConfig.photoDir, 'photos');
  await fs.mkdir(photoDir, { recursive: true });
  const photoPaths: string[] = [];
  for (const f of frames) {
    const ext =
      f.mime === 'image/png'
        ? 'png'
        : f.mime === 'image/webp'
          ? 'webp'
          : 'jpg';
    const photoPath = path.join(photoDir, `${f.sha256}.${ext}`);
    await fs.writeFile(photoPath, f.buffer);
    photoPaths.push(photoPath);
  }

  let launch;
  try {
    launch = await pipeline.launchRun({
      idempotencyKey: burstIdempotencyKey,
      photoPaths,
      traceId,
      requestId,
    });
  } catch (err) {
    if (err instanceof QueueFullError) {
      reply.header('Retry-After', String(err.retryAfterS));
      return reply.code(503).send({ error: 'queue_full', retry_after_s: err.retryAfterS });
    }
    if (err instanceof PipelineUnavailableError) {
      return reply.code(503).send({ error: 'pipeline_unavailable' });
    }
    throw err;
  }

  if (launch.idempotentHit && launch.status === 'succeeded' && launch.result) {
    return reply.code(200).send({ items: mapSceneToItems(launch.result) });
  }

  const deadlineMs = Date.now() + envConfig.httpResponseTimeoutMs - PIPELINE_DEADLINE_BUFFER_MS;
  let final;
  try {
    final = await pipeline.waitForCompletion(launch.runId, deadlineMs);
  } catch (err) {
    if (err instanceof PipelineUnavailableError) {
      return reply.code(503).send({ error: 'pipeline_unavailable' });
    }
    throw err;
  }

  if (final.status === 'succeeded' && final.result) {
    return reply.code(200).send({ items: mapSceneToItems(final.result) });
  }
  if (final.status === 'running') {
    return reply.code(202).send({
      runId: launch.runId,
      statusUrl: `/v1/detect/status/${launch.runId}`,
    });
  }
  return reply.code(500).send({
    error: final.errorCode ?? 'pipeline_failed',
    message: final.errorMessage,
    runId: launch.runId,
    traceId,
  });
}
