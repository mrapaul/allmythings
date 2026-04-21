import { FastifyInstance } from 'fastify';
import { Client, WorkflowNotFoundError } from '@temporalio/client';

export async function detectStatusRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const temporal = (app as any).temporal as Client;

  app.get<{ Params: { workflowId: string } }>('/v1/detect/status/:workflowId', async (request, reply) => {
    const { workflowId } = request.params;
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
      // RUNNING, CONTINUED_AS_NEW, or anything else in flight
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
