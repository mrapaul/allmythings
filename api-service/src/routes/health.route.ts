import os from 'os';
import { FastifyInstance } from 'fastify';
import { ProviderHealthService } from '../services/provider-health.service';

export async function healthRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const health = (app as any).health as ProviderHealthService;

  app.get('/v1/health', async (_request, reply) => {
    const snapshot = health.snapshot();
    const temporalUp = snapshot.temporal.status === 'up';
    const florenceUp = snapshot.florence.status === 'up';
    const ollamaUp = snapshot.ollama.status === 'up';

    // Temporal AND Florence are required minimum — florence-only fallback
    // is still usable when Ollama is down, but not without Florence or Temporal.
    const isFunctional = temporalUp && florenceUp;
    const allUp = temporalUp && florenceUp && ollamaUp;
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
