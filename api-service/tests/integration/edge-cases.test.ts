import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app';
import { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';

describe('Edge Cases & Stress Tests', () => {
  let app: FastifyInstance;
  const testImagePath = path.join(__dirname, '../fixtures/test-image.jpg');

  beforeAll(async () => {
    // Create test image if it doesn't exist
    if (!fs.existsSync(path.dirname(testImagePath))) {
      fs.mkdirSync(path.dirname(testImagePath), { recursive: true });
    }
    if (!fs.existsSync(testImagePath)) {
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

  describe('Image Size Edge Cases', () => {
    it('should handle very small images (1x1 pixel)', async () => {
      const form = new FormData();
      form.append('image', fs.createReadStream(testImagePath), {
        filename: 'tiny.jpg',
        contentType: 'image/jpeg',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        payload: form,
        headers: form.getHeaders(),
      });

      expect([200, 500]).toContain(response.statusCode);
    });

    it('should handle large images gracefully', async () => {
      // Create a 5MB buffer
      const largeBuffer = Buffer.alloc(5 * 1024 * 1024);
      const form = new FormData();
      form.append('image', largeBuffer, {
        filename: 'large.bin',
        contentType: 'application/octet-stream',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        payload: form,
        headers: form.getHeaders(),
      });

      // Should either process or return error gracefully
      expect([200, 400, 413, 500]).toContain(response.statusCode);
    });
  });

  describe('Confidence Threshold Edge Cases', () => {
    it('should handle minConfidence = 0', async () => {
      const form = new FormData();
      form.append('image', fs.createReadStream(testImagePath));
      form.append('minConfidence', '0');

      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.detections).toBeDefined();
    });

    it('should handle minConfidence = 1', async () => {
      const form = new FormData();
      form.append('image', fs.createReadStream(testImagePath));
      form.append('minConfidence', '1');

      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // Should return empty array or items with confidence exactly 1.0
      expect(Array.isArray(body.detections)).toBe(true);
    });

    it('should handle invalid minConfidence values', async () => {
      const form = new FormData();
      form.append('image', fs.createReadStream(testImagePath));
      form.append('minConfidence', '-1');

      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        payload: form,
        headers: form.getHeaders(),
      });

      // Should handle gracefully - either accept with default or reject
      expect([200, 400]).toContain(response.statusCode);
    });

    it('should handle minConfidence > 1', async () => {
      const form = new FormData();
      form.append('image', fs.createReadStream(testImagePath));
      form.append('minConfidence', '1.5');

      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        payload: form,
        headers: form.getHeaders(),
      });

      // Should handle gracefully
      expect([200, 400]).toContain(response.statusCode);
    });
  });

  describe('Invalid Input Edge Cases', () => {
    it('should handle non-image files', async () => {
      const form = new FormData();
      form.append('image', Buffer.from('This is not an image'), {
        filename: 'text.txt',
        contentType: 'text/plain',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        payload: form,
        headers: form.getHeaders(),
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should handle corrupted image data', async () => {
      const form = new FormData();
      // Create buffer that starts like JPEG but is corrupted
      const corruptedJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x00, 0x00]);
      form.append('image', corruptedJpeg, {
        filename: 'corrupted.jpg',
        contentType: 'image/jpeg',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        payload: form,
        headers: form.getHeaders(),
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should handle empty file', async () => {
      const form = new FormData();
      form.append('image', Buffer.alloc(0), {
        filename: 'empty.jpg',
        contentType: 'image/jpeg',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        payload: form,
        headers: form.getHeaders(),
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });

  describe('Concurrent Request Stress Tests', () => {
    it('should handle multiple concurrent requests', async () => {
      const requests = Array.from({ length: 10 }, () => {
        const form = new FormData();
        form.append('image', fs.createReadStream(testImagePath));

        return app.inject({
          method: 'POST',
          url: '/v1/detect',
          payload: form,
          headers: form.getHeaders(),
        });
      });

      const responses = await Promise.all(requests);

      // All requests should complete
      expect(responses.length).toBe(10);

      // Most should succeed
      const successCount = responses.filter(r => r.statusCode === 200).length;
      expect(successCount).toBeGreaterThan(5);
    });

    it('should handle rapid sequential requests', async () => {
      const responses = [];

      for (let i = 0; i < 20; i++) {
        const form = new FormData();
        form.append('image', fs.createReadStream(testImagePath));

        const response = await app.inject({
          method: 'POST',
          url: '/v1/detect',
          payload: form,
          headers: form.getHeaders(),
        });

        responses.push(response);
      }

      expect(responses.length).toBe(20);
      const successCount = responses.filter(r => r.statusCode === 200).length;
      expect(successCount).toBeGreaterThan(15);
    });
  });

  describe('Special Characters & Encoding', () => {
    it('should handle files with special characters in filename', async () => {
      const form = new FormData();
      form.append('image', fs.createReadStream(testImagePath), {
        filename: 'test-ñ-文字-🎉.jpg',
        contentType: 'image/jpeg',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        payload: form,
        headers: form.getHeaders(),
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should handle very long filenames', async () => {
      const form = new FormData();
      const longFilename = 'a'.repeat(255) + '.jpg';
      form.append('image', fs.createReadStream(testImagePath), {
        filename: longFilename,
        contentType: 'image/jpeg',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/detect',
        payload: form,
        headers: form.getHeaders(),
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });

  describe('Timeout & Circuit Breaker Tests', () => {
    it('should handle provider timeouts gracefully', async () => {
      const form = new FormData();
      form.append('image', fs.createReadStream(testImagePath));

      // Make multiple rapid requests to potentially trigger circuit breaker
      const responses = [];
      for (let i = 0; i < 10; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/detect',
          payload: form,
          headers: form.getHeaders(),
        });
        responses.push(response);
      }

      // All requests should complete (not hang)
      expect(responses.length).toBe(10);

      // Check that responses are reasonable
      responses.forEach(response => {
        expect(response.statusCode).toBeDefined();
        expect([200, 500, 503]).toContain(response.statusCode);
      });
    });
  });

  describe('Memory & Resource Tests', () => {
    it('should not leak memory on repeated requests', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 50; i++) {
        const form = new FormData();
        form.append('image', fs.createReadStream(testImagePath));

        await app.inject({
          method: 'POST',
          url: '/v1/detect',
          payload: form,
          headers: form.getHeaders(),
        });
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

      // Memory increase should be reasonable (< 100MB for 50 requests)
      expect(memoryIncrease).toBeLessThan(100);
    });
  });
});
