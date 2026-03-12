import { FastifyInstance } from 'fastify';
import { DetectionPipelineService } from '../services/detection-pipeline.service';

export async function healthRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = (app as any).pipeline as DetectionPipelineService;

  app.get('/v1/health', async (_request, reply) => {
    const providers = await pipeline.healthCheck();
    const allHealthy = Object.values(providers).every(Boolean);

    return reply.code(allHealthy ? 200 : 503).send({
      status: allHealthy ? 'healthy' : 'degraded',
      providers,
      timestamp: new Date().toISOString(),
    });
  });
}
