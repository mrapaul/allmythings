import { FastifyInstance } from 'fastify';
import { registry } from '../telemetry/metrics';

export async function metricsRoute(app: FastifyInstance): Promise<void> {
  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });
}
