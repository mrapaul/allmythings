import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app';
import { FastifyInstance } from 'fastify';

describe('GET /v1/health - Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return health status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('providers');
    expect(body).toHaveProperty('timestamp');

    expect(body.status).toBe('healthy');
    expect(typeof body.providers).toBe('object');
  });

  it('should return valid timestamp', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });

    const body = JSON.parse(response.body);
    const timestamp = new Date(body.timestamp);

    expect(timestamp.getTime()).toBeGreaterThan(Date.now() - 5000);
    expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('should complete quickly', async () => {
    const startTime = Date.now();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });
    const endTime = Date.now();

    expect(response.statusCode).toBe(200);
    expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
  });
});
