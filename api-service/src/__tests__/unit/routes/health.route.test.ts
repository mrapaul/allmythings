import { describe, it, expect } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { healthRoute } from '../../../routes/health.route';
import type { ProviderHealthService, HealthSnapshot, ProviderState } from '../../../services/provider-health.service';

function makeState(status: 'unknown' | 'up' | 'down'): ProviderState {
  return { status, lastProbeMs: Date.now(), lastLatencyMs: 5, consecutiveFailures: status === 'down' ? 1 : 0, lastError: null };
}

function makeHealth(snapshot: HealthSnapshot): Pick<ProviderHealthService, 'snapshot'> {
  return { snapshot: () => snapshot };
}

describe('GET /v1/health', () => {
  let app: FastifyInstance;

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
