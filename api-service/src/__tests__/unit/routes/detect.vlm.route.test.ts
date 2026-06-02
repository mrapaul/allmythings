// Pin env BEFORE importing the route modules (envConfig reads process.env at
// load time). Keep persisted photos out of the real data dir.
process.env.NODE_ENV = 'development';
process.env.PHOTO_DIR = '/tmp/api-test-photos-vlm';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import FormData from 'form-data';
import { detectRoute } from '../../../routes/detect.route';
import { detectStreamRoute } from '../../../routes/detect-stream.route';
import { detectStatusRoute } from '../../../routes/detect-status.route';
import { detectedItemSchema } from '../../../schemas/detected-item.schema';
import { envConfig } from '../../../config/env.config';
import type { DetectedItem } from '../../../types/detected-item';
import type { VlmDetector } from '../../../services/vlm-detector';

const ITEMS: DetectedItem[] = [
  { label: 'sofa', description: 'red velvet sofa', category: 'Furniture', tags: ['red', 'velvet'], box: { x: 0.1, y: 0.5, width: 0.5, height: 0.3 } },
  { label: 'lamp', description: 'brass floor lamp', category: 'Lighting', tags: ['brass'], box: { x: 0.7, y: 0.2, width: 0.1, height: 0.4 } },
];

function fakeDetector(): VlmDetector {
  return {
    detect: async (): Promise<DetectedItem[]> => ITEMS,
    // eslint-disable-next-line @typescript-eslint/require-await
    detectStream: async function* () {
      for (const i of ITEMS) yield i;
    },
  } as unknown as VlmDetector;
}

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe('detect routes — VLM path', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    envConfig.detector = 'vlm';
    app = Fastify({ logger: false });
    app.addSchema(detectedItemSchema);
    await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 3 } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).vlmDetector = fakeDetector();
    await app.register(detectRoute);
    await app.register(detectStreamRoute);
    await app.register(detectStatusRoute);
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /v1/detect returns items synchronously', async () => {
    const form = new FormData();
    form.append('photo', TINY_JPEG, { filename: 'frame.jpg', contentType: 'image/jpeg' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect',
      payload: form.getBuffer(),
      headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].label).toBe('sofa');
    expect(body.items[0].tags).toContain('velvet');
  });

  it('POST /v1/detect/stream emits meta, item×N, done', async () => {
    const boundary = '----formdata-vlm-001';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from('Content-Disposition: form-data; name="frame"; filename="a.jpg"\r\n'),
      Buffer.from('Content-Type: image/jpeg\r\n\r\n'),
      TINY_JPEG,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect/stream',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = res.body.split('\n\n').filter(Boolean);
    expect(events[0]).toMatch(/^event: meta\ndata: \{/);
    expect(events[1]).toMatch(/^event: item\ndata: \{.*sofa/);
    expect(events[2]).toMatch(/^event: item\ndata: \{.*lamp/);
    expect(events[3]).toMatch(/^event: done\ndata: \{.*"totalItems":2/);
  });

  it('GET /v1/detect/status returns 404 in VLM mode (no async runs)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/detect/status/anything' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('run_not_found');
  });
});
