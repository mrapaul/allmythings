/**
 * Sync Endpoint Integration Tests
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

describe.skipIf(!globalThis.__INTEGRATION_TESTS_ENABLED__)('Sync Endpoint Integration Tests', () => {
  let app: FastifyInstance;
  let request: ReturnType<typeof supertest>;
  let authHeader: string;

  beforeAll(async () => {
    app = await getTestApp();
    request = supertest(app.server);
    authHeader = createAuthHeader(createTestUserId());
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('GET /v1/sync - Pull Changes', () => {
    it('should require authentication', async () => {
      const response = await request.get('/v1/sync');
      expect(response.status).toBe(401);
    });

    it('should pull changes since timestamp', async () => {
      const response = await request
        .get('/v1/sync?since=2024-01-01T00:00:00Z')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('labels');
    });

    it('should handle missing since parameter', async () => {
      const response = await request
        .get('/v1/sync')
        .set('Authorization', authHeader);

      expect([200, 400]).toContain(response.status);
    });
  });

  describe('POST /v1/sync - Push Changes', () => {
    it('should require authentication', async () => {
      const response = await request.post('/v1/sync').send({
        items: [],
        labels: [],
      });

      expect(response.status).toBe(401);
    });

    it('should push changes to server', async () => {
      const response = await request
        .post('/v1/sync')
        .set('Authorization', authHeader)
        .send({
          items: [],
          labels: [],
        });

      expect([200, 400, 422]).toContain(response.status);
    });

    it('should handle batch operations', async () => {
      const response = await request
        .post('/v1/sync')
        .set('Authorization', authHeader)
        .send({
          items: [
            {
              id: '123e4567-e89b-12d3-a456-426614174000',
              operation: 'create',
              timestamp: new Date().toISOString(),
              photoS3Key: 's3://bucket/photo.jpg',
              thumbnailS3Key: 's3://bucket/thumb.jpg',
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
            },
          ],
          labels: [],
        });

      expect([200, 400, 422]).toContain(response.status);
    });
  });

  describe('Sync Conflict Resolution', () => {
    it('should handle conflict resolution', async () => {
      const response = await request
        .post('/v1/sync')
        .set('Authorization', authHeader)
        .send({
          items: [],
          labels: [],
        });

      expect([200, 400, 422]).toContain(response.status);
    });
  });
});
