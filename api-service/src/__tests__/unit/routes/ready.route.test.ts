import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { readyRoute } from '../../../routes/ready.route';
import { envConfig } from '../../../config/env.config';

describe('GET /v1/ready — pipeline mode', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    envConfig.detector = 'pipeline';
    app = Fastify({ logger: false });
  });
  afterEach(async () => {
    envConfig.detector = 'vlm';
    vi.restoreAllMocks();
    await app.close();
  });

  it('returns 200 when pipeline is reachable and no providers are down', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).health = {
      snapshot: () => ({
        florence: { status: 'up', lastProbeMs: 0, lastLatencyMs: 0, consecutiveFailures: 0, lastError: null },
        ollama: { status: 'up', lastProbeMs: 0, lastLatencyMs: 0, consecutiveFailures: 0, lastError: null },
        pipeline: { status: 'up', lastProbeMs: 0, lastLatencyMs: 0, consecutiveFailures: 0, lastError: null },
      }),
    };
    await app.register(readyRoute);
    const res = await app.inject({ method: 'GET', url: '/v1/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ready).toBe(true);
    expect(body.checks.pipeline).toBe(true);
    expect(body.reasons).toEqual([]);
  });

  it('returns 503 when pipeline is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('econnrefused'));
    await app.register(readyRoute);
    const res = await app.inject({ method: 'GET', url: '/v1/ready' });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.ready).toBe(false);
    expect(body.reasons.some((r: string) => r.startsWith('pipeline_unreachable'))).toBe(true);
  });

  it('returns 503 when pipeline returns non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);
    await app.register(readyRoute);
    const res = await app.inject({ method: 'GET', url: '/v1/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json().reasons).toContain('pipeline_status_500');
  });

  it('returns 503 when florence provider is down', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).health = {
      snapshot: () => ({
        florence: { status: 'down', lastProbeMs: 0, lastLatencyMs: 0, consecutiveFailures: 5, lastError: 'down' },
        ollama: { status: 'up', lastProbeMs: 0, lastLatencyMs: 0, consecutiveFailures: 0, lastError: null },
        pipeline: { status: 'up', lastProbeMs: 0, lastLatencyMs: 0, consecutiveFailures: 0, lastError: null },
      }),
    };
    await app.register(readyRoute);
    const res = await app.inject({ method: 'GET', url: '/v1/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json().reasons).toContain('florence_down');
  });
});

describe('GET /v1/ready — VLM mode', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    envConfig.detector = 'vlm';
    app = Fastify({ logger: false });
  });
  afterEach(async () => {
    envConfig.detector = 'vlm';
    vi.restoreAllMocks();
    await app.close();
  });

  it('returns 200 when Ollama is reachable (ignores pipeline/florence)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
    await app.register(readyRoute);
    const res = await app.inject({ method: 'GET', url: '/v1/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ready).toBe(true);
    expect(body.checks.ollama).toBe(true);
  });

  it('returns 503 when Ollama is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('econnrefused'));
    await app.register(readyRoute);
    const res = await app.inject({ method: 'GET', url: '/v1/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json().reasons.some((r: string) => r.startsWith('ollama_unreachable'))).toBe(true);
  });
});
