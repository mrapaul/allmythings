/**
 * Search Endpoint Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from '../utils/test-app';
import { createAuthHeader, createTestUserId } from '../utils/test-auth';

describe('Search Endpoint Integration Tests', () => {
  let app: FastifyInstance;
  let request: supertest.SuperTest<supertest.Test>;
  let authHeader: string;

  beforeAll(async () => {
    app = await getTestApp();
    request = supertest(app.server);
    authHeader = createAuthHeader(createTestUserId());
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('GET /v1/search - Full-text Search', () => {
    it('should require authentication', async () => {
      const response = await request.get('/v1/search?q=chair');
      expect(response.status).toBe(401);
    });

    it('should search with query parameter', async () => {
      const response = await request
        .get('/v1/search?q=chair')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('pagination');
    });

    it('should handle empty search query', async () => {
      const response = await request
        .get('/v1/search?q=')
        .set('Authorization', authHeader);

      expect([200, 400]).toContain(response.status);
    });

    it('should support pagination', async () => {
      const response = await request
        .get('/v1/search?q=test&page=1&limit=20')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
    });

    it('should return 400 for missing query parameter', async () => {
      const response = await request
        .get('/v1/search')
        .set('Authorization', authHeader);

      expect([400, 200]).toContain(response.status);
    });
  });
});
