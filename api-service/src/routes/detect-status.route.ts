import { FastifyInstance } from 'fastify';
import {
  PipelineClient,
  PipelineUnavailableError,
  RunNotFoundError,
} from '../clients/pipeline.client';
import { mapSceneToItems } from './detect.mapper';
import { envConfig } from '../config/env.config';
import type { VlmRunStore } from '../services/vlm-run-store';

export async function detectStatusRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = (app as any).pipeline as PipelineClient | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vlmRuns = (app as any).vlmRuns as VlmRunStore | undefined;

  app.get<{ Params: { workflowId: string } }>('/v1/detect/status/:workflowId', async (request, reply) => {
    const { workflowId } = request.params;

    // VLM async runs live in the in-memory run store. Partial items are
    // served while running so the app can render results incrementally.
    if (envConfig.detector === 'vlm') {
      const run = vlmRuns?.get(workflowId);
      if (!run) {
        return reply.code(404).send({ error: 'run_not_found', workflowId });
      }
      if (run.status === 'failed') {
        return reply.code(500).send({
          status: 'failed',
          workflowId,
          errorCode: 'detector_failed',
          errorMessage: run.error,
        });
      }
      const payload = {
        status: run.status === 'completed' ? 'completed' : 'running',
        workflowId,
        photoSha256: run.photoSha256,
        scene: run.scene,
        result: { items: run.items, mergeSuggestions: run.mergeSuggestions },
      };
      return reply.code(run.status === 'completed' ? 200 : 202).send(payload);
    }

    if (!pipeline) {
      return reply.code(503).send({ error: 'pipeline_unavailable' });
    }

    try {
      const status = await pipeline.getRun(workflowId);
      switch (status.status) {
        case 'running':
          return reply.code(202).send({
            status: 'running',
            workflowId: status.runId,
            startedAt: status.startedAt,
          });
        case 'succeeded':
          return reply.code(200).send({
            status: 'completed',
            workflowId: status.runId,
            result: status.result ? { items: mapSceneToItems(status.result) } : undefined,
          });
        case 'failed':
        case 'cancelled':
        case 'timed_out':
          return reply.code(500).send({
            status: status.status,
            workflowId: status.runId,
            errorCode: status.errorCode,
            errorMessage: status.errorMessage,
          });
      }
    } catch (err) {
      if (err instanceof RunNotFoundError) {
        return reply.code(404).send({ error: 'run_not_found', workflowId });
      }
      if (err instanceof PipelineUnavailableError) {
        return reply.code(503).send({ error: 'pipeline_unavailable' });
      }
      throw err;
    }
  });
}
