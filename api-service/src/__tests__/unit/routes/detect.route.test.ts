import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import FormData from 'form-data';
import { detectRoute } from '../../../routes/detect.route';
import {
  PipelineClient,
  PipelineUnavailableError,
  QueueFullError,
} from '../../../clients/pipeline.client';
import type { SceneObservation } from '../../../types/pipeline';
import { envConfig } from '../../../config/env.config';

const SCENE: SceneObservation = {
  sceneId: 's-1',
  runId: 'r-1',
  frameIds: ['F0'],
  detections: [],
  agreementCoverage: 0,
  agreementPrecision: 0,
  selfDiagnosisTriggered: false,
  rerunDepth: 0,
  flagged: false,
  processingMs: 5,
  errors: [],
  tileErrors: [],
};

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD//gA7Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBFRyB2NjIp/9sAQwAIBgYHBgUIBwcHCQkICgwUDQwLCwwZEhMPFB0aHx4dGhwcICQuJyAiLCMcHCg3KSwwMTQ0NB8nOT04MjwuMzI/wAARCAABAAEDASIAAhEBAxEB/wAACwgABAACAQERAP/EABUAAQEAAAAAAAAAAAAAAAAAAAAJ/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAPwA/8H/2Q==',
  'base64',
);

interface MockPipeline extends PipelineClient {
  launchRun: ReturnType<typeof vi.fn>;
  getRun: ReturnType<typeof vi.fn>;
  waitForCompletion: ReturnType<typeof vi.fn>;
}

async function makeApp(opts: {
  pipeline?: MockPipeline;
  temporal?: unknown;
} = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).temporal = opts.temporal ?? {
    workflow: { start: vi.fn(), getHandle: vi.fn() },
  };
  if (opts.pipeline) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).pipeline = opts.pipeline;
  }
  return app;
}

async function postOne(app: FastifyInstance, image: Buffer = TINY_JPEG, mime = 'image/jpeg') {
  const form = new FormData();
  form.append('photo', image, { filename: 'frame.jpg', contentType: mime });
  return app.inject({
    method: 'POST',
    url: '/v1/detect',
    payload: form.getBuffer(),
    headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
  });
}

describe('POST /v1/detect — flag-on (USE_PIPELINE_SERVICE=true)', () => {
  let app: FastifyInstance;
  let pipeline: MockPipeline;

  beforeEach(async () => {
    vi.spyOn(envConfig, 'usePipelineService', 'get').mockReturnValue(true);
    pipeline = {
      launchRun: vi.fn(),
      getRun: vi.fn(),
      waitForCompletion: vi.fn(),
    } as unknown as MockPipeline;
    app = await makeApp({ pipeline });
    await app.register(detectRoute);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('idempotent_hit + status=succeeded → 200 with result, no waitForCompletion', async () => {
    pipeline.launchRun.mockResolvedValue({
      runId: 'r-1',
      startedAt: 'x',
      idempotentHit: true,
      status: 'succeeded',
      result: SCENE,
    });
    const res = await postOne(app);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(SCENE);
    expect(pipeline.waitForCompletion).not.toHaveBeenCalled();
  });

  it('202 launch + waitForCompletion succeeded → 200', async () => {
    pipeline.launchRun.mockResolvedValue({
      runId: 'r-2',
      startedAt: 'x',
      idempotentHit: false,
    });
    pipeline.waitForCompletion.mockResolvedValue({
      runId: 'r-2',
      status: 'succeeded',
      startedAt: 'x',
      result: SCENE,
    });
    const res = await postOne(app);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(SCENE);
    expect(pipeline.waitForCompletion).toHaveBeenCalledOnce();
  });

  it('waitForCompletion still running → 202 with runId + statusUrl', async () => {
    pipeline.launchRun.mockResolvedValue({
      runId: 'r-3',
      startedAt: 'x',
      idempotentHit: false,
    });
    pipeline.waitForCompletion.mockResolvedValue({
      runId: 'r-3',
      status: 'running',
      startedAt: 'x',
    });
    const res = await postOne(app);
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.runId).toBe('r-3');
    expect(body.statusUrl).toBe('/v1/detect/status/r-3');
  });

  it('QueueFullError → 503 with Retry-After header', async () => {
    pipeline.launchRun.mockRejectedValue(new QueueFullError(7, 4));
    const res = await postOne(app);
    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBe('7');
    const body = res.json();
    expect(body.error).toBe('queue_full');
    expect(body.retry_after_s).toBe(7);
  });

  it('PipelineUnavailableError → 503 (no Retry-After)', async () => {
    pipeline.launchRun.mockRejectedValue(new PipelineUnavailableError('boom'));
    const res = await postOne(app);
    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBeUndefined();
    expect(res.json().error).toBe('pipeline_unavailable');
  });

  it('idempotency_key is sha256 of the frame hash (single-frame burst)', async () => {
    pipeline.launchRun.mockResolvedValue({
      runId: 'r-4',
      startedAt: 'x',
      idempotentHit: false,
    });
    pipeline.waitForCompletion.mockResolvedValue({
      runId: 'r-4',
      status: 'succeeded',
      startedAt: 'x',
      result: SCENE,
    });
    await postOne(app);
    const args = pipeline.launchRun.mock.calls[0][0];
    expect(args.idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
    expect(args.photoPaths).toHaveLength(1);
  });
});

describe('POST /v1/detect — flag-off (legacy Temporal path)', () => {
  let app: FastifyInstance;
  let temporal: { workflow: { start: ReturnType<typeof vi.fn>; getHandle: ReturnType<typeof vi.fn> } };
  let mockHandle: { result: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.spyOn(envConfig, 'usePipelineService', 'get').mockReturnValue(false);
    mockHandle = { result: vi.fn() };
    temporal = {
      workflow: {
        start: vi.fn().mockResolvedValue(mockHandle),
        getHandle: vi.fn(),
      },
    };
    app = await makeApp({ temporal });
    await app.register(detectRoute);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('flag-off does NOT call pipeline.client at all (regression)', async () => {
    const pipeline = {
      launchRun: vi.fn(),
      getRun: vi.fn(),
      waitForCompletion: vi.fn(),
    } as unknown as MockPipeline;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).pipeline = pipeline;
    mockHandle.result.mockResolvedValue({ photoId: 'p1', items: [] });

    const res = await postOne(app);
    expect(res.statusCode).toBe(200);
    expect(pipeline.launchRun).not.toHaveBeenCalled();
    expect(pipeline.getRun).not.toHaveBeenCalled();
    expect(pipeline.waitForCompletion).not.toHaveBeenCalled();
  });
});
