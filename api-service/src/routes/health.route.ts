import { FastifyInstance } from 'fastify';
import { VisionOrchestratorService } from '../services/vision-orchestrator.service';

/**
 * GET /v1/health - Service health check
 */
export async function healthRoute(fastify: FastifyInstance): Promise<void> {
  const orchestrator = new VisionOrchestratorService();

  fastify.get('/v1/health', async (_request, reply) => {
    try {
      const providerHealth = await orchestrator.healthCheck();

      const allHealthy = Object.values(providerHealth).every((h) => h);

      return reply.code(allHealthy ? 200 : 503).send({
        status: allHealthy ? 'healthy' : 'degraded',
        providers: providerHealth,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return reply.code(503).send({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Health check failed',
        timestamp: new Date().toISOString(),
      });
    }
  });
}
