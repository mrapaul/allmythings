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

  app.post(
    '/v1/detect/stream',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Detect home objects, streaming items via SSE',
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
      const frames: Array<{ buffer: Buffer; mime: string; sha256: string }> = [];
      for await (const part of request.parts()) {
        if (part.type !== 'file') continue;
        if (frames.length >= 1) {
          await part.toBuffer();
          continue;
        }
        const buf = await part.toBuffer();
        if (buf.length > MAX_IMAGE_SIZE)
          return reply.code(413).send({ error: 'payload_too_large' });
        const mime = part.mimetype ?? 'image/jpeg';
        if (!SUPPORTED.has(mime))
          return reply.code(400).send({ error: 'unsupported_mime', mime });
        frames.push({
          buffer: buf,
          mime,
          sha256: crypto.createHash('sha256').update(buf).digest('hex'),
        });
      }
      if (frames.length === 0) return reply.code(400).send({ error: 'no_frame' });
      const useVlm = envConfig.detector === 'vlm';
      if (useVlm && !vlmDetector)
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
          writeEvent('meta', { runId, traceId });
          let total = 0;
          try {
            for await (const ev of vlmDetector!.detectStream(f.buffer)) {
              if (aborted) return;
              if (ev.kind !== 'item') continue; // scene event goes on the wire in Task 6
              writeEvent('item', ev.item);
              total += 1;
              if (itemDribbleMs > 0) await new Promise((r) => setTimeout(r, itemDribbleMs));
            }
          } catch (err) {
            if (err instanceof DetectorUnavailableError) {
              writeEvent('error', { code: 'detector_unavailable', message: err.message });
              return;
            }
            throw err;
          }
          writeEvent('done', { runId, totalItems: total });
          return;
        }

        let launch;
        try {
          launch = await pipeline!.launchRun({
            idempotencyKey,
            photoPaths: [photoPath],
            traceId,
            requestId,
          });
        } catch (err) {
          if (err instanceof QueueFullError) {
            writeEvent('error', { code: 'queue_full', retryAfterS: err.retryAfterS });
            return;
          }
          if (err instanceof PipelineUnavailableError) {
            writeEvent('error', { code: 'pipeline_unavailable' });
            return;
          }
          throw err;
        }

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
      } finally {
        clearInterval(keepalive);
        reply.raw.off('close', onClose);
        reply.raw.end();
      }
    },
  );
}
