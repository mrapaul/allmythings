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

async function makeApp(opts: { pipeline?: MockPipeline } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 3 },
  });
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

async function postBurst(
  app: FastifyInstance,
  frames: Buffer[],
  { mime = 'image/jpeg' }: { mime?: string } = {},
) {
  const form = new FormData();
  for (let i = 0; i < frames.length; i++) {
    form.append('photo', frames[i], {
      filename: `frame-${i}.jpg`,
      contentType: mime,
    });
  }
  return app.inject({
    method: 'POST',
    url: '/v1/detect',
    payload: form.getBuffer(),
    headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
  });
}

describe('POST /v1/detect — pipeline-service single path', () => {
  let app: FastifyInstance;
  let pipeline: MockPipeline;

  beforeEach(async () => {
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

  it('3-part burst upload → photoPaths length 3, idempotency = sha256(concat(sha256(f0..2)))', async () => {
    pipeline.launchRun.mockResolvedValue({
      runId: 'r-burst',
      startedAt: 'x',
      idempotentHit: false,
    });
    pipeline.waitForCompletion.mockResolvedValue({
      runId: 'r-burst',
      status: 'succeeded',
      startedAt: 'x',
      result: SCENE,
    });

    const f0 = Buffer.concat([TINY_JPEG, Buffer.from('A')]);
    const f1 = Buffer.concat([TINY_JPEG, Buffer.from('B')]);
    const f2 = Buffer.concat([TINY_JPEG, Buffer.from('C')]);

    const res = await postBurst(app, [f0, f1, f2]);
    expect(res.statusCode).toBe(200);

    const args = pipeline.launchRun.mock.calls[0][0];
    expect(args.photoPaths).toHaveLength(3);

    // idempotency formula: sha256(concat(sha256(f0)|sha256(f1)|sha256(f2)))
    // matched against the canonical Node implementation here so the
    // mobile client can mirror it byte-for-byte.
    const crypto = await import('node:crypto');
    const hashes = [f0, f1, f2].map((b) =>
      crypto.createHash('sha256').update(b).digest(),
    );
    const expected = crypto
      .createHash('sha256')
      .update(Buffer.concat(hashes))
      .digest('hex');
    expect(args.idempotencyKey).toBe(expected);
  });

  it('rejects 0-frame upload as 400', async () => {
    const res = await postBurst(app, []);
    expect(res.statusCode).toBe(400);
  });

  it('returns 503 when no pipeline client is wired', async () => {
    const bare = await makeApp(); // no pipeline
    await bare.register(detectRoute);
    const res = await postOne(bare);
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('pipeline_unavailable');
    await bare.close();
  });
});
