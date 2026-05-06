import os from 'os';
import { FastifyInstance } from 'fastify';
import { ProviderHealthService } from '../services/provider-health.service';

export async function healthRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const health = (app as any).health as ProviderHealthService;

  app.get('/v1/health', async (_request, reply) => {
    const snapshot = health.snapshot();
    const florenceUp = snapshot.florence.status === 'up';
    const ollamaUp = snapshot.ollama.status === 'up';
    const pipelineUp = snapshot.pipeline.status === 'up';

    // Pipeline is the load-bearing dependency post-section-10. Florence
    // remains a soft requirement (mock stand-in is OK in dev). Ollama
    // failure degrades but does not unhealth the service.
    const isFunctional = pipelineUp && florenceUp;
    const allUp = pipelineUp && florenceUp && ollamaUp;
    const status = allUp ? 'healthy' : isFunctional ? 'degraded' : 'unhealthy';

    return reply.code(isFunctional ? 200 : 503).send({
      status,
      version: '3.0.0',
      uptime: process.uptime(),
      system: {
        memory: {
          free: os.freemem(),
          total: os.totalmem(),
          usage: 1 - os.freemem() / os.totalmem(),
        },
        load: os.loadavg(),
      },
      providers: snapshot,
      timestamp: new Date().toISOString(),
    });
  });
}
