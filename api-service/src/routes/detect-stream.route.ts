import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { envConfig } from '../config/env.config';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  PipelineClient,
  PipelineUnavailableError,
  QueueFullError,
} from '../clients/pipeline.client';
import { mapPipelineDetectionToItem } from './detect.mapper';
import { parseDetectTier, qualityTierUnavailableMessage } from './detect-tier';
import { encodeSseEvent, SSE_KEEPALIVE } from '../utils/sse';
import type { Detector } from '../services/vlm-detector';
import { DetectorUnavailableError } from '../clients/vlm-client';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const KEEPALIVE_MS = 15_000;

export async function detectStreamRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = (app as any).pipeline as PipelineClient | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vlmDetector = (app as any).vlmDetector as Detector | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualityVlmDetector = (app as any).qualityVlmDetector as Detector | undefined;

  app.post(
    '/v1/detect/stream',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Detect home objects, streaming items via SSE',
        description:
          'SSE event types: `meta` (runId/traceId), `scene` (pass-1 assessment), `item` (one DetectedItem), `merge-suggestion` ({itemIndexA, itemIndexB, reason, confidence} indexing the emitted item sequence — a pair the pipeline suspects is one object but did not merge), `error`, `done`.',
        tags: ['vision'],
        consumes: ['multipart/form-data'],
        produces: ['text/event-stream'],
        response: {
          200: { description: 'SSE stream', type: 'string' },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          503: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const itemDribbleMs = Number(process.env.SSE_ITEM_DRIBBLE_MS ?? 50);
      // Every part is ALWAYS fully consumed, even after a validation error:
      // bailing out of request.parts() mid-stream leaves bytes on the wire and
      // corrupts the next request on a keep-alive socket. The stream route
      // accepts exactly one frame; extra parts are drained and discarded.
      const frames: Array<{ buffer: Buffer; mime: string; sha256: string }> = [];
      let rejected: { code: number; body: Record<string, unknown> } | null = null;
      for await (const part of request.parts()) {
        if (part.type !== 'file') continue;
        const buf = await part.toBuffer();
        if (frames.length >= 1) continue;
        if (rejected) continue;
        if (buf.length > MAX_IMAGE_SIZE) {
          rejected = { code: 413, body: { error: 'payload_too_large' } };
          continue;
        }
        const mime = part.mimetype ?? 'image/jpeg';
        if (!SUPPORTED.has(mime)) {
          rejected = { code: 400, body: { error: 'unsupported_mime', mime } };
          continue;
        }
        frames.push({
          buffer: buf,
          mime,
          sha256: crypto.createHash('sha256').update(buf).digest('hex'),
        });
      }
      if (rejected) return reply.code(rejected.code).send(rejected.body);
      if (frames.length === 0) return reply.code(400).send({ error: 'no_frame' });
      // Quality-tier selection. Rejected before headers are flushed (so this
      // stays a plain 4xx, not an SSE error event) and before the frame is
      // persisted or sent to any detector.
      const tier = parseDetectTier(request.query);
      if (tier === 'quality' && (envConfig.detector !== 'vlm' || !qualityVlmDetector)) {
        return reply
          .code(400)
          .send({ error: 'quality_tier_unavailable', message: qualityTierUnavailableMessage() });
      }
      const useVlm = envConfig.detector === 'vlm';
      const detector = tier === 'quality' ? qualityVlmDetector : vlmDetector;
      if (useVlm && !detector)
        return reply.code(503).send({ error: 'detector_unavailable' });
      if (!useVlm && !pipeline)
        return reply.code(503).send({ error: 'pipeline_unavailable' });

      const photoDir = path.join(envConfig.photoDir, 'photos');
      await fs.mkdir(photoDir, { recursive: true });
      const f = frames[0]!;
      const ext = f.mime === 'image/png' ? 'png' : f.mime === 'image/webp' ? 'webp' : 'jpg';
      const photoPath = path.join(photoDir, `${f.sha256}.${ext}`);
      await fs.writeFile(photoPath, f.buffer);

      const idempotencyKey = crypto
        .createHash('sha256')
        .update(Buffer.from(f.sha256, 'hex'))
        .digest('hex');

      const traceparent = request.headers['traceparent']?.toString();
      const traceId =
        traceparent?.split('-')[1] ?? crypto.randomBytes(16).toString('hex');
      const requestId = request.id;

      reply.raw.statusCode = 200;
      reply.raw.setHeader('content-type', 'text/event-stream');
      reply.raw.setHeader('cache-control', 'no-cache, no-transform');
      reply.raw.setHeader('connection', 'keep-alive');
      reply.raw.setHeader('x-accel-buffering', 'no');
      reply.raw.flushHeaders();

      let aborted = false;
      const onClose = (): void => {
        aborted = true;
      };
      reply.raw.on('close', onClose);

      const keepalive = setInterval(() => {
        if (!aborted) reply.raw.write(SSE_KEEPALIVE);
      }, KEEPALIVE_MS);

      const writeEvent = (event: string, data: unknown): void => {
        if (aborted) return;
        reply.raw.write(encodeSseEvent(event, data));
      };

      try {
        // VLM path: stream items as each of the two passes completes.
        if (useVlm) {
          const runId = crypto.randomBytes(16).toString('hex');
          writeEvent('meta', { runId, traceId, photoSha256: f.sha256 });
          let total = 0;
          for await (const ev of detector!.detectStream(f.buffer)) {
            if (aborted) return;
            if (ev.kind === 'scene') {
              writeEvent('scene', ev.scene);
              continue;
            }
            if (ev.kind === 'merge-suggestion') {
              // Distinct event: the app collects these and asks the user
              // later, so a suggestion never delays or replaces an item.
              writeEvent('merge-suggestion', ev.suggestion);
              continue;
            }
            writeEvent('item', ev.item);
            total += 1;
            if (itemDribbleMs > 0) await new Promise((r) => setTimeout(r, itemDribbleMs));
          }
          writeEvent('done', { runId, totalItems: total });
          return;
        }

        const launch = await pipeline!.launchRun({
          idempotencyKey,
          photoPaths: [photoPath],
          traceId,
          requestId,
        });

        writeEvent('meta', { runId: launch.runId, traceId });

        const final =
          launch.idempotentHit && launch.status === 'succeeded' && launch.result
            ? { result: launch.result }
            : await pipeline!.waitForCompletion(
                launch.runId,
                Date.now() + envConfig.httpResponseTimeoutMs - 250,
              );

        if (!('result' in final) || !final.result) {
          writeEvent('error', {
            code: 'pipeline_failed',
            runId: launch.runId,
            ...(final && 'errorMessage' in final ? { message: final.errorMessage } : {}),
          });
          return;
        }

        const items = final.result.detections.map(mapPipelineDetectionToItem);
        for (const item of items) {
          if (aborted) return;
          writeEvent('item', item);
          if (itemDribbleMs > 0) await new Promise((r) => setTimeout(r, itemDribbleMs));
        }
        writeEvent('done', { runId: launch.runId, totalItems: items.length });
      } catch (err) {
        // Headers are already flushed, so the ONLY error channel left is an
        // SSE event. Every failure — a corrupt JPEG in sharp, a multipart
        // read failure, an unexpected detector error — must produce a
        // terminal `error` event: a stream that just stops is
        // indistinguishable from a network drop on the client.
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof QueueFullError) {
          writeEvent('error', { code: 'queue_full', retryAfterS: err.retryAfterS, message });
        } else if (err instanceof PipelineUnavailableError) {
          writeEvent('error', { code: 'pipeline_unavailable', message });
        } else if (err instanceof DetectorUnavailableError) {
          writeEvent('error', { code: 'detector_unavailable', message });
        } else {
          writeEvent('error', { code: 'internal_error', message });
        }
        return;
      } finally {
        clearInterval(keepalive);
        reply.raw.off('close', onClose);
        reply.raw.end();
      }
    },
  );
}
