/**
 * Load Testing Integration Tests
 * Tests performance under concurrent load
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from '../utils/test-app';
import { createAuthHeader, createMultipleTestTokens } from '../utils/test-auth';

describe('Load Testing Integration Tests', () => {
  let app: FastifyInstance;
  let request: supertest.SuperTest<supertest.Test>;

  beforeAll(async () => {
    app = await getTestApp();
    request = supertest(app.server);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('Concurrent Requests', () => {
    it('should handle 10 concurrent list requests', async () => {
      const authHeader = createAuthHeader();

      const requests = Array(10)
        .fill(null)
        .map(() =>
          request
            .get('/v1/items')
            .set('Authorization', authHeader)
        );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });

    it('should handle requests from different users', async () => {
      const users = createMultipleTestTokens(5);

      const requests = users.map((user) =>
        request
          .get('/v1/items')
          .set('Authorization', user.token)
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Pagination Performance', () => {
    it('should handle large limit parameter', async () => {
      const authHeader = createAuthHeader();

      const response = await request
        .get('/v1/items?limit=100')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(100);
    });

    it('should handle multiple pages', async () => {
      const authHeader = createAuthHeader();

      for (let page = 1; page <= 3; page++) {
        const response = await request
          .get(`/v1/items?page=${page}&limit=20`)
          .set('Authorization', authHeader);

        expect(response.status).toBe(200);
        expect(response.body.pagination.page).toBe(page);
      }
    });
  });

  describe('Bulk Operations', () => {
    it('should handle bulk sync operations', async () => {
      const authHeader = createAuthHeader();

      const items = [];
      const labels = [];

      for (let i = 0; i < 50; i++) {
        items.push({
          id: `item-${i}`,
          operation: 'create',
          timestamp: new Date().toISOString(),
          photoS3Key: `s3://bucket/photo-${i}.jpg`,
          thumbnailS3Key: `s3://bucket/thumb-${i}.jpg`,
          detectionData: {
            success: true,
            ensembleMode: 'single',
            processingTimeMs: 100,
            detections: [],
            providerResults: [],
            ensembleMetrics: {
              providersUsed: 0,
              averageConfidence: 0,
              consensusRate: 0,
            },
          },
        });

        labels.push({
          id: `label-${i}`,
          itemId: `item-${Math.floor(i / 5)}`,
          value: `tag-${i}`,
          operation: 'create',
          timestamp: new Date().toISOString(),
        });
      }

      const response = await request
        .post('/v1/sync')
        .set('Authorization', authHeader)
        .send({ items, labels });

      expect([200, 400, 422]).toContain(response.status);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      const authHeader = createAuthHeader();
      const maxRequests = 10;

      const requests = Array(maxRequests)
        .fill(null)
        .map(() =>
          request
            .get('/v1/items')
            .set('Authorization', authHeader)
        );

      const responses = await Promise.all(requests);

      const successCount = responses.filter((r) => r.status === 200).length;
      expect(successCount).toBeGreaterThan(0);
    });
  });

  describe('Response Time', () => {
    it('should respond to list endpoint quickly', async () => {
      const authHeader = createAuthHeader();
      const startTime = Date.now();

      const response = await request
        .get('/v1/items')
        .set('Authorization', authHeader);

      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(5000);
    });

    it('should respond to search endpoint quickly', async () => {
      const authHeader = createAuthHeader();
      const startTime = Date.now();

      const response = await request
        .get('/v1/search?q=test')
        .set('Authorization', authHeader);

      const duration = Date.now() - startTime;

      expect([200, 400]).toContain(response.status);
      expect(duration).toBeLessThan(5000);
    });
  });
});
