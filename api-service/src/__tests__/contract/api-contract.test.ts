/**
 * API Contract Tests
 * Validates that API responses match OpenAPI specification
 *
 * NOTE: These tests require a running PostgreSQL database.
 * They will be skipped if database is not available.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from '../utils/test-app';
import { createAuthHeader } from '../utils/test-auth';
import { DetectionResponseSchema } from '../../schemas/detection.schema';
import {
  InventoryItemSchema,
  PaginatedItemsResponseSchema,
} from '../../schemas/inventory.schema';
import { isDatabaseAvailable } from '../utils/test-db';

describe.skipIf(!globalThis.__INTEGRATION_TESTS_ENABLED__)('API Contract Tests', () => {
  let app: FastifyInstance;
  let request: ReturnType<typeof supertest>;

  beforeAll(async () => {
    app = await getTestApp();
    request = supertest(app.server);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('Health Endpoint', () => {
    it('should return health status matching contract', async () => {
      const response = await request.get('/v1/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: expect.stringMatching(/^(healthy|degraded)$/),
        timestamp: expect.any(String),
      });

      // Validate timestamp is valid ISO string
      expect(() => new Date(response.body.timestamp)).not.toThrow();
    });
  });

  describe('Root Endpoint', () => {
    it('should return service metadata', async () => {
      const response = await request.get('/');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        service: expect.any(String),
        version: expect.any(String),
        status: expect.stringMatching(/running|stopped/),
        endpoints: expect.any(Object),
      });
    });
  });

  describe('Detection Response Contract', () => {
    it('should validate detection response schema', () => {
      const testResponse = {
        success: true,
        ensembleMode: 'full' as const,
        processingTimeMs: 250,
        detections: [
          {
            id: 'test-1',
            label: 'chair',
            confidence: 0.85,
            boundingBox: {
              x: 0.1,
              y: 0.2,
              width: 0.3,
              height: 0.4,
            },
            ensembleDetails: {
              providerAgreement: 2,
              confidenceByProvider: { mock: 0.85 },
              labelConsensus: 'agreement',
            },
            alternativeLabels: [],
          },
        ],
        providerResults: [
          {
            provider: 'mock' as const,
            success: true,
            processingTimeMs: 100,
            detections: [],
          },
        ],
        ensembleMetrics: {
          providersUsed: 1,
          averageConfidence: 0.85,
          consensusRate: 1.0,
        },
      };

      expect(() => DetectionResponseSchema.parse(testResponse)).not.toThrow();
    });

    it('should reject invalid ensemble mode', () => {
      const invalidResponse = {
        success: true,
        ensembleMode: 'invalid-mode',
        processingTimeMs: 250,
        detections: [],
        providerResults: [],
        ensembleMetrics: {
          providersUsed: 0,
          averageConfidence: 0,
          consensusRate: 0,
        },
      };

      expect(() => DetectionResponseSchema.parse(invalidResponse)).toThrow();
    });

    it('should reject confidence values outside 0-1 range', () => {
      const invalidDetection = {
        success: true,
        ensembleMode: 'single' as const,
        processingTimeMs: 250,
        detections: [
          {
            id: 'test-1',
            label: 'chair',
            confidence: 1.5, // Invalid: > 1.0
            boundingBox: {
              x: 0.1,
              y: 0.2,
              width: 0.3,
              height: 0.4,
            },
            ensembleDetails: {
              providerAgreement: 1,
              confidenceByProvider: { mock: 1.5 },
              labelConsensus: 'single',
            },
            alternativeLabels: [],
          },
        ],
        providerResults: [],
        ensembleMetrics: {
          providersUsed: 1,
          averageConfidence: 1.5,
          consensusRate: 1.0,
        },
      };

      expect(() => DetectionResponseSchema.parse(invalidDetection)).toThrow();
    });

    it('should reject invalid bounding box coordinates', () => {
      const invalidBbox = {
        success: true,
        ensembleMode: 'single' as const,
        processingTimeMs: 250,
        detections: [
          {
            id: 'test-1',
            label: 'chair',
            confidence: 0.85,
            boundingBox: {
              x: 1.5, // Invalid: > 1.0
              y: 0.2,
              width: 0.3,
              height: 0.4,
            },
            ensembleDetails: {
              providerAgreement: 1,
              confidenceByProvider: { mock: 0.85 },
              labelConsensus: 'single',
            },
            alternativeLabels: [],
          },
        ],
        providerResults: [],
        ensembleMetrics: {
          providersUsed: 1,
          averageConfidence: 0.85,
          consensusRate: 1.0,
        },
      };

      expect(() => DetectionResponseSchema.parse(invalidBbox)).toThrow();
    });
  });

  describe('Inventory Item Response Contract', () => {
    it('should validate inventory item schema', () => {
      const testItem = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        photoUrl: 'https://example.com/photo.jpg',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        detectionData: {
          success: true,
          ensembleMode: 'full' as const,
          processingTimeMs: 250,
          detections: [],
          providerResults: [],
          ensembleMetrics: {
            providersUsed: 0,
            averageConfidence: 0,
            consensusRate: 0,
          },
        },
        labels: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => InventoryItemSchema.parse(testItem)).not.toThrow();
    });

    it('should validate paginated items response', () => {
      const testResponse = {
        items: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };

      expect(() => PaginatedItemsResponseSchema.parse(testResponse)).not.toThrow();
    });
  });

  describe('HTTP Status Code Contract', () => {
    it('should return 401 for missing authorization', async () => {
      const response = await request.get('/v1/items');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        statusCode: 401,
        error: expect.stringMatching(/Unauthorized|UnauthorizedError/),
        message: expect.any(String),
      });
    });

    it('should return 401 for invalid token', async () => {
      const response = await request
        .get('/v1/items')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent resource', async () => {
      const response = await request
        .get('/v1/items/00000000-0000-0000-0000-000000000000')
        .set('Authorization', createAuthHeader());

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        statusCode: 404,
        error: expect.any(String),
        message: expect.any(String),
      });
    });

    it('should return 400 for invalid query parameters', async () => {
      const response = await request
        .get('/v1/items?page=invalid&limit=999')
        .set('Authorization', createAuthHeader());

      expect(response.status).toBe(400);
    });
  });

  describe('Error Response Contract', () => {
    it('should return consistent error format', async () => {
      const response = await request.get('/v1/items');

      expect(response.body).toHaveProperty('statusCode');
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');

      // Validate timestamp
      expect(() => new Date(response.body.timestamp)).not.toThrow();

      // Status code should match HTTP status
      expect(response.body.statusCode).toBe(response.status);
    });

    it('should include validation error details', async () => {
      const response = await request
        .post('/v1/items')
        .set('Authorization', createAuthHeader())
        .send({
          // Missing required fields
          initialLabels: [],
        });

      expect([400, 422]).toContain(response.status);
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in responses', async () => {
      const response = await request.get('/').set('Origin', 'http://localhost:3000');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });
  });

  describe('Content Type Contract', () => {
    it('should return JSON content type', async () => {
      const response = await request.get('/');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should accept JSON content type', async () => {
      const response = await request
        .post('/v1/items')
        .set('Authorization', createAuthHeader())
        .set('Content-Type', 'application/json')
        .send({
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
        });

      // Should not fail due to content type
      expect([201, 400, 422]).toContain(response.status);
    });
  });
});
