import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { envConfig } from './config/env.config';
import { logger } from './utils/logger';
import { initDatabase, closeDatabase } from './db/database';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

// Routes
import { detectRoute } from './routes/detect.route';
import { healthRoute } from './routes/health.route';
import { itemsRoute } from './routes/items.route';
import { labelsRoute } from './routes/labels.route';
import { searchRoute } from './routes/search.route';
import { syncRoute } from './routes/sync.route';

/**
 * Main Fastify application
 */

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger: logger as any,
    bodyLimit: 10 * 1024 * 1024, // 10MB for images
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
    trustProxy: true,
  });

  // Register error handlers
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  // Register plugins
  await app.register(cors, {
    origin: true, // Allow all origins in development
    credentials: true,
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
    ban: 10, // Ban after 10 violations
  });

  // Initialize database (optional for testing detection endpoint)
  try {
    await initDatabase();
    logger.info('Database initialized');
  } catch (error) {
    logger.warn('Database initialization failed, continuing without database');
  }

  // Register routes
  await app.register(detectRoute);
  await app.register(healthRoute);
  await app.register(itemsRoute);
  await app.register(labelsRoute);
  await app.register(searchRoute);
  await app.register(syncRoute);

  // Root endpoint
  app.get('/', () => {
    return {
      service: 'Visual Home Inventory - API Service',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        detection: 'POST /v1/detect',
        health: 'GET /v1/health',
        items: {
          list: 'GET /v1/items',
          get: 'GET /v1/items/:id',
          create: 'POST /v1/items',
          update: 'PATCH /v1/items/:id',
          delete: 'DELETE /v1/items/:id',
        },
        labels: {
          create: 'POST /v1/labels',
          update: 'PATCH /v1/labels/:id',
          delete: 'DELETE /v1/labels/:id',
        },
        search: 'GET /v1/search',
        sync: {
          pull: 'GET /v1/sync',
          push: 'POST /v1/sync',
        },
      },
    };
  });

  // Graceful shutdown
  app.addHook('onClose', async () => {
    logger.info('Closing database connection');
    await closeDatabase();
  });

  return app;
}

async function start(): Promise<void> {
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

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');
      await app.close();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error(error, 'Failed to start server');
    await closeDatabase();
    process.exit(1);
  }
}

// Start server if run directly
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  start();
}

export { buildApp, start };
