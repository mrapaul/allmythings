import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { detectStatusRoute } from '../../../routes/detect-status.route';
import {
  PipelineClient,
  PipelineUnavailableError,
  RunNotFoundError,
} from '../../../clients/pipeline.client';
import type { SceneObservation } from '../../../types/pipeline';

const SCENE: SceneObservation = {
  sceneId: 's',
  runId: 'r-9',
  frameIds: [],
  detections: [
    {
      id: 'd-1',
      bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      primaryLabel: 'Sofa',
      alternateLabels: [],
      vlmStructuredAttributes: {
        category: 'Furniture',
        description: 'leather couch',
        color: 'brown',
      },
      agreementScore: 1,
      contributingSignals: [],
      confidence: 0.9,
    },
  ],
  agreementCoverage: 0,
  agreementPrecision: 0,
  selfDiagnosisTriggered: false,
  rerunDepth: 0,
  flagged: false,
  processingMs: 5,
  errors: [],
  tileErrors: [],
};

interface MockPipeline extends PipelineClient {
  launchRun: ReturnType<typeof vi.fn>;
  getRun: ReturnType<typeof vi.fn>;
  waitForCompletion: ReturnType<typeof vi.fn>;
}

describe('GET /v1/detect/status/:workflowId — pipeline-service single path', () => {
  let app: FastifyInstance;
  let pipeline: MockPipeline;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    pipeline = {
      launchRun: vi.fn(),
      getRun: vi.fn(),
      waitForCompletion: vi.fn(),
    } as unknown as MockPipeline;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).pipeline = pipeline;
    await app.register(detectStatusRoute);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('succeeded → 200 with mapped DetectedItem[]', async () => {
    pipeline.getRun.mockResolvedValue({
      runId: 'r-9',
      status: 'succeeded',
      startedAt: 's',
      result: SCENE,
    });
    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/r-9' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('completed');
    expect(body.workflowId).toBe('r-9');
    expect(body.result.items).toHaveLength(1);
    expect(body.result.items[0].label).toBe('Sofa');
    expect(body.result.items[0].category).toBe('Furniture');
    expect(body.result.items[0].description).toBe('leather couch');
    expect(body.result.items[0].tags).toContain('brown');
    expect(body.result.items[0].box).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  });

  it('succeeded with no result → 200 with undefined result', async () => {
    pipeline.getRun.mockResolvedValue({
      runId: 'r-9',
      status: 'succeeded',
      startedAt: 's',
      // result: undefined
    });
    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/r-9' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('completed');
    expect(res.json().result).toBeUndefined();
  });

  it('running → 202', async () => {
    pipeline.getRun.mockResolvedValue({
      runId: 'r-9',
      status: 'running',
      startedAt: 's',
    });
    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/r-9' });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('running');
  });

  it('failed → 500', async () => {
    pipeline.getRun.mockResolvedValue({
      runId: 'r-9',
      status: 'failed',
      startedAt: 's',
      errorCode: 'boom',
      errorMessage: 'oops',
    });
    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/r-9' });
    expect(res.statusCode).toBe(500);
    expect(res.json().status).toBe('failed');
  });

  it('cancelled → 500', async () => {
    pipeline.getRun.mockResolvedValue({
      runId: 'r-9',
      status: 'cancelled',
      startedAt: 's',
    });
    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/r-9' });
    expect(res.statusCode).toBe(500);
  });

  it('timed_out → 500', async () => {
    pipeline.getRun.mockResolvedValue({
      runId: 'r-9',
      status: 'timed_out',
      startedAt: 's',
    });
    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/r-9' });
    expect(res.statusCode).toBe(500);
  });

  it('RunNotFoundError → 404', async () => {
    pipeline.getRun.mockRejectedValue(new RunNotFoundError('r-9'));
    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/r-9' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('run_not_found');
  });

  it('PipelineUnavailableError → 503', async () => {
    pipeline.getRun.mockRejectedValue(new PipelineUnavailableError('boom'));
    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/r-9' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('pipeline_unavailable');
  });

  it('no pipeline configured → 503', async () => {
    const bare = Fastify({ logger: false });
    await bare.register(detectStatusRoute);
    const res = await bare.inject({ method: 'GET', url: '/v1/detect/status/r-9' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('pipeline_unavailable');
    await bare.close();
  });
});
