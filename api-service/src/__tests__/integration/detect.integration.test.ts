/**
 * Detection Endpoint Integration Tests
 * Tests the POST /v1/detect endpoint
 *
 * NOTE: These tests require a running PostgreSQL database.
 * They will be skipped if database is not available.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from '../utils/test-app';
import { createAuthHeader, createTestUserId } from '../utils/test-auth';
import {
  createTestImageBuffer,
  createLargeImageBuffer,
  createInvalidImageBuffer,
} from '../fixtures/test-data';
import { isDatabaseAvailable } from '../utils/test-db';

describe.skipIf(!globalThis.__INTEGRATION_TESTS_ENABLED__)('Detection Endpoint Integration Tests', () => {
  let app: FastifyInstance;
  let request: ReturnType<typeof supertest>;

  beforeAll(async () => {
    app = await getTestApp();
    request = supertest(app.server);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('POST /v1/detect - Valid Image Upload', () => {
    it('should successfully detect objects in valid image', async () => {
      const imageBuffer = createTestImageBuffer();
      const userId = createTestUserId();
      const authHeader = createAuthHeader(userId);

      const response = await request
        .post('/v1/detect')
        .set('Authorization', authHeader)
        .field('minConfidence', '0.7')
        .attach('file', imageBuffer, 'test-image.jpg');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: expect.any(Boolean),
        ensembleMode: expect.stringMatching(/full|partial|single|none/),
        processingTimeMs: expect.any(Number),
        detections: expect.any(Array),
        providerResults: expect.any(Array),
        ensembleMetrics: expect.any(Object),
      });

      // Validate processing time
      expect(response.body.processingTimeMs).toBeGreaterThan(0);

      // Validate detections if present
      if (response.body.detections.length > 0) {
        const detection = response.body.detections[0];
        expect(detection).toHaveProperty('id');
        expect(detection).toHaveProperty('label');
        expect(detection).toHaveProperty('confidence');
        expect(detection.confidence).toBeGreaterThanOrEqual(0);
        expect(detection.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should respect minConfidence parameter', async () => {
      const imageBuffer = createTestImageBuffer();
      const authHeader = createAuthHeader();

      const response = await request
        .post('/v1/detect')
        .set('Authorization', authHeader)
        .field('minConfidence', '0.9')
        .attach('file', imageBuffer, 'test-image.jpg');

      expect(response.status).toBe(200);

      // All detections should meet minimum confidence
      if (response.body.detections && response.body.detections.length > 0) {
        response.body.detections.forEach((detection: any) => {
          expect(detection.confidence).toBeGreaterThanOrEqual(0.9);
        });
      }
    });

    it('should include bounding boxes in detections', async () => {
      const imageBuffer = createTestImageBuffer();
      const authHeader = createAuthHeader();

      const response = await request
        .post('/v1/detect')
        .set('Authorization', authHeader)
        .attach('file', imageBuffer, 'test-image.jpg');

      expect(response.status).toBe(200);

      if (response.body.detections && response.body.detections.length > 0) {
        const detection = response.body.detections[0];
        expect(detection.boundingBox).toMatchObject({
          x: expect.any(Number),
          y: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number),
        });

        // Validate bounding box coordinates
        expect(detection.boundingBox.x).toBeGreaterThanOrEqual(0);
        expect(detection.boundingBox.x).toBeLessThanOrEqual(1);
        expect(detection.boundingBox.y).toBeGreaterThanOrEqual(0);
        expect(detection.boundingBox.y).toBeLessThanOrEqual(1);
        expect(detection.boundingBox.width).toBeGreaterThanOrEqual(0);
        expect(detection.boundingBox.width).toBeLessThanOrEqual(1);
        expect(detection.boundingBox.height).toBeGreaterThanOrEqual(0);
        expect(detection.boundingBox.height).toBeLessThanOrEqual(1);
      }
    });

    it('should include ensemble details in response', async () => {
      const imageBuffer = createTestImageBuffer();
      const authHeader = createAuthHeader();

      const response = await request
        .post('/v1/detect')
        .set('Authorization', authHeader)
        .attach('file', imageBuffer, 'test-image.jpg');

      expect(response.status).toBe(200);
      expect(response.body.ensembleMetrics).toMatchObject({
        providersUsed: expect.any(Number),
        averageConfidence: expect.any(Number),
        consensusRate: expect.any(Number),
      });

      expect(response.body.providerResults).toBeInstanceOf(Array);
      expect(response.body.providerResults.length).toBeGreaterThan(0);
    });
  });

  describe('POST /v1/detect - Missing/Invalid Parameters', () => {
    it('should return 400 when no file uploaded', async () => {
      const authHeader = createAuthHeader();

      const response = await request
        .post('/v1/detect')
        .set('Authorization', authHeader)
        .field('minConfidence', '0.7');

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/file|upload/i);
    });

    it('should return 400 for invalid minConfidence value', async () => {
      const imageBuffer = createTestImageBuffer();
      const authHeader = createAuthHeader();

      const response = await request
        .post('/v1/detect')
        .set('Authorization', authHeader)
        .field('minConfidence', 'invalid')
        .attach('file', imageBuffer, 'test-image.jpg');

      expect([400, 422]).toContain(response.status);
    });

    it('should return 400 for minConfidence > 1', async () => {
      const imageBuffer = createTestImageBuffer();
      const authHeader = createAuthHeader();

      const response = await request
        .post('/v1/detect')
        .set('Authorization', authHeader)
        .field('minConfidence', '1.5')
        .attach('file', imageBuffer, 'test-image.jpg');

      expect([400, 422]).toContain(response.status);
    });

    it('should return 400 for minConfidence < 0', async () => {
      const imageBuffer = createTestImageBuffer();
      const authHeader = createAuthHeader();

      const response = await request
        .post('/v1/detect')
        .set('Authorization', authHeader)
        .field('minConfidence', '-0.5')
        .attach('file', imageBuffer, 'test-image.jpg');

      expect([400, 422]).toContain(response.status);
    });

    it('should handle invalid image data gracefully', async () => {
      const invalidImage = createInvalidImageBuffer();
      const authHeader = createAuthHeader();

      const response = await request
        .post('/v1/detect')
        .set('Authorization', authHeader)
        .attach('file', invalidImage, 'invalid.jpg');

      // Should either process gracefully or return 400
      expect([200, 400, 422, 500]).toContain(response.status);
    });
  });

  describe('POST /v1/detect - Large File Handling', () => {
    it('should reject files larger than 10MB', async () => {
      const largeImage = createLargeImageBuffer(11); // 11 MB
      const authHeader = createAuthHeader();

      const response = await request
        .post('/v1/detect')
        .set('Authorization', authHeader)
        .attach('file', largeImage, 'large-image.jpg');

      expect([413, 400]).toContain(response.status);
      if (response.status === 413) {
        expect(response.body.message).toMatch(/too large|exceeds|size/i);
      }
    });

    it('should accept files up to 10MB', async () => {
      const largeImage = createLargeImageBuffer(9); // 9 MB
      const authHeader = createAuthHeader();

      const response = await request
        .post('/v1/detect')
        .set('Authorization', authHeader)
        .attach('file', largeImage, 'large-image.jpg');

      // Should either succeed or fail with specific error, not 413
      expect(response.status).not.toBe(413);
    });
  });

  describe('POST /v1/detect - Authentication', () => {
    it('should return 401 without authorization header', async () => {
      const imageBuffer = createTestImageBuffer();

      const response = await request
        .post('/v1/detect')
        .attach('file', imageBuffer, 'test-image.jpg');

      expect(response.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const imageBuffer = createTestImageBuffer();

      const response = await request
        .post('/v1/detect')
        .set('Authorization', 'Bearer invalid-token')
        .attach('file', imageBuffer, 'test-image.jpg');

      expect(response.status).toBe(401);
    });

    it('should extract userId from token', async () => {
      const userId = createTestUserId();
      const authHeader = createAuthHeader(userId);
      const imageBuffer = createTestImageBuffer();

      const response = await request
        .post('/v1/detect')
        .set('Authorization', authHeader)
        .attach('file', imageBuffer, 'test-image.jpg');

      expect([200, 400, 422, 500]).toContain(response.status);
      // Response should not be 401 (auth should succeed)
      expect(response.status).not.toBe(401);
    });
  });

  describe('POST /v1/detect - Response Format', () => {
    it('should return valid JSON response', async () => {
      const imageBuffer = createTestImageBuffer();
      const authHeader = createAuthHeader();

      const response = await request
        .post('/v1/detect')
        .set('Authorization', authHeader)
        .attach('file', imageBuffer, 'test-image.jpg');

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toEqual(expect.any(Object));
    });

    it('should include all required fields in response', async () => {
      const imageBuffer = createTestImageBuffer();
      const authHeader = createAuthHeader();

      const response = await request
        .post('/v1/detect')
        .set('Authorization', authHeader)
        .attach('file', imageBuffer, 'test-image.jpg');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('ensembleMode');
      expect(response.body).toHaveProperty('processingTimeMs');
      expect(response.body).toHaveProperty('detections');
      expect(response.body).toHaveProperty('providerResults');
      expect(response.body).toHaveProperty('ensembleMetrics');
    });
  });

  describe('POST /v1/detect - Multiple Requests', () => {
    it('should handle multiple consecutive requests', async () => {
      const imageBuffer = createTestImageBuffer();
      const authHeader = createAuthHeader();

      const requests = Array(3)
        .fill(null)
        .map(() =>
          request
            .post('/v1/detect')
            .set('Authorization', authHeader)
            .attach('file', imageBuffer, 'test-image.jpg')
        );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success');
      });
    });
  });
});
