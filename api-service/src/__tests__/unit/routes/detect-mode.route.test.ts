// Pin env BEFORE importing the route modules (envConfig reads process.env at
// load time). Keep persisted photos out of the real data dir. NOTE: under
// vitest fork reuse env.config can be cached by another test file, so never
// rm -rf an envConfig-derived dir here — other files may share the resolved
// photos dir in parallel.
process.env.NODE_ENV = 'development';
process.env.PHOTO_DIR = '/tmp/api-test-photos-mode';
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
import type { DetectOptions, DetectionResult, Detector } from '../../../services/vlm-detector';
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

/**
 * Fake detector that records the per-request opts on every call, so tests
 * can assert exactly what the routes threaded into the detector.
 */
function recordingDetector(recorded: { detect: unknown[]; stream: unknown[] }): Detector {
  const scene = { ...DEFAULT_SCENE, type: 'room' as const };
  const result: DetectionResult = { scene, items: [item('sofa')], mergeSuggestions: [] };
  return {
    detect: async (_buffer: Buffer, opts?: DetectOptions) => {
      recorded.detect.push(opts ?? null);
      return result;
    },
    detectStream: async function* (_buffer: Buffer, opts?: DetectOptions) {
      recorded.stream.push(opts ?? null);
      yield { kind: 'scene' as const, scene };
      yield { kind: 'item' as const, item: item('sofa') };
    },
  };
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

describe('detect routes — scout mode (?mode=)', () => {
  let app: FastifyInstance;
  let recorded: { detect: unknown[]; stream: unknown[] };

  beforeEach(async () => {
    envConfig.detector = 'vlm';
    recorded = { detect: [], stream: [] };
    const detector = recordingDetector(recorded);
    app = Fastify({ logger: false });
    app.setErrorHandler(errorHandler);
    app.addSchema(detectedItemSchema);
    await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 3 } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).vlmDetector = detector;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).vlmRuns = new VlmRunStore(detector);
    await app.register(detectRoute);
    await app.register(detectStreamRoute);
    await app.register(detectStatusRoute);
  });

  afterEach(async () => {
    await app.close();
  });

  async function postDetect(query: string) {
    const form = new FormData();
    form.append('photo', TINY_JPEG, { filename: 'frame.jpg', contentType: 'image/jpeg' });
    return app.inject({
      method: 'POST',
      url: `/v1/detect${query}`,
      payload: form.getBuffer(),
      headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
    });
  }

  it('absent mode keeps the detector default (no per-request opts)', async () => {
    const res = await postDetect('');
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0].label).toBe('sofa');
    expect(recorded.detect).toEqual([null]);
  });

  it('mode=full keeps the detector default (no per-request opts)', async () => {
    const res = await postDetect('?mode=full');
    expect(res.statusCode).toBe(200);
    expect(recorded.detect).toEqual([null]);
  });

  it('mode=scout threads { twoPass: false } through the sync detect', async () => {
    const res = await postDetect('?mode=scout');
    expect(res.statusCode).toBe(200);
    expect(recorded.detect).toEqual([{ twoPass: false }]);
  });

  it('an unknown mode value 400s before any frame processing', async () => {
    const res = await postDetect('?mode=quick');
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('Unsupported mode');
    // No detector call: rejected before any frame processing.
    expect(recorded.detect).toEqual([]);
  });

  it('mode=scout threads { twoPass: false } through async=1 runs', async () => {
    const res = await postDetect('?mode=scout&async=1');
    expect(res.statusCode).toBe(202);
    const { runId, statusUrl } = res.json();

    await new Promise((r) => setTimeout(r, 5));
    const status = await app.inject({ method: 'GET', url: statusUrl });
    expect(status.statusCode).toBe(200);
    expect(status.json().status).toBe('completed');
    expect(status.json().result.items[0].label).toBe('sofa');
    expect(recorded.stream).toEqual([{ twoPass: false }]);
    expect(runId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('async=1 without mode keeps the detector default', async () => {
    const res = await postDetect('?async=1');
    expect(res.statusCode).toBe(202);
    await new Promise((r) => setTimeout(r, 5));
    expect(recorded.stream).toEqual([null]);
  });

  it('mode=scout threads { twoPass: false } through the SSE stream', async () => {
    const boundary = '----formdata-mode-001';
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect/stream?mode=scout',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary),
    });
    expect(res.statusCode).toBe(200);
    const events = res.body.split('\n\n').filter(Boolean);
    expect(events[0]).toMatch(/^event: meta\ndata: /);
    expect(events[2]).toMatch(/^event: item\ndata: \{.*sofa/);
    expect(recorded.stream).toEqual([{ twoPass: false }]);
  });

  it('an unknown mode value on the SSE route 400s as JSON before streaming', async () => {
    const boundary = '----formdata-mode-002';
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect/stream?mode=quick',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody(boundary),
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/json');
    // The route's 400 response schema declares only `error`, so the thrown
    // BadRequestError serializes down to its error name — and not an SSE
    // stream, because headers were never flushed.
    expect(res.json().error).toBe('BadRequestError');
    expect(recorded.stream).toEqual([]);
  });
});
