import os from 'os';
import { FastifyInstance } from 'fastify';
import { envConfig } from '../config/env.config';
import { ProviderHealthService } from '../services/provider-health.service';

export async function healthRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const health = (app as any).health as ProviderHealthService;

  app.get('/v1/health', async (_request, reply) => {
    const snapshot = health.snapshot();
    const florenceUp = snapshot.florence.status === 'up';
    const ollamaUp = snapshot.ollama.status === 'up';
    const pipelineUp = snapshot.pipeline.status === 'up';

    // The load-bearing dependency depends on the active detector. In VLM mode
    // (default) it is Ollama; the pipeline/Florence stack is not used.
    let isFunctional: boolean;
    let allUp: boolean;
    if (envConfig.detector === 'vlm') {
      isFunctional = ollamaUp;
      allUp = ollamaUp;
    } else {
      isFunctional = pipelineUp && florenceUp;
      allUp = pipelineUp && florenceUp && ollamaUp;
    }
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
