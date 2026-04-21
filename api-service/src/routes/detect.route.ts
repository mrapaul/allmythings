import crypto from 'node:crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Client, WorkflowIdReusePolicy, WorkflowNotFoundError } from '@temporalio/client';
import { detectInventoryWorkflow } from '../temporal/workflows/detect-inventory.workflow';
import { TASK_QUEUES } from '../temporal/task-queues';
import { envConfig } from '../config/env.config';
import { BadRequestError, PayloadTooLargeError } from '../utils/errors';
import { logger } from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function detectRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const temporal = (app as any).temporal as Client;

  app.post('/v1/detect', { preHandler: authMiddleware }, async (request: FastifyRequest, reply: FastifyReply) => {
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
    const workflowId = `detect-${imageSha256}`;
    // Extract traceparent trace_id component (format: '00-<traceId>-<spanId>-<flags>')
    const traceparent = request.headers['traceparent']?.toString();
    const traceId = traceparent?.split('-')[1] ?? crypto.randomBytes(16).toString('hex');
    const requestId = request.id;

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
  });
}
