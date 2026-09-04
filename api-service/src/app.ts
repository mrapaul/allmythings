import { initTelemetry } from './telemetry';
void initTelemetry();
import { shutdownOtel } from './telemetry/otel-init';
import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import path from 'node:path';
import fs from 'node:fs';
import { envConfig } from './config/env.config';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { installProcessGuards } from './utils/process-guards';
import { detectRoute } from './routes/detect.route';
import { labelRoute } from './routes/label.route';
import { precheckRoute } from './routes/precheck.route';
import { correctionsRoute } from './routes/corrections.route';
import { detectStreamRoute } from './routes/detect-stream.route';
import { detectStatusRoute } from './routes/detect-status.route';
import { healthRoute } from './routes/health.route';
import { readyRoute } from './routes/ready.route';
import { metricsRoute } from './routes/metrics.route';
import { ProviderHealthService } from './services/provider-health.service';
import { FlywheelService } from './services/flywheel.service';
import { advertiseService } from './utils/bonjour-advertiser';
import { CircuitBreaker } from './utils/circuit-breaker';
import { createPipelineClient } from './clients/pipeline.client';
import {
  createEmbeddingsService,
  createLabelClient,
  createPossessionJudge,
  createVlmDetector,
} from './services/vlm-detector.factory';
import { vocabRoute } from './routes/vocab.route';
import { enrichRoute } from './routes/enrich.route';
import { createPrecheckService } from './services/precheck.service';
import { createEnrichService } from './services/enrich.service';
import { VlmRunStore } from './services/vlm-run-store';
import { detectedItemSchema } from './schemas/detected-item.schema';

// unhandledRejection logs and continues; uncaughtException stays fatal.
// Rationale in process-guards.ts (telemetry outages must never kill runs).
installProcessGuards();

export async function buildApp(options?: { disableRateLimit?: boolean }): Promise<FastifyInstance> {
  const app = Fastify({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger: logger as any,
    bodyLimit: 10 * 1024 * 1024,
    requestIdLogLabel: 'requestId',
    trustProxy: true,
  });

  app.addSchema(detectedItemSchema);

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  await app.register(cors, { origin: true, credentials: true });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 3 } });

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

  // Pipeline-service client. Section-10 made this the only path; the
  // route layer 503's fast if it isn't configured.
  const breaker = new CircuitBreaker('pipeline-service', {
    failureThreshold: 5,
    resetTimeout: 30_000,
    halfOpenRequests: 1,
  });
  const pipeline = createPipelineClient({
    baseUrl: envConfig.pipelineUrl,
    circuitBreaker: breaker,
    longPollTimeoutS: envConfig.pipelineLongPollTimeoutS,
    maxRpsPerRun: envConfig.pipelineMaxRps,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).pipeline = pipeline;

  // Self-hosted two-pass VLM detector (DETECTOR=vlm path). When active, the
  // detect routes use this instead of the pipeline-service sidecar — no GPU,
  // Dagster, or Florence/DINO stack required, just a reachable Ollama.
  // Embedding client for POST /v1/vocab/match (search expansion), the one place
  // where "widen the net" is the right failure mode. Deliberately NOT used for
  // merge decisions: cosine is not monotone in synonymy on this vocabulary.
  const embeddings = createEmbeddingsService();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).embeddings = embeddings;

  if (envConfig.detector === 'vlm') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detector = createVlmDetector(createPossessionJudge());
    (app as any).vlmDetector = detector;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // Durable: runs are mirrored to <photoDir>/runs so a restart (e.g. the
    // telemetry incident) never turns a completed run into run_not_found.
    (app as any).vlmRuns = new VlmRunStore(detector, { dataDir: envConfig.photoDir });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).labelClient = createLabelClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).flywheel = new FlywheelService(envConfig.photoDir);
    logger.info(
      {
        model: envConfig.ollamaModel,
        ollama: envConfig.ollamaBaseUrl,
        embeddingModel: envConfig.embeddingsEnabled ? envConfig.embeddingModel : 'disabled',
      },
      'vlm_detector_active',
    );
  }

  // Capture precheck — fast preview-frame verdict over the same Ollama
  // backend/config the detector chain uses. Independent of DETECTOR mode and
  // fail-open, so it is always wired.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).precheckService = createPrecheckService();

  // Item enrichment — close-look second pass on saved item crops using the
  // detection model. Fail-open and internally serialized (concurrency 1), so
  // it is always wired like the precheck.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).enrichService = createEnrichService();

  // Provider health service (periodic probes against pipeline + tier-1 LLM)
  const health = new ProviderHealthService({
    florenceUrl: envConfig.florenceUrl,
    ollamaUrl: envConfig.ollamaBaseUrl,
    pipelineUrl: envConfig.pipelineUrl,
  });
  health.start();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).health = health;

  app.addHook('onClose', async () => {
    health.stop();
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Visual Home Inventory API', version: '2.0.0' },
      servers: [{ url: '/' }],
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
      security: [{ bearerAuth: [] }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(detectRoute);
  await app.register(labelRoute);
  await app.register(vocabRoute);
  await app.register(precheckRoute);
  await app.register(enrichRoute);
  await app.register(correctionsRoute);
  await app.register(detectStreamRoute);
  await app.register(detectStatusRoute);
  await app.register(healthRoute);
  await app.register(readyRoute);
  await app.register(metricsRoute);

  app.get('/', () => ({
    service: 'Visual Home Inventory - API Service',
    version: '3.0.0',
    endpoints: {
      detection: 'POST /v1/detect',
      vocabMatch: 'POST /v1/vocab/match',
      detectionStatus: 'GET /v1/detect/status/:workflowId',
      health: 'GET /v1/health',
      ready: 'GET /v1/ready',
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

    const stopBonjour = advertiseService(envConfig.port);
    logger.info({ name: 'allmythings-server', port: envConfig.port }, 'Bonjour advertisement started');

    // Exit is guaranteed: every step is caught, and shutdownOtel() itself
    // never throws or hangs (a collector-down flush used to reject here,
    // killing the chain before process.exit(0) — the process then lingered
    // until launchd force-killed it).
    const shutdown = async (signal: string): Promise<void> => {
      logger.info({ signal }, 'Shutting down');
      try {
        stopBonjour();
        await app.close();
      } catch (err: unknown) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'shutdown_close_failed',
        );
      }
      await shutdownOtel();
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
