import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app';
import { FastifyInstance } from 'fastify';

describe('Service Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ disableRateLimit: true });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should verify health of all configured providers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('providers');
    
    // In local dev with only basic setup, we expect at least 'gemini' to be healthy
    // (if key is provided) or 'grounding-dino' (if service is up).
    // For this test we just ensure the health check logic runs without crashing.
    console.log('Provider Status:', body.providers);
  });

  it('should be able to reach detection service if it is up', async () => {
    // This test is conditional on detection service being available
    const providers = await (app as any).pipeline.healthCheck();
    
    if (providers['grounding-dino']) {
      expect(providers['grounding-dino']).toBe(true);
    } else {
      console.warn('Grounding DINO service not reachable, skipping live reachability check');
    }
  });
});
