/**
 * Integration tests for Corrections API endpoints
 *
 * Tests the full HTTP request/response cycle for corrections routes.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import os from 'os';

// We'll need to create a test app that includes corrections routes
import Fastify from 'fastify';
import { CorrectionsService } from '../../src/services/corrections.service';
import { registerCorrectionsRoutes } from '../../src/routes/corrections.routes';

describe.skipIf(!globalThis.__INTEGRATION_TESTS_ENABLED__)('Corrections API Integration Tests', () => {
  let app: ReturnType<typeof Fastify>;
  let server: http.Server;
  let correctionsService: CorrectionsService;
  let tempDir: string;
  const PORT = 3002;
  const BASE_URL = `http://localhost:${PORT}`;
  const logger = pino({ level: 'silent' });

  beforeAll(async () => {
    // Create temp directory for corrections
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corrections-api-test-'));

    // Create Fastify app
    app = Fastify({ logger: false });
    correctionsService = new CorrectionsService(logger, tempDir);
    registerCorrectionsRoutes(app, correctionsService);

    // Start server
    await app.listen({ port: PORT });
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Clear corrections between tests
    correctionsService.clearOldCorrections(0);
  });

  const makeRequest = (options: http.RequestOptions, body?: any): Promise<{ status: number; body: any }> => {
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({
            status: res.statusCode!,
            body: data ? JSON.parse(data) : null,
          });
        });
      });
      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  };

  describe('POST /v1/corrections', () => {
    it('should add a new correction', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, {
        imageHash: 'abc123',
        originalLabel: 'couch',
        correctedLabel: 'ottoman',
        boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        confidence: 0.85,
        modelVersion: 'v1.0.0',
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.correction.id).toBeDefined();
      expect(response.body.message).toContain('successfully');
    });

    it('should return 400 for invalid body', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, {
        // Missing required fields
        imageHash: 'abc123',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid');
    });

    it('should validate bounding box ranges', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, {
        imageHash: 'abc123',
        originalLabel: 'couch',
        correctedLabel: 'ottoman',
        boundingBox: { x: 1.5, y: 0.2, width: 0.3, height: 0.4 }, // x > 1 invalid
        confidence: 0.85,
        modelVersion: 'v1.0.0',
      });

      expect(response.status).toBe(400);
    });

    it('should accept optional deviceId', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, {
        imageHash: 'abc123',
        originalLabel: 'couch',
        correctedLabel: 'ottoman',
        boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        confidence: 0.85,
        modelVersion: 'v1.0.0',
        deviceId: 'device-123',
      });

      expect(response.status).toBe(201);
    });
  });

  describe('GET /v1/corrections', () => {
    beforeEach(async () => {
      // Add test corrections
      await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, {
        imageHash: 'img1',
        originalLabel: 'couch',
        correctedLabel: 'ottoman',
        boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        confidence: 0.85,
        modelVersion: 'v1.0.0',
      });

      await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, {
        imageHash: 'img2',
        originalLabel: 'chair',
        correctedLabel: 'armchair',
        boundingBox: { x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
        confidence: 0.75,
        modelVersion: 'v2.0.0',
      });
    });

    it('should return all corrections', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections',
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.total).toBe(2);
      expect(response.body.corrections).toHaveLength(2);
    });

    it('should filter by imageHash', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections?imageHash=img1',
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(response.body.corrections).toHaveLength(1);
      expect(response.body.corrections[0].imageHash).toBe('img1');
    });

    it('should filter by modelVersion', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections?modelVersion=v2.0.0',
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(response.body.corrections).toHaveLength(1);
      expect(response.body.corrections[0].modelVersion).toBe('v2.0.0');
    });

    it('should support pagination', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections?limit=1&offset=0',
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
      expect(response.body.corrections).toHaveLength(1);
      expect(response.body.limit).toBe(1);
      expect(response.body.offset).toBe(0);
    });
  });

  describe('GET /v1/corrections/stats', () => {
    beforeEach(async () => {
      // Add corrections for stats
      for (let i = 0; i < 3; i++) {
        await makeRequest({
          hostname: 'localhost',
          port: PORT,
          path: '/v1/corrections',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }, {
          imageHash: `img${i}`,
          originalLabel: 'couch',
          correctedLabel: 'ottoman',
          boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
          confidence: 0.85,
          modelVersion: 'v1.0.0',
        });
      }
    });

    it('should return correction statistics', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections/stats',
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.stats.totalCorrections).toBe(3);
      expect(response.body.stats.uniqueImages).toBe(3);
      expect(response.body.stats.topMistakes).toBeDefined();
      expect(response.body.stats.topMistakes[0].from).toBe('couch');
      expect(response.body.stats.topMistakes[0].to).toBe('ottoman');
    });
  });

  describe('GET /v1/corrections/image/:hash', () => {
    beforeEach(async () => {
      await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, {
        imageHash: 'specific-image',
        originalLabel: 'couch',
        correctedLabel: 'loveseat',
        boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        confidence: 0.85,
        modelVersion: 'v1.0.0',
      });
    });

    it('should return corrections for specific image', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections/image/specific-image',
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.imageHash).toBe('specific-image');
      expect(response.body.count).toBe(1);
    });

    it('should return empty for non-existent image', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections/image/non-existent',
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(0);
      expect(response.body.corrections).toHaveLength(0);
    });
  });

  describe('POST /v1/corrections/export', () => {
    beforeEach(async () => {
      await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, {
        imageHash: 'img1',
        originalLabel: 'couch',
        correctedLabel: 'ottoman',
        boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        confidence: 0.85,
        modelVersion: 'v1.0.0',
      });
    });

    it('should export in CSV format', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections/export',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, { format: 'csv' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.format).toBe('csv');
      expect(response.body.exportPath).toContain('.csv');
    });

    it('should export in COCO format', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections/export',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, { format: 'coco' });

      expect(response.status).toBe(200);
      expect(response.body.format).toBe('coco');
    });

    it('should export in YOLO format', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections/export',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, { format: 'yolo' });

      expect(response.status).toBe(200);
      expect(response.body.format).toBe('yolo');
    });
  });

  describe('DELETE /v1/corrections/old', () => {
    it('should clear old corrections', async () => {
      // Add a correction first
      await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, {
        imageHash: 'img1',
        originalLabel: 'couch',
        correctedLabel: 'ottoman',
        boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        confidence: 0.85,
        modelVersion: 'v1.0.0',
      });

      const response = await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections/old?days=30',
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.removed).toBeDefined();
    });

    it('should reject invalid days parameter', async () => {
      const response = await makeRequest({
        hostname: 'localhost',
        port: PORT,
        path: '/v1/corrections/old?days=0',
        method: 'DELETE',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
