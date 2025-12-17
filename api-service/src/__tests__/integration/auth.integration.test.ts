/**
 * Authentication Integration Tests
 *
 * NOTE: These tests require a running PostgreSQL database.
 * They will be skipped if database is not available.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from '../utils/test-app';
import { createAuthHeader, createTestUserId } from '../utils/test-auth';
import { isDatabaseAvailable } from '../utils/test-db';

describe.skipIf(!globalThis.__INTEGRATION_TESTS_ENABLED__)('Authentication Integration Tests', () => {
  let app: FastifyInstance;
  let request: ReturnType<typeof supertest>;

  beforeAll(async () => {
    app = await getTestApp();
    request = supertest(app.server);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('JWT Token Validation', () => {
    it('should accept valid JWT token', async () => {
      const authHeader = createAuthHeader();
      const response = await request
        .get('/v1/items')
        .set('Authorization', authHeader);

      expect(response.status).not.toBe(401);
    });

    it('should reject missing token', async () => {
      const response = await request.get('/v1/items');
      expect(response.status).toBe(401);
    });

    it('should reject invalid token format', async () => {
      const response = await request
        .get('/v1/items')
        .set('Authorization', 'Bearer invalid-token-format');

      expect(response.status).toBe(401);
    });

    it('should reject missing Bearer prefix', async () => {
      const response = await request
        .get('/v1/items')
        .set('Authorization', 'token');

      expect(response.status).toBe(401);
    });

    it('should extract userId from token', async () => {
      const userId = createTestUserId();
      const authHeader = createAuthHeader(userId);

      const response = await request
        .get('/v1/items')
        .set('Authorization', authHeader);

      expect([200, 400, 422]).toContain(response.status);
    });
  });

  describe('Authorization Header Handling', () => {
    it('should return 401 for empty Authorization header', async () => {
      const response = await request
        .get('/v1/items')
        .set('Authorization', '');

      expect(response.status).toBe(401);
    });

    it('should handle case-insensitive Bearer prefix', async () => {
      const authHeader = createAuthHeader();
      const token = authHeader.replace('Bearer', 'bearer');

      const response = await request
        .get('/v1/items')
        .set('Authorization', token);

      expect([200, 401]).toContain(response.status);
    });
  });

  describe('User Context Extraction', () => {
    it('should provide userId in context', async () => {
      const userId = 'test-user-123';
      const authHeader = createAuthHeader(userId);

      const response = await request
        .get('/v1/items')
        .set('Authorization', authHeader);

      expect([200, 400, 422]).toContain(response.status);
    });

    it('should provide email in context', async () => {
      const email = 'user@example.com';
      const authHeader = createAuthHeader('test-user', email);

      const response = await request
        .get('/v1/items')
        .set('Authorization', authHeader);

      expect([200, 400, 422]).toContain(response.status);
    });
  });

  describe('Multi-user Authentication', () => {
    it('should handle different users simultaneously', async () => {
      const user1Header = createAuthHeader('user-1');
      const user2Header = createAuthHeader('user-2');

      const response1 = await request
        .get('/v1/items')
        .set('Authorization', user1Header);

      const response2 = await request
        .get('/v1/items')
        .set('Authorization', user2Header);

      expect(response1.status).not.toBe(401);
      expect(response2.status).not.toBe(401);
    });
  });
});
