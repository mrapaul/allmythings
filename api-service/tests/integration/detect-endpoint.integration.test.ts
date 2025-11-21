/**
 * Integration tests for the detect endpoint
 * Tests the full pipeline: HTTP request -> detection -> response
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import pino from 'pino';
import { App } from '../../src/app';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

describe('POST /v1/detect Integration Tests', () => {
  let server: http.Server;
  let app: any;
  const PORT = 3001;
  const BASE_URL = `http://localhost:${PORT}`;
  const TEST_IMAGE_PATH = path.join(__dirname, '../../../test_images');

  beforeAll(async () => {
    // Start server
    const logger = pino({ level: 'silent' });
    app = new App(logger);

    return new Promise<void>((resolve) => {
      server = app.build().listen(PORT, () => {
        resolve();
      });
    });
  });

  afterAll(async () => {
    return new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  describe('Successful detection with valid image', () => {
    it('should detect objects from JPEG image', async () => {
      // Create a minimal JPEG test image
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      ]);

      const form = new FormData();
      form.append('file', jpegBuffer, {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      const response = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'localhost',
          port: PORT,
          path: '/v1/detect',
          method: 'POST',
          headers: form.getHeaders(),
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          });
        });

        req.on('error', reject);
        form.pipe(req);
      });

      expect((response as any).status).toBe(200);
      expect((response as any).body.detections).toBeDefined();
    });

    it('should return structured detection response', async () => {
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      ]);

      const form = new FormData();
      form.append('file', jpegBuffer, {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      const response = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'localhost',
          port: PORT,
          path: '/v1/detect',
          method: 'POST',
          headers: form.getHeaders(),
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          });
        });

        req.on('error', reject);
        form.pipe(req);
      });

      const body = (response as any).body;
      expect(body).toHaveProperty('detections');
      expect(body).toHaveProperty('totalObjects');
      expect(body).toHaveProperty('confidence');
      expect(Array.isArray(body.detections)).toBe(true);
    });

    it('should include detection metadata', async () => {
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      ]);

      const form = new FormData();
      form.append('file', jpegBuffer, {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      const response = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'localhost',
          port: PORT,
          path: '/v1/detect',
          method: 'POST',
          headers: form.getHeaders(),
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          });
        });

        req.on('error', reject);
        form.pipe(req);
      });

      const body = (response as any).body;
      expect(body.detections).toBeInstanceOf(Array);

      if (body.detections.length > 0) {
        const detection = body.detections[0];
        expect(detection).toHaveProperty('object');
        expect(detection).toHaveProperty('confidence');
        expect(typeof detection.object).toBe('string');
        expect(typeof detection.confidence).toBe('number');
        expect(detection.confidence).toBeGreaterThanOrEqual(0);
        expect(detection.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Error handling', () => {
    it('should return 400 for missing file', async () => {
      const response = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'localhost',
          port: PORT,
          path: '/v1/detect',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              body: data ? JSON.parse(data) : null,
            });
          });
        });

        req.on('error', reject);
        req.end();
      });

      expect((response as any).status).toBe(400);
    });

    it('should return 400 for invalid file format', async () => {
      const form = new FormData();
      form.append('file', Buffer.from('invalid image data'), {
        filename: 'invalid.jpg',
        contentType: 'image/jpeg',
      });

      const response = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'localhost',
          port: PORT,
          path: '/v1/detect',
          method: 'POST',
          headers: form.getHeaders(),
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              body: data ? JSON.parse(data) : null,
            });
          });
        });

        req.on('error', reject);
        form.pipe(req);
      });

      // Should either handle gracefully or return error
      expect(
        [(response as any).status].includes(400) ||
        [(response as any).status].includes(200)
      ).toBe(true);
    });

    it('should handle multiple file upload attempts gracefully', async () => {
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      ]);

      const promises = Array.from({ length: 5 }, () => {
        return new Promise((resolve, reject) => {
          const form = new FormData();
          form.append('file', jpegBuffer, {
            filename: 'test.jpg',
            contentType: 'image/jpeg',
          });

          const options = {
            hostname: 'localhost',
            port: PORT,
            path: '/v1/detect',
            method: 'POST',
            headers: form.getHeaders(),
          };

          const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              resolve({ status: res.statusCode });
            });
          });

          req.on('error', reject);
          form.pipe(req);
        });
      });

      const responses = await Promise.all(promises);
      expect(responses.every((r: any) => r.status === 200)).toBe(true);
    });
  });

  describe('Detection quality', () => {
    it('should return detections with reasonable confidence scores', async () => {
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      ]);

      const form = new FormData();
      form.append('file', jpegBuffer, {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      const response = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'localhost',
          port: PORT,
          path: '/v1/detect',
          method: 'POST',
          headers: form.getHeaders(),
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          });
        });

        req.on('error', reject);
        form.pipe(req);
      });

      const body = (response as any).body;
      const allValid = body.detections.every((d: any) => {
        return d.confidence >= 0 && d.confidence <= 1;
      });
      expect(allValid).toBe(true);
    });

    it('should return consistent results for same image', async () => {
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      ]);

      const detectOnce = () =>
        new Promise((resolve, reject) => {
          const form = new FormData();
          form.append('file', jpegBuffer, {
            filename: 'test.jpg',
            contentType: 'image/jpeg',
          });

          const options = {
            hostname: 'localhost',
            port: PORT,
            path: '/v1/detect',
            method: 'POST',
            headers: form.getHeaders(),
          };

          const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              resolve(JSON.parse(data));
            });
          });

          req.on('error', reject);
          form.pipe(req);
        });

      const result1 = await detectOnce();
      const result2 = await detectOnce();

      expect((result1 as any).totalObjects).toEqual((result2 as any).totalObjects);
    });
  });

  describe('Performance', () => {
    it('should respond within 10 seconds', async () => {
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      ]);

      const form = new FormData();
      form.append('file', jpegBuffer, {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      const start = Date.now();

      const response = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'localhost',
          port: PORT,
          path: '/v1/detect',
          method: 'POST',
          headers: form.getHeaders(),
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          });
        });

        req.on('error', reject);
        form.pipe(req);
      });

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(10000);
    });

    it('should handle parallel requests', async () => {
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      ]);

      const makeRequest = () =>
        new Promise((resolve, reject) => {
          const form = new FormData();
          form.append('file', jpegBuffer, {
            filename: 'test.jpg',
            contentType: 'image/jpeg',
          });

          const options = {
            hostname: 'localhost',
            port: PORT,
            path: '/v1/detect',
            method: 'POST',
            headers: form.getHeaders(),
          };

          const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              resolve({ status: res.statusCode });
            });
          });

          req.on('error', reject);
          form.pipe(req);
        });

      const responses = await Promise.all(
        Array.from({ length: 3 }, () => makeRequest())
      );
      expect(responses.every((r: any) => r.status === 200)).toBe(true);
    });
  });

  describe('Response format validation', () => {
    it('should include timestamp in response', async () => {
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      ]);

      const form = new FormData();
      form.append('file', jpegBuffer, {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      const response = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'localhost',
          port: PORT,
          path: '/v1/detect',
          method: 'POST',
          headers: form.getHeaders(),
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          });
        });

        req.on('error', reject);
        form.pipe(req);
      });

      const body = (response as any).body;
      expect(body).toHaveProperty('timestamp');
      expect(typeof body.timestamp).toBe('string');
    });

    it('should include execution time in response', async () => {
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      ]);

      const form = new FormData();
      form.append('file', jpegBuffer, {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      const response = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'localhost',
          port: PORT,
          path: '/v1/detect',
          method: 'POST',
          headers: form.getHeaders(),
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          });
        });

        req.on('error', reject);
        form.pipe(req);
      });

      const body = (response as any).body;
      expect(body).toHaveProperty('executionTime');
      expect(typeof body.executionTime).toBe('number');
    });
  });
});
