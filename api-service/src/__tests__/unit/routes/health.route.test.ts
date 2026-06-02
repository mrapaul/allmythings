import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { healthRoute } from '../../../routes/health.route';
import { envConfig } from '../../../config/env.config';
import type { ProviderHealthService, HealthSnapshot, ProviderState } from '../../../services/provider-health.service';

function makeState(status: 'unknown' | 'up' | 'down'): ProviderState {
  return { status, lastProbeMs: Date.now(), lastLatencyMs: 5, consecutiveFailures: status === 'down' ? 1 : 0, lastError: null };
}

function makeHealth(snapshot: HealthSnapshot): Pick<ProviderHealthService, 'snapshot'> {
  return { snapshot: () => snapshot };
}

describe('GET /v1/health — pipeline mode', () => {
  let app: FastifyInstance;
  beforeEach(() => {
    envConfig.detector = 'pipeline';
  });
  afterEach(() => {
    envConfig.detector = 'vlm';
  });

  async function setup(snapshot: HealthSnapshot) {
    app = Fastify({ logger: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).health = makeHealth(snapshot);
    await app.register(healthRoute);
  }

  it('returns 200 + healthy when all three providers are up', async () => {
    await setup({
      florence: makeState('up'),
      ollama: makeState('up'),
      pipeline: makeState('up'),
    });
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('healthy');
    expect(body.providers.florence.status).toBe('up');
    expect(body.providers.ollama.status).toBe('up');
    expect(body.providers.pipeline.status).toBe('up');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.system.memory).toBeDefined();
  });

  it('returns 200 + degraded when ollama is down but pipeline + florence are up', async () => {
    await setup({
      florence: makeState('up'),
      ollama: makeState('down'),
      pipeline: makeState('up'),
    });
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('degraded');
  });

  it('returns 503 + unhealthy when pipeline is down', async () => {
    await setup({
      florence: makeState('up'),
      ollama: makeState('up'),
      pipeline: makeState('down'),
    });
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json().status).toBe('unhealthy');
  });

  it('returns 503 + unhealthy when florence is down (even if ollama + pipeline up)', async () => {
    await setup({
      florence: makeState('down'),
      ollama: makeState('up'),
      pipeline: makeState('up'),
    });
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(503);
  });

  it('returns version, uptime, timestamp, and providers snapshot', async () => {
    await setup({
      florence: makeState('up'),
      ollama: makeState('up'),
      pipeline: makeState('up'),
    });
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    const body = res.json();
    expect(body.version).toBe('3.0.0');
    expect(body.timestamp).toBeDefined();
    expect(typeof body.uptime).toBe('number');
    expect(body.providers).toHaveProperty('florence');
    expect(body.providers).toHaveProperty('ollama');
    expect(body.providers).toHaveProperty('pipeline');
  });
});

describe('GET /v1/health — VLM mode', () => {
  let app: FastifyInstance;
  afterEach(() => {
    envConfig.detector = 'vlm';
  });

  async function setup(snapshot: HealthSnapshot) {
    envConfig.detector = 'vlm';
    app = Fastify({ logger: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).health = makeHealth(snapshot);
    await app.register(healthRoute);
  }

  it('is healthy when Ollama is up, regardless of pipeline/florence', async () => {
    await setup({
      florence: makeState('down'),
      ollama: makeState('up'),
      pipeline: makeState('down'),
    });
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('healthy');
  });

  it('is unhealthy only when Ollama is down', async () => {
    await setup({
      florence: makeState('up'),
      ollama: makeState('down'),
      pipeline: makeState('up'),
    });
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json().status).toBe('unhealthy');
  });
});
