import { FastifyInstance } from 'fastify';
import os from 'os';
import { DetectionPipelineService } from '../services/detection-pipeline.service';

export async function healthRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = (app as any).pipeline as DetectionPipelineService;

  app.get('/v1/health', async (_request, reply) => {
    const providers = await pipeline.healthCheck();
    
    // Check if Gemini is working (our primary production provider)
    const geminiStatus = providers['gemini'] === true;
    const anyProviderStatus = Object.values(providers).some(Boolean);
    
    const isFunctional = geminiStatus || anyProviderStatus;

    return reply.code(isFunctional ? 200 : 503).send({
      status: isFunctional ? (Object.values(providers).every(Boolean) ? 'healthy' : 'degraded') : 'unhealthy',
      version: '2.0.0',
      uptime: process.uptime(),
      system: {
        memory: {
          free: os.freemem(),
          total: os.totalmem(),
          usage: 1 - os.freemem() / os.totalmem(),
        },
        load: os.loadavg(),
      },
      providers,
      timestamp: new Date().toISOString(),
    });
  });
}
