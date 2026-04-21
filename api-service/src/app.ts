import { initTelemetry } from './telemetry';
void initTelemetry();
import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { envConfig } from './config/env.config';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { detectRoute } from './routes/detect.route';
import { healthRoute } from './routes/health.route';
import { getTemporalClient, closeTemporalClient } from './temporal/client';
import { createWorker, runWorker, closeWorker } from './temporal/worker';
import { ProviderHealthService } from './services/provider-health.service';
import { advertiseService } from './utils/bonjour-advertiser';

process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Uncaught Exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection');
});

export async function buildApp(options?: { disableRateLimit?: boolean }): Promise<FastifyInstance> {
  const app = Fastify({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger: logger as any,
    bodyLimit: 10 * 1024 * 1024,
    requestIdLogLabel: 'requestId',
    trustProxy: true,
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  await app.register(cors, { origin: true, credentials: true });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

  if (!options?.disableRateLimit) {
    await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  }

  // Serve stored photos as static files
  const photoDir = path.join(envConfig.photoDir, 'photos');
  fs.mkdirSync(photoDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: photoDir,
    prefix: '/photos/',
    decorateReply: false,
  });

  // Temporal client (lazy-connects; becomes workflow orchestration surface)
  const temporal = await getTemporalClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).temporal = temporal;

  // Provider health service (periodic probes, independent of workflows)
  const health = new ProviderHealthService({
    florenceUrl: envConfig.florenceUrl,
    ollamaUrl: envConfig.ollamaBaseUrl,
    temporalHost: envConfig.temporalHost,
  });
  health.start();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).health = health;

  app.addHook('onClose', async () => {
    health.stop();
  });

  await app.register(detectRoute);
  await app.register(healthRoute);

  app.get('/', () => ({
    service: 'Visual Home Inventory - API Service',
    version: '3.0.0',
    endpoints: {
      detection: 'POST /v1/detect',
      detectionStatus: 'GET /v1/detect/status/:workflowId',
      health: 'GET /v1/health',
      photos: 'GET /photos/:filename',
    },
  }));

  return app;
}

async function start(): Promise<void> {
  try {
    const app = await buildApp();
    const address = await app.listen({ port: envConfig.port, host: '0.0.0.0' });
    logger.info({ address, port: envConfig.port, nodeEnv: envConfig.nodeEnv }, 'Server started');

    // Start Temporal worker in-process (same lifecycle as HTTP server)
    await createWorker();
    void runWorker();

    const stopBonjour = advertiseService(envConfig.port);
    logger.info({ name: 'allmythings-server', port: envConfig.port }, 'Bonjour advertisement started');

    const shutdown = async (signal: string): Promise<void> => {
      logger.info({ signal }, 'Shutting down');
      stopBonjour();
      await app.close();
      await closeWorker();
      await closeTemporalClient();
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  start();
}

export { start };
