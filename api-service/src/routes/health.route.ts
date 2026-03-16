import { FastifyInstance } from 'fastify';
import { DetectionPipelineService } from '../services/detection-pipeline.service';

export async function healthRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = (app as any).pipeline as DetectionPipelineService;

  app.get('/v1/health', async (_request, reply) => {
    const providers = await pipeline.healthCheck();
    // Return 200 even if degraded so Docker doesn't restart it constantly
    // As long as at least one classifier (Gemini) is likely working
    const isFunctional = providers['gemini'] || Object.values(providers).some(Boolean);

    return reply.code(isFunctional ? 200 : 503).send({
      status: isFunctional ? (Object.values(providers).every(Boolean) ? 'healthy' : 'degraded') : 'unhealthy',
      providers,
      timestamp: new Date().toISOString(),
    });
  });
}
