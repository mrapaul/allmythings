import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app';
import { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';

describe('POST /v1/detect - Integration Tests', () => {
  let app: FastifyInstance;
  const testImagePath = path.join(__dirname, '../fixtures/test-image.jpg');

  beforeAll(async () => {
    // Create test image if it doesn't exist
    if (!fs.existsSync(path.dirname(testImagePath))) {
      fs.mkdirSync(path.dirname(testImagePath), { recursive: true });
    }
    if (!fs.existsSync(testImagePath)) {
      // Create a minimal 1x1 JPEG
      const minimalJpeg = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
        0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
        0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
        0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
        0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
        0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
        0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x03, 0xFF, 0xC4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
        0x7F, 0xFF, 0xD9
      ]);
      fs.writeFileSync(testImagePath, minimalJpeg);
    }

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Success Cases', () => {
    it('should successfully detect objects in an image', async () => {
      const form = new FormData();
      form.append('image', fs.createReadStream(testImagePath), {
        filename: 'test-image.jpg',
        contentType: 'image/jpeg',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body).toHaveProperty('success');
      expect(body).toHaveProperty('detections');
      expect(body).toHaveProperty('ensembleMode');
      expect(body).toHaveProperty('processingTimeMs');
      expect(body).toHaveProperty('providerResults');
      expect(body).toHaveProperty('ensembleMetrics');

      expect(Array.isArray(body.detections)).toBe(true);
      expect(Array.isArray(body.providerResults)).toBe(true);
    });

    it('should return detections with proper structure', async () => {
      const form = new FormData();
      form.append('image', fs.createReadStream(testImagePath), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        payload: form,
        headers: form.getHeaders(),
      });

      const body = JSON.parse(response.body);

      if (body.detections.length > 0) {
        const detection = body.detections[0];
        expect(detection).toHaveProperty('label');
        expect(detection).toHaveProperty('confidence');
        expect(detection).toHaveProperty('boundingBox');

        expect(typeof detection.label).toBe('string');
        expect(typeof detection.confidence).toBe('number');
        expect(detection.confidence).toBeGreaterThanOrEqual(0);
        expect(detection.confidence).toBeLessThanOrEqual(1);

        expect(detection.boundingBox).toHaveProperty('left');
        expect(detection.boundingBox).toHaveProperty('top');
        expect(detection.boundingBox).toHaveProperty('width');
        expect(detection.boundingBox).toHaveProperty('height');
      }
    });

    it('should handle minConfidence parameter', async () => {
      const form = new FormData();
      form.append('image', fs.createReadStream(testImagePath));
      form.append('minConfidence', '0.9');

      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // All detections should have confidence >= 0.9 or be empty
      body.detections.forEach((detection: any) => {
        if (detection.confidence) {
          expect(detection.confidence).toBeGreaterThanOrEqual(0.9);
        }
      });
    });
  });

  describe('Error Cases', () => {
    it('should return error when no image is provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        headers: {
          'content-type': 'multipart/form-data',
        },
      });

      // Should return either 400 (bad request) or 500 (server error)
      expect([400, 500]).toContain(response.statusCode);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });

    it('should handle invalid image data gracefully', async () => {
      const form = new FormData();
      form.append('image', Buffer.from('not an image'), {
        filename: 'invalid.jpg',
        contentType: 'image/jpeg',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        payload: form,
        headers: form.getHeaders(),
      });

      // Should either succeed with empty detections or return error
      expect([200, 500]).toContain(response.statusCode);
    });
  });

  describe('Performance', () => {
    it('should complete detection within reasonable time', async () => {
      const form = new FormData();
      form.append('image', fs.createReadStream(testImagePath));

      const startTime = Date.now();
      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        payload: form,
        headers: form.getHeaders(),
      });
      const endTime = Date.now();

      expect(response.statusCode).toBe(200);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});
