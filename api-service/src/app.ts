import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { envConfig } from './config/env.config';
import { logger } from './utils/logger';
import { detectRoute } from './routes/detect.route';
import { healthRoute } from './routes/health.route';

/**
 * Main Fastify application
 */

async function buildApp() {
  const app = Fastify({
    logger: logger,
    bodyLimit: 10 * 1024 * 1024, // 10MB for images
  });

  // Register plugins
  await app.register(cors, {
    origin: true, // Allow all origins in development
  });

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 1,
    },
  });

  await app.register(rateLimit, {
    max: 100, // 100 requests
    timeWindow: '1 minute',
  });

  // Register routes
  await app.register(detectRoute);
  await app.register(healthRoute);

  // Root endpoint
  app.get('/', async () => {
    return {
      service: 'Visual Home Inventory - Vision API',
      version: '1.0.0',
      status: 'running',
      endpoints: [
        'POST /v1/detect',
        'GET /v1/health',
      ],
    };
  });

  return app;
}

async function start() {
  try {
    const app = await buildApp();

    await app.listen({
      port: envConfig.port,
      host: '0.0.0.0',
    });

    logger.info(
      { port: envConfig.port, nodeEnv: envConfig.nodeEnv },
      'Server started successfully'
    );
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}

// Start server if run directly
if (require.main === module) {
  start();
}

export { buildApp, start };
