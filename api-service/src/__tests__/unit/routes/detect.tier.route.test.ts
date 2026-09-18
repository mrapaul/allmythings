// Pin env BEFORE importing the route modules (envConfig reads process.env at
// load time). Keep persisted photos out of the real data dir.
process.env.NODE_ENV = 'development';
process.env.PHOTO_DIR = '/tmp/api-test-photos-tier';
process.env.SSE_ITEM_DRIBBLE_MS = '0';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import FormData from 'form-data';
import { detectRoute } from '../../../routes/detect.route';
import { detectStreamRoute } from '../../../routes/detect-stream.route';
import { detectStatusRoute } from '../../../routes/detect-status.route';
import { detectedItemSchema } from '../../../schemas/detected-item.schema';
import { errorHandler } from '../../../middleware/error.middleware';
import { envConfig } from '../../../config/env.config';
import type { DetectedItem } from '../../../types/detected-item';
import type { DetectionResult, Detector } from '../../../services/vlm-detector';
import { DEFAULT_SCENE } from '../../../services/vlm-detector.parse';
import { VlmRunStore } from '../../../services/vlm-run-store';

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function item(label: string): DetectedItem {
  return {
    label,
    description: '',
    category: 'Furniture',
    tags: [],
    box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
  };
}

/** Fake detector that records how many times it ran and yields `label`. */
function fakeDetector(label: string, calls: { count: number }): Detector {
  const scene = { ...DEFAULT_SCENE, type: 'room' as const };
  const result: DetectionResult = { scene, items: [item(label)], mergeSuggestions: [] };
  return {
    detect: async () => {
      calls.count += 1;
      return result;
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    detectStream: async function* () {
      calls.count += 1;
      yield { kind: 'scene' as const, scene };
      yield { kind: 'item' as const, item: item(label) };
    },
  } as unknown as Detector;
}

function multipartBody(boundary: string): Buffer {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from('Content-Disposition: form-data; name="frame"; filename="a.jpg"\r\n'),
    Buffer.from('Content-Type: image/jpeg\r\n\r\n'),
    TINY_JPEG,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

describe('detect routes — quality tier selection', () => {
  let app: FastifyInstance;
  let standardCalls: { count: number };
  let qualityCalls: { count: number };

  async function buildApp(opts: { withQuality: boolean }): Promise<void> {
    app = Fastify({ logger: false });
    app.setErrorHandler(errorHandler);
    app.addSchema(detectedItemSchema);
    await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 3 } });
    const standard = fakeDetector('standard-sofa', standardCalls);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).vlmDetector = standard;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).vlmRuns = new VlmRunStore(standard);
    if (opts.withQuality) {
      const quality = fakeDetector('quality-sofa', qualityCalls);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (app as any).qualityVlmDetector = quality;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (app as any).qualityVlmRuns = new VlmRunStore(quality);
    }
    await app.register(detectRoute);
    await app.register(detectStreamRoute);
    await app.register(detectStatusRoute);
  }

  beforeEach(async () => {
    envConfig.detector = 'vlm';
    standardCalls = { count: 0 };
    qualityCalls = { count: 0 };
    await buildApp({ withQuality: true });
  });

  afterEach(async () => {
    await app.close();
  });

  async function postDetect(query: string): Promise<import('fastify').LightMyRequestResponse> {
    const form = new FormData();
    form.append('photo', TINY_JPEG, { filename: 'frame.jpg', contentType: 'image/jpeg' });
    return app.inject({
      method: 'POST',
      url: `/v1/detect${query}`,
      payload: form.getBuffer(),
      headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
    });
  }

  it('absent tier uses the standard detector', async () => {
    const res = await postDetect('');
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0].label).toBe('standard-sofa');
    expect(standardCalls.count).toBe(1);
    expect(qualityCalls.count).toBe(0);
  });

  it('tier=standard uses the standard detector', async () => {
    const res = await postDetect('?tier=standard');
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0].label).toBe('standard-sofa');
    expect(qualityCalls.count).toBe(0);
  });

  it('tier=quality routes the sync detect through the quality detector', async () => {
    const res = await postDetect('?tier=quality');
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0].label).toBe('quality-sofa');
    expect(qualityCalls.count).toBe(1);
    expect(standardCalls.count).toBe(0);
  });

  it('tier=quality&async=1 registers a quality run servable via the status route', async () => {
    const res = await postDetect('?tier=quality&async=1');
    expect(res.statusCode).toBe(202);
    const { runId, statusUrl } = res.json();
    expect(statusUrl).toBe(`/v1/detect/status/${runId}`);

    await new Promise((r) => setTimeout(r, 5));
    const status = await app.inject({ method: 'GET', url: statusUrl });
    expect(status.statusCode).toBe(200);
    expect(status.json().result.items[0].label).toBe('quality-sofa');
    expect(qualityCalls.count).toBe(1);
    expect(standardCalls.count).toBe(0);
  });

  it('tier=quality without a configured quality detector 400s before any frame processing', async () => {
    await app.close();
    await buildApp({ withQuality: false }); // routes bind app props at registration
    const res = await postDetect('?tier=quality');
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('QUALITY_VLM_URL');
    expect(standardCalls.count).toBe(0);
    expect(qualityCalls.count).toBe(0);
  });

  it('an unknown tier value 400s', async () => {
    const res = await postDetect('?tier=best');
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('Unsupported tier');
    expect(standardCalls.count).toBe(0);
  });

  it('POST /v1/detect/stream with tier=quality streams quality items', async () => {
    const boundary = '----formdata-tier-001';
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect/stream?tier=quality',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary),
    });
    expect(res.statusCode).toBe(200);
    const events = res.body.split('\n\n').filter(Boolean);
    expect(events[0]).toMatch(/^event: meta\ndata: /);
    expect(events[1]).toMatch(/^event: scene\ndata: /);
    expect(events[2]).toMatch(/^event: item\ndata: \{.*quality-sofa/);
    expect(qualityCalls.count).toBe(1);
    expect(standardCalls.count).toBe(0);
  });

  it('POST /v1/detect/stream with tier=quality unconfigured 400s as JSON (not SSE)', async () => {
    await app.close();
    await buildApp({ withQuality: false }); // routes bind app props at registration
    const boundary = '----formdata-tier-002';
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect/stream?tier=quality',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary),
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.json().error).toBe('quality_tier_unavailable');
    expect(standardCalls.count).toBe(0);
  });
});
