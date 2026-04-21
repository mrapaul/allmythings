import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { WorkflowNotFoundError } from '@temporalio/client';
import { detectStatusRoute } from '../../../routes/detect-status.route';

describe('GET /v1/detect/status/:workflowId', () => {
  let app: FastifyInstance;
  let mockHandle: { describe: ReturnType<typeof vi.fn>; result: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    app = Fastify({ logger: false });
    mockHandle = {
      describe: vi.fn(),
      result: vi.fn(),
    };
    const mockTemporal = {
      workflow: {
        getHandle: vi.fn(() => mockHandle),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).temporal = mockTemporal;
    await app.register(detectStatusRoute);
  });

  it('returns 200 + result when workflow is COMPLETED', async () => {
    mockHandle.describe.mockResolvedValue({
      status: { name: 'COMPLETED' },
      startTime: new Date(),
    });
    mockHandle.result.mockResolvedValue({
      photoId: 'p1', photoUrl: '/photos/p1.jpg', itemCount: 0, items: [], errors: [], traceId: 't', processingMs: 10,
    });

    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/detect-abc' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('completed');
    expect(body.workflowId).toBe('detect-abc');
    expect(body.result.photoId).toBe('p1');
  });

  it('returns 202 + running when workflow is RUNNING', async () => {
    const now = new Date();
    mockHandle.describe.mockResolvedValue({
      status: { name: 'RUNNING' },
      startTime: now,
    });

    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/detect-xyz' });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.status).toBe('running');
    expect(body.workflowId).toBe('detect-xyz');
    expect(body.startedAt).toBeDefined();
  });

  it('returns 500 + failed when workflow is FAILED', async () => {
    mockHandle.describe.mockResolvedValue({
      status: { name: 'FAILED' },
      startTime: new Date(),
    });

    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/detect-bad' });
    expect(res.statusCode).toBe(500);
    expect(res.json().status).toBe('failed');
  });

  it('returns 500 + terminated when workflow is TERMINATED', async () => {
    mockHandle.describe.mockResolvedValue({
      status: { name: 'TERMINATED' },
      startTime: new Date(),
    });

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
