import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { WorkflowNotFoundError } from '@temporalio/client';
import { detectStatusRoute } from '../../../routes/detect-status.route';
import {
  PipelineClient,
  PipelineUnavailableError,
  RunNotFoundError,
} from '../../../clients/pipeline.client';
import type { SceneObservation } from '../../../types/pipeline';
import { envConfig } from '../../../config/env.config';

const SCENE: SceneObservation = {
  sceneId: 's',
  runId: 'r-9',
  frameIds: [],
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

interface MockPipeline extends PipelineClient {
  launchRun: ReturnType<typeof vi.fn>;
  getRun: ReturnType<typeof vi.fn>;
  waitForCompletion: ReturnType<typeof vi.fn>;
}

describe('GET /v1/detect/status/:workflowId — flag-off (legacy Temporal)', () => {
  let app: FastifyInstance;
  let mockHandle: { describe: ReturnType<typeof vi.fn>; result: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.spyOn(envConfig, 'usePipelineService', 'get').mockReturnValue(false);
    app = Fastify({ logger: false });
    mockHandle = { describe: vi.fn(), result: vi.fn() };
    const mockTemporal = { workflow: { getHandle: vi.fn(() => mockHandle) } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).temporal = mockTemporal;
    await app.register(detectStatusRoute);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('returns 200 + result when workflow is COMPLETED', async () => {
    mockHandle.describe.mockResolvedValue({ status: { name: 'COMPLETED' }, startTime: new Date() });
    mockHandle.result.mockResolvedValue({
      photoId: 'p1', photoUrl: '/photos/p1.jpg', itemCount: 0, items: [], errors: [], traceId: 't', processingMs: 10,
    });
    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/detect-abc' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('completed');
  });

  it('returns 202 + running when workflow is RUNNING', async () => {
    mockHandle.describe.mockResolvedValue({ status: { name: 'RUNNING' }, startTime: new Date() });
    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/detect-xyz' });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('running');
  });

  it('returns 500 + failed when workflow is FAILED', async () => {
    mockHandle.describe.mockResolvedValue({ status: { name: 'FAILED' }, startTime: new Date() });
    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/detect-bad' });
    expect(res.statusCode).toBe(500);
    expect(res.json().status).toBe('failed');
  });

  it('returns 500 + terminated when workflow is TERMINATED', async () => {
    mockHandle.describe.mockResolvedValue({ status: { name: 'TERMINATED' }, startTime: new Date() });
    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/detect-killed' });
    expect(res.statusCode).toBe(500);
    expect(res.json().status).toBe('terminated');
  });

  it('returns 404 when workflow is not found', async () => {
    mockHandle.describe.mockRejectedValue(new WorkflowNotFoundError('not found', 'detect-missing', 'rid'));
    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/detect-missing' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('workflow_not_found');
  });
});

describe('GET /v1/detect/status/:workflowId — flag-on (pipeline-service)', () => {
  let app: FastifyInstance;
  let pipeline: MockPipeline;

  beforeEach(async () => {
    vi.spyOn(envConfig, 'usePipelineService', 'get').mockReturnValue(true);
    app = Fastify({ logger: false });
    pipeline = {
      launchRun: vi.fn(),
      getRun: vi.fn(),
      waitForCompletion: vi.fn(),
    } as unknown as MockPipeline;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).pipeline = pipeline;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).temporal = { workflow: { getHandle: vi.fn() } };
    await app.register(detectStatusRoute);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('succeeded → 200 with SceneObservation', async () => {
    pipeline.getRun.mockResolvedValue({
      runId: 'r-9',
      status: 'succeeded',
      startedAt: 's',
      result: SCENE,
    });
    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/r-9' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('completed');
    expect(res.json().result).toEqual(SCENE);
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

  it('flag-on does NOT call temporal (regression)', async () => {
    pipeline.getRun.mockResolvedValue({
      runId: 'r-9',
      status: 'succeeded',
      startedAt: 's',
      result: SCENE,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const temporal = (app as any).temporal as { workflow: { getHandle: ReturnType<typeof vi.fn> } };
    await app.inject({ method: 'GET', url: '/v1/detect/status/r-9' });
    expect(temporal.workflow.getHandle).not.toHaveBeenCalled();
  });
});
