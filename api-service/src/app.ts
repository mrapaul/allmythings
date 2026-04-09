import { initTelemetry } from './telemetry';
void initTelemetry();
import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { envConfig } from './config/env.config';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { detectRoute } from './routes/detect.route';
import { healthRoute } from './routes/health.route';
import { DetectionPipelineService } from './services/detection-pipeline.service';
import { GroundingDinoDetector } from './providers/grounding-dino.detector';
import { GoogleVisionDetector } from './providers/google-vision.detector';
import { GeminiClassifier } from './providers/gemini.classifier';
import { OllamaClassifier } from './providers/ollama.classifier';
import { MockClassifier } from './providers/mock.classifier';

process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Uncaught Exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection');
});

export async function buildApp(options?: { disableRateLimit?: boolean; pipeline?: DetectionPipelineService }): Promise<FastifyInstance> {
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

  // Create detection pipeline
  const pipeline = options?.pipeline ?? createDefaultPipeline();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).pipeline = pipeline;

  await app.register(detectRoute);
  await app.register(healthRoute);

  app.get('/', () => ({
    service: 'Visual Home Inventory - API Service',
    version: '2.0.0',
    endpoints: { detection: 'POST /v1/detect', health: 'GET /v1/health' },
  }));

  return app;
}

function createDefaultPipeline(): DetectionPipelineService {
  const detectors = [];
  const classifiers = [];

  if (envConfig.useMockAi) {
    logger.info('Using Mock AI for detection pipeline');
    classifiers.push(new MockClassifier());
    return new DetectionPipelineService([], classifiers);
  }

  detectors.push(new GroundingDinoDetector(envConfig));
  if (envConfig.googleProjectId) {
    detectors.push(new GoogleVisionDetector(envConfig));
  }

  if (envConfig.geminiApiKey) {
    classifiers.push(new GeminiClassifier(envConfig));
  }
  if (envConfig.ollamaEnabled) {
    classifiers.push(new OllamaClassifier(envConfig));
  }

  return new DetectionPipelineService(detectors, classifiers);
}

async function start(): Promise<void> {
  try {
    const app = await buildApp();
    const address = await app.listen({ port: envConfig.port, host: '0.0.0.0' });
    logger.info({ address, port: envConfig.port, nodeEnv: envConfig.nodeEnv }, 'Server started');

    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down');
      await app.close();
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
