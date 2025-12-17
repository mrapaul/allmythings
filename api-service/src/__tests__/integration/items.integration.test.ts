/**
 * Items Endpoint Integration Tests
 * Tests CRUD operations on /v1/items endpoint
 *
 * NOTE: These tests require a running PostgreSQL database.
 * They will be skipped if database is not available.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from '../utils/test-app';
import { createAuthHeader, createTestUserId, createMultipleTestTokens } from '../utils/test-auth';
import { createTestItemRequest } from '../fixtures/test-data';
import { resetDatabase, isDatabaseAvailable } from '../utils/test-db';

describe.skipIf(!globalThis.__INTEGRATION_TESTS_ENABLED__)('Items Endpoint Integration Tests', () => {
  let app: FastifyInstance;
  let request: ReturnType<typeof supertest>;
  let userId: string;
  let authHeader: string;

  beforeAll(async () => {
    app = await getTestApp();
    request = supertest(app.server);
    userId = createTestUserId();
    authHeader = createAuthHeader(userId);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  describe('POST /v1/items - Create Item', () => {
    it('should create a new inventory item', async () => {
      const itemData = createTestItemRequest();

      const response = await request
        .post('/v1/items')
        .set('Authorization', authHeader)
        .send(itemData);

      expect([201, 400, 422]).toContain(response.status);
    });

    it('should require authentication', async () => {
      const itemData = createTestItemRequest();
      const response = await request.post('/v1/items').send(itemData);
      expect(response.status).toBe(401);
    });
  });

  describe('GET /v1/items - List Items', () => {
    it('should list inventory items', async () => {
      const response = await request
        .get('/v1/items')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('pagination');
    });

    it('should return 401 without authentication', async () => {
      const response = await request.get('/v1/items');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /v1/items/:id - Get Single Item', () => {
    it('should return 404 for non-existent item', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request
        .get(`/v1/items/${fakeId}`)
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request.get(`/v1/items/${fakeId}`);
      expect(response.status).toBe(401);
    });
  });

  describe('Data Isolation', () => {
    it('should isolate users', async () => {
      const users = createMultipleTestTokens(2);

      const response1 = await request
        .get('/v1/items')
        .set('Authorization', users[0].token);

      const response2 = await request
        .get('/v1/items')
        .set('Authorization', users[1].token);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });
  });
});
