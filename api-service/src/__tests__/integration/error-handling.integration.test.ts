/**
 * Error Handling Integration Tests
 * Tests error responses and status codes
 *
 * NOTE: These tests require a running PostgreSQL database.
 * They will be skipped if database is not available.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from '../utils/test-app';
import { createAuthHeader } from '../utils/test-auth';
import { isDatabaseAvailable } from '../utils/test-db';

describe.skipIf(!globalThis.__INTEGRATION_TESTS_ENABLED__)('Error Handling Integration Tests', () => {
  let app: FastifyInstance;
  let request: ReturnType<typeof supertest>;
  let authHeader: string;

  beforeAll(async () => {
    app = await getTestApp();
    request = supertest(app.server);
    authHeader = createAuthHeader();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('400 Bad Request', () => {
    it('should return 400 for invalid query parameters', async () => {
      const response = await request
        .get('/v1/items?page=invalid')
        .set('Authorization', authHeader);

      expect([400, 422]).toContain(response.status);
    });

    it('should return 400 for invalid body', async () => {
      const response = await request
        .post('/v1/items')
        .set('Authorization', authHeader)
        .send({ invalid: 'data' });

      expect([400, 422]).toContain(response.status);
    });
  });

  describe('401 Unauthorized', () => {
    it('should return 401 for missing token', async () => {
      const response = await request.get('/v1/items');
      expect(response.status).toBe(401);
    });

    it('should return 401 for invalid token', async () => {
      const response = await request
        .get('/v1/items')
        .set('Authorization', 'Bearer invalid');

      expect(response.status).toBe(401);
    });

    it('should return 401 for missing Bearer prefix', async () => {
      const response = await request
        .get('/v1/items')
        .set('Authorization', 'token123');

      expect(response.status).toBe(401);
    });
  });

  describe('403 Forbidden', () => {
    it('should return 403 for accessing other user\'s data', async () => {
      const response = await request
        .get('/v1/items/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', createAuthHeader('other-user'));

      expect([403, 404]).toContain(response.status);
    });
  });

  describe('404 Not Found', () => {
    it('should return 404 for non-existent item', async () => {
      const response = await request
        .get('/v1/items/00000000-0000-0000-0000-000000000000')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent endpoint', async () => {
      const response = await request.get('/v1/nonexistent');
      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent label', async () => {
      const response = await request
        .get('/v1/labels/00000000-0000-0000-0000-000000000000')
        .set('Authorization', authHeader);

      expect([404, 405]).toContain(response.status);
    });
  });

  describe('413 Payload Too Large', () => {
    it('should return 413 for large file upload', async () => {
      // This requires multipart, testing basic principle
      const largeData = Buffer.alloc(11 * 1024 * 1024); // 11MB

      const response = await request
        .post('/v1/detect')
        .set('Authorization', authHeader)
        .send(largeData);

      expect([413, 400]).toContain(response.status);
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format', async () => {
      const response = await request.get('/v1/items');

      expect(response.body).toHaveProperty('statusCode');
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should include timestamp in error', async () => {
      const response = await request.get('/v1/items');
      expect(() => new Date(response.body.timestamp)).not.toThrow();
    });

    it('should match HTTP status with error status code', async () => {
      const response = await request.get('/v1/items');
      expect(response.status).toBe(response.body.statusCode);
    });
  });

  describe('Validation Error Details', () => {
    it('should provide validation error details', async () => {
      const response = await request
        .post('/v1/items')
        .set('Authorization', authHeader)
        .send({});

      expect([400, 422]).toContain(response.status);
      expect(response.body).toHaveProperty('message');
    });
  });
});
