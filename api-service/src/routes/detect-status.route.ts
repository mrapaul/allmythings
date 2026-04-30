import { FastifyInstance } from 'fastify';
import { Client, WorkflowNotFoundError } from '@temporalio/client';
import { envConfig } from '../config/env.config';
import {
  PipelineClient,
  PipelineUnavailableError,
  RunNotFoundError,
} from '../clients/pipeline.client';

export async function detectStatusRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const temporal = (app as any).temporal as Client;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = (app as any).pipeline as PipelineClient | undefined;

  app.get<{ Params: { workflowId: string } }>('/v1/detect/status/:workflowId', async (request, reply) => {
    const { workflowId } = request.params;

    if (envConfig.usePipelineService) {
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
              result: status.result,
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
    }

    // Legacy Temporal path — unchanged behaviour.
    try {
      const handle = temporal.workflow.getHandle(workflowId);
      const desc = await handle.describe();
      const statusName = desc.status.name;

      if (statusName === 'COMPLETED') {
        const result = await handle.result();
        return reply.code(200).send({ status: 'completed', workflowId, result });
      }
      if (statusName === 'FAILED' || statusName === 'TERMINATED' || statusName === 'CANCELLED' || statusName === 'TIMED_OUT') {
        return reply.code(500).send({ status: statusName.toLowerCase(), workflowId });
      }
      return reply.code(202).send({
        status: 'running',
        workflowId,
        startedAt: desc.startTime,
      });
    } catch (err) {
      if (err instanceof WorkflowNotFoundError) {
        return reply.code(404).send({ error: 'workflow_not_found', workflowId });
      }
      throw err;
    }
  });
}
