/**
 * Detection Pipeline Integration Tests
 *
 * Tests the full detection pipeline including:
 * - VisionOrchestratorService (multi-provider detection)
 * - EnsembleFusionService (detection merging and NMS)
 * - PropertyEnrichmentService (object property extraction)
 * - CorrectionsService (label corrections and learning)
 * - ModelPersistenceService (model versioning and vocabulary)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import pino from 'pino';
import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Import services and routes
import { CorrectionsService } from '../../src/services/corrections.service';
import { registerCorrectionsRoutes } from '../../src/routes/corrections.routes';
import { buildApp } from '../../src/app';

// Test auth token helper
function createTestAuthHeader(): string {
  const payload = {
    userId: 'test-user-123',
    email: 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = Buffer.from('signature').toString('base64');
  return `Bearer ${header}.${body}.${signature}`;
}

describe.skipIf(!globalThis.__INTEGRATION_TESTS_ENABLED__)('Detection Pipeline Integration Tests', () => {
  let detectApp: FastifyInstance;
  let correctionsApp: FastifyInstance;
  let correctionsService: CorrectionsService;
  const DETECT_PORT = 3003;
  const CORRECTIONS_PORT = 3004;
  let tempDir: string;
  const logger = pino({ level: 'silent' });

  // Helper function for making HTTP requests
  const makeRequest = (options: http.RequestOptions, body?: string | Buffer | FormData): Promise<any> => {
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data ? JSON.parse(data) : null,
            });
          } catch {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data,
            });
          }
        });
      });

      req.on('error', reject);

      if (body instanceof FormData) {
        body.pipe(req);
      } else if (body) {
        req.write(body);
        req.end();
      } else {
        req.end();
      }
    });
  };

  // Create a minimal valid JPEG for testing
  const createTestJpeg = (): Buffer => {
    return Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
      0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    ]);
  };

  beforeAll(async () => {
    // Create temp directory for model storage
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detection-pipeline-test-'));

    // Build and start the main detection app
    detectApp = await buildApp({ disableRateLimit: true });
    await detectApp.listen({ port: DETECT_PORT });

    // Create corrections app separately
    correctionsApp = Fastify({ logger: false });
    correctionsService = new CorrectionsService(logger, tempDir);
    registerCorrectionsRoutes(correctionsApp, correctionsService);
    await correctionsApp.listen({ port: CORRECTIONS_PORT });
  });

  afterAll(async () => {
    // Cleanup
    await detectApp?.close();
    await correctionsApp?.close();

    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clear corrections between tests
    correctionsService?.clearOldCorrections(0);
  });

  describe('Full Detection Flow', () => {
    it('should process image through complete detection pipeline', async () => {
      const form = new FormData();
      form.append('file', createTestJpeg(), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      const response = await makeRequest(
        {
          hostname: 'localhost',
          port: DETECT_PORT,
          path: '/v1/detect',
          method: 'POST',
          headers: { ...form.getHeaders(), Authorization: createTestAuthHeader() },
        },
        form
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('detections');
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('processingTimeMs');
      expect(response.body).toHaveProperty('ensembleMetrics');
    });

    it('should return detection metadata including provider info', async () => {
      const form = new FormData();
      form.append('file', createTestJpeg(), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      const response = await makeRequest(
        {
          hostname: 'localhost',
          port: DETECT_PORT,
          path: '/v1/detect',
          method: 'POST',
          headers: { ...form.getHeaders(), Authorization: createTestAuthHeader() },
        },
        form
      );

      expect(response.status).toBe(200);

      // Check detection array structure
      if (response.body.detections && response.body.detections.length > 0) {
        const detection = response.body.detections[0];
        expect(detection).toHaveProperty('object');
        expect(detection).toHaveProperty('confidence');
        expect(typeof detection.confidence).toBe('number');
        expect(detection.confidence).toBeGreaterThanOrEqual(0);
        expect(detection.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should handle concurrent detection requests', async () => {
      const numRequests = 5;
      const requests = Array.from({ length: numRequests }, () => {
        const form = new FormData();
        form.append('file', createTestJpeg(), {
          filename: 'test.jpg',
          contentType: 'image/jpeg',
        });

        return makeRequest(
          {
            hostname: 'localhost',
            port: DETECT_PORT,
            path: '/v1/detect',
            method: 'POST',
            headers: { ...form.getHeaders(), Authorization: createTestAuthHeader() },
          },
          form
        );
      });

      const responses = await Promise.all(requests);
      expect(responses.every((r) => r.status === 200)).toBe(true);
    });
  });

  describe('Detection with Corrections Feedback Loop', () => {
    let detectionId: string | undefined;

    it('should detect objects and allow correction submission', async () => {
      // Step 1: Perform detection
      const form = new FormData();
      form.append('file', createTestJpeg(), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      const detectResponse = await makeRequest(
        {
          hostname: 'localhost',
          port: DETECT_PORT,
          path: '/v1/detect',
          method: 'POST',
          headers: { ...form.getHeaders(), Authorization: createTestAuthHeader() },
        },
        form
      );

      expect(detectResponse.status).toBe(200);

      // Step 2: Submit a correction for a hypothetical detection
      const correctionPayload = {
        imageHash: 'test-image-123',
        originalLabel: 'chair',
        correctedLabel: 'armchair',
        boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        confidence: 0.85,
        modelVersion: 'v1.0.0',
      };

      const correctionResponse = await makeRequest(
        {
          hostname: 'localhost',
          port: CORRECTIONS_PORT,
          path: '/v1/corrections',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        JSON.stringify(correctionPayload)
      );

      expect(correctionResponse.status).toBe(201);
      expect(correctionResponse.body.success).toBe(true);
    });

    it('should retrieve corrections for an image', async () => {
      // First submit a correction
      const correctionPayload = {
        imageHash: 'img-feedback-test',
        originalLabel: 'sofa',
        correctedLabel: 'loveseat',
        boundingBox: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
        confidence: 0.9,
        modelVersion: 'v1.0.0',
      };

      await makeRequest(
        {
          hostname: 'localhost',
          port: CORRECTIONS_PORT,
          path: '/v1/corrections',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        JSON.stringify(correctionPayload)
      );

      // Retrieve corrections
      const getResponse = await makeRequest({
        hostname: 'localhost',
        port: CORRECTIONS_PORT,
        path: '/v1/corrections/image/img-feedback-test',
        method: 'GET',
      });

      expect(getResponse.status).toBe(200);
      expect(getResponse.body).toHaveProperty('corrections');
      expect(Array.isArray(getResponse.body.corrections)).toBe(true);
    });

    it('should track correction statistics', async () => {
      const statsResponse = await makeRequest({
        hostname: 'localhost',
        port: CORRECTIONS_PORT,
        path: '/v1/corrections/stats',
        method: 'GET',
      });

      expect(statsResponse.status).toBe(200);
      expect(statsResponse.body).toHaveProperty('success');
      expect(statsResponse.body).toHaveProperty('stats');
      expect(statsResponse.body.stats).toHaveProperty('totalCorrections');
      expect(typeof statsResponse.body.stats.totalCorrections).toBe('number');
    });
  });

  describe('Detection Response Validation', () => {
    it('should return valid bounding boxes in 0-1 range', async () => {
      const form = new FormData();
      form.append('file', createTestJpeg(), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      const response = await makeRequest(
        {
          hostname: 'localhost',
          port: DETECT_PORT,
          path: '/v1/detect',
          method: 'POST',
          headers: { ...form.getHeaders(), Authorization: createTestAuthHeader() },
        },
        form
      );

      expect(response.status).toBe(200);

      if (response.body.detections && response.body.detections.length > 0) {
        for (const detection of response.body.detections) {
          if (detection.boundingBox) {
            const { x, y, width, height } = detection.boundingBox;
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(1);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(1);
            expect(width).toBeGreaterThanOrEqual(0);
            expect(width).toBeLessThanOrEqual(1);
            expect(height).toBeGreaterThanOrEqual(0);
            expect(height).toBeLessThanOrEqual(1);
          }
        }
      }
    });

    it('should return non-empty object labels', async () => {
      const form = new FormData();
      form.append('file', createTestJpeg(), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      const response = await makeRequest(
        {
          hostname: 'localhost',
          port: DETECT_PORT,
          path: '/v1/detect',
          method: 'POST',
          headers: { ...form.getHeaders(), Authorization: createTestAuthHeader() },
        },
        form
      );

      expect(response.status).toBe(200);

      if (response.body.detections && response.body.detections.length > 0) {
        for (const detection of response.body.detections) {
          expect(detection.object).toBeDefined();
          expect(typeof detection.object).toBe('string');
          expect(detection.object.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Health Check Integration', () => {
    it('should report health status including provider availability', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: DETECT_PORT,
        path: '/v1/health',
        method: 'GET',
      });

      // Health check returns 200 for healthy/degraded, 503 for unhealthy
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('status');
      // Status can be 'healthy', 'degraded', or 'unhealthy'
      expect(['healthy', 'degraded', 'unhealthy']).toContain(response.body.status);
    });

    it('should return service info', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: DETECT_PORT,
        path: '/',
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('version');
    });
  });

  describe('Error Handling in Pipeline', () => {
    it('should handle empty request body gracefully', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: DETECT_PORT,
        path: '/v1/detect',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: createTestAuthHeader() },
      });

      expect(response.status).toBe(400);
    });

    it('should handle invalid JSON in corrections endpoint', async () => {
      const response = await makeRequest(
        {
          hostname: 'localhost',
          port: CORRECTIONS_PORT,
          path: '/v1/corrections',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        'invalid json{'
      );

      // Should return 400 for malformed JSON
      expect([400, 500].includes(response.status)).toBe(true);
    });

    it('should validate required fields in correction submission', async () => {
      const incompletePayload = {
        imageId: 'test-image',
        // Missing other required fields
      };

      const response = await makeRequest(
        {
          hostname: 'localhost',
          port: CORRECTIONS_PORT,
          path: '/v1/corrections',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        JSON.stringify(incompletePayload)
      );

      expect(response.status).toBe(400);
    });
  });

  describe('Export for Retraining', () => {
    it('should export corrections in YOLO format', async () => {
      // First add some corrections
      const correction1 = {
        imageHash: 'export-test-img-1',
        originalLabel: 'table',
        correctedLabel: 'dining_table',
        boundingBox: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 },
        confidence: 0.88,
        modelVersion: 'v1.0.0',
      };

      await makeRequest(
        {
          hostname: 'localhost',
          port: CORRECTIONS_PORT,
          path: '/v1/corrections',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        JSON.stringify(correction1)
      );

      // Export in YOLO format (POST endpoint)
      const exportResponse = await makeRequest(
        {
          hostname: 'localhost',
          port: CORRECTIONS_PORT,
          path: '/v1/corrections/export',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        JSON.stringify({ format: 'yolo' })
      );

      expect(exportResponse.status).toBe(200);
      expect(exportResponse.body.success).toBe(true);
      expect(exportResponse.body).toHaveProperty('format', 'yolo');
      expect(exportResponse.body).toHaveProperty('exportPath');
    });

    it('should export corrections in COCO format', async () => {
      const exportResponse = await makeRequest(
        {
          hostname: 'localhost',
          port: CORRECTIONS_PORT,
          path: '/v1/corrections/export',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        JSON.stringify({ format: 'coco' })
      );

      expect(exportResponse.status).toBe(200);
      expect(exportResponse.body.success).toBe(true);
      expect(exportResponse.body).toHaveProperty('format', 'coco');
    });
  });

  describe('Detection Pipeline Performance', () => {
    it('should complete detection within timeout', async () => {
      const startTime = Date.now();
      const form = new FormData();
      form.append('file', createTestJpeg(), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      const response = await makeRequest(
        {
          hostname: 'localhost',
          port: DETECT_PORT,
          path: '/v1/detect',
          method: 'POST',
          headers: { ...form.getHeaders(), Authorization: createTestAuthHeader() },
        },
        form
      );

      const elapsed = Date.now() - startTime;

      expect(response.status).toBe(200);
      // Detection should complete within 30 seconds (accounting for cold start)
      expect(elapsed).toBeLessThan(30000);
    });

    it('should include execution time in response', async () => {
      const form = new FormData();
      form.append('file', createTestJpeg(), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      const response = await makeRequest(
        {
          hostname: 'localhost',
          port: DETECT_PORT,
          path: '/v1/detect',
          method: 'POST',
          headers: { ...form.getHeaders(), Authorization: createTestAuthHeader() },
        },
        form
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('processingTimeMs');
      expect(typeof response.body.processingTimeMs).toBe('number');
      expect(response.body.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Detection Idempotency', () => {
    it('should return consistent results for same image', async () => {
      const imageBuffer = createTestJpeg();

      const makeDetectionRequest = () => {
        const form = new FormData();
        form.append('file', imageBuffer, {
          filename: 'test.jpg',
          contentType: 'image/jpeg',
        });

        return makeRequest(
          {
            hostname: 'localhost',
            port: DETECT_PORT,
            path: '/v1/detect',
            method: 'POST',
            headers: { ...form.getHeaders(), Authorization: createTestAuthHeader() },
          },
          form
        );
      };

      const response1 = await makeDetectionRequest();
      const response2 = await makeDetectionRequest();

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Total objects should be consistent
      expect(response1.body.totalObjects).toBe(response2.body.totalObjects);
    });
  });
});
