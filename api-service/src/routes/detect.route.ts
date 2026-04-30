import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Client, WorkflowIdReusePolicy, WorkflowNotFoundError } from '@temporalio/client';
import { detectInventoryWorkflow } from '../temporal/workflows/detect-inventory.workflow';
import { TASK_QUEUES } from '../temporal/task-queues';
import { envConfig } from '../config/env.config';
import { BadRequestError, PayloadTooLargeError } from '../utils/errors';
import { logger } from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  PipelineClient,
  PipelineUnavailableError,
  QueueFullError,
} from '../clients/pipeline.client';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PIPELINE_DEADLINE_BUFFER_MS = 250;

export async function detectRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const temporal = (app as any).temporal as Client;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = (app as any).pipeline as PipelineClient | undefined;

  app.post(
    '/v1/detect',
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const file = await request.file();
      if (!file) throw new BadRequestError('No image file uploaded');
      const imageBuffer = await file.toBuffer();
      if (imageBuffer.length > MAX_IMAGE_SIZE) {
        throw new PayloadTooLargeError(`Image exceeds ${MAX_IMAGE_SIZE} bytes`);
      }
      if (file.mimetype && !SUPPORTED.has(file.mimetype)) {
        throw new BadRequestError(`Unsupported mime: ${file.mimetype}`);
      }

      const mimeType = file.mimetype ?? 'image/jpeg';
      const imageSha256 = crypto.createHash('sha256').update(imageBuffer).digest('hex');
      const traceparent = request.headers['traceparent']?.toString();
      const traceId = traceparent?.split('-')[1] ?? crypto.randomBytes(16).toString('hex');
      const requestId = request.id;

      if (envConfig.usePipelineService) {
        if (!pipeline) {
          // Defensive: flag is on but the client wasn't wired in.
          return reply.code(503).send({ error: 'pipeline_unavailable' });
        }
        return runPipelinePath({
          reply,
          pipeline,
          imageBuffer,
          mimeType,
          imageSha256,
          traceId,
          requestId,
        });
      }

      return runLegacyTemporalPath({
        reply,
        temporal,
        imageBuffer,
        mimeType,
        imageSha256,
        traceId,
        requestId,
      });
    },
  );
}

// ---------------------------------------------------------------------------

interface CommonPathArgs {
  reply: FastifyReply;
  imageBuffer: Buffer;
  mimeType: string;
  imageSha256: string;
  traceId: string;
  requestId: string;
}

async function runLegacyTemporalPath(args: CommonPathArgs & { temporal: Client }) {
  const { reply, temporal, imageBuffer, mimeType, imageSha256, traceId, requestId } = args;
  const workflowId = `detect-${imageSha256}`;
  logger.info(
    { workflowId, traceId, requestId, bytes: imageBuffer.length },
    'Starting detection workflow',
  );

  const handle = await temporal.workflow.start(detectInventoryWorkflow, {
    args: [
      {
        imageBase64: imageBuffer.toString('base64'),
        imageSha256,
        mimeType,
        traceId,
        requestId,
      },
    ],
    workflowId,
    taskQueue: TASK_QUEUES.INVENTORY_PIPELINE,
    workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
    workflowExecutionTimeout: `${envConfig.workflowExecutionTimeoutMs}ms`,
  });

  try {
    const resultP = handle.result();
    const timer = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), envConfig.httpResponseTimeoutMs),
    );
    const raced = await Promise.race([resultP, timer]);
    if (raced === 'timeout') {
      return reply.code(202).send({
        status: 'accepted',
        workflowId,
        statusUrl: `/v1/detect/status/${workflowId}`,
      });
    }
    return reply.code(200).send(raced);
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) {
      throw new BadRequestError('Workflow not found');
    }
    logger.error({ workflowId, err: (err as Error).message }, 'Workflow failed');
    return reply.code(500).send({
      error: 'workflow_failed',
      message: (err as Error).message,
      workflowId,
      traceId,
    });
  }
}

async function runPipelinePath(args: CommonPathArgs & { pipeline: PipelineClient }) {
  const { reply, pipeline, imageBuffer, mimeType, imageSha256, traceId, requestId } = args;
  // v1 mobile still uploads ONE multipart part (multi-frame burst lands in
  // section-08).  We persist the single frame to disk and feed its path to
  // the sidecar; the wire shape (photo_paths: string[]) supports v2 burst
  // upload without a contract change.
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const photoDir = path.join(envConfig.photoDir, 'photos');
  await fs.mkdir(photoDir, { recursive: true });
  const photoPath = path.join(photoDir, `${imageSha256}.${ext}`);
  await fs.writeFile(photoPath, imageBuffer);

  // Idempotency key per §4.2: sha256 of concatenated frame hashes.
  // Single-frame burst → idempotency key == frame sha256.
  const idempotencyKey = crypto
    .createHash('sha256')
    .update(imageSha256)
    .digest('hex');

  let launch;
  try {
    launch = await pipeline.launchRun({
      idempotencyKey,
      photoPaths: [photoPath],
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
    return reply.code(200).send(launch.result);
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
    return reply.code(200).send(final.result);
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
