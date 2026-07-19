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
import type { Detector } from '../services/vlm-detector.factory';
import { OllamaUnavailableError } from '../clients/ollama-vlm.client';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PIPELINE_DEADLINE_BUFFER_MS = 250;

export async function detectRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = (app as any).pipeline as PipelineClient | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detector = (app as any).detector as Detector | undefined;

  app.post(
    '/v1/detect',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Detect home objects in 1–3 image frames',
        tags: ['vision'],
        response: {
          200: {
            type: 'object',
            required: ['items'],
            properties: {
              items: { type: 'array', items: { $ref: 'DetectedItem' } },
            },
          },
          202: {
            type: 'object',
            required: ['runId', 'statusUrl'],
            properties: {
              runId: { type: 'string' },
              statusUrl: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Section-08 §7: accept 1–3 multipart parts. Each part is an
      // independent capture frame; the pipeline's cross_frame_dedup uses
      // every frame as its own signal class for agreement scoring.
      const frames: Array<{ buffer: Buffer; mime: string; sha256: string }> = [];
      for await (const part of request.parts()) {
        if (part.type !== 'file') continue;
        if (frames.length >= 3) {
          // Drain the rest so the connection closes cleanly.
          await part.toBuffer();
          continue;
        }
        const buf = await part.toBuffer();
        if (buf.length > MAX_IMAGE_SIZE) {
          throw new PayloadTooLargeError(
            `Frame ${frames.length} exceeds ${MAX_IMAGE_SIZE} bytes`,
          );
        }
        const mime = part.mimetype ?? 'image/jpeg';
        if (!SUPPORTED.has(mime)) {
          throw new BadRequestError(`Unsupported mime: ${mime}`);
        }
        frames.push({
          buffer: buf,
          mime,
          sha256: crypto.createHash('sha256').update(buf).digest('hex'),
        });
      }

      if (frames.length === 0) {
        throw new BadRequestError('No image file uploaded');
      }

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
        if (!detector) {
          return reply.code(503).send({ error: 'detector_unavailable' });
        }
        return runVlmPath({ reply, detector, frame: frames[0]! });
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
  detector: Detector;
  frame: { buffer: Buffer; mime: string; sha256: string };
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
  const { reply, detector, frame } = args;
  try {
    // Persist so /photos/<sha> resolves, matching the pipeline path.
    await persistFrame(frame);
    const items = await detector.detect(frame.buffer);
    return reply.code(200).send({ items });
  } catch (err) {
    if (err instanceof OllamaUnavailableError) {
      return reply.code(503).send({ error: 'detector_unavailable', message: err.message });
    }
    throw err;
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
