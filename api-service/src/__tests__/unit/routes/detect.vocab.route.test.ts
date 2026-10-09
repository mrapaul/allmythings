// Pin env BEFORE importing the route modules (envConfig reads process.env at
// load time). Keep persisted photos out of the real data dir.
process.env.NODE_ENV = 'development';
process.env.PHOTO_DIR = '/tmp/api-test-photos-vocab';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import FormData from 'form-data';
import { detectRoute } from '../../../routes/detect.route';
import { detectStreamRoute } from '../../../routes/detect-stream.route';
import { detectedItemSchema } from '../../../schemas/detected-item.schema';
import { envConfig } from '../../../config/env.config';
import type { DetectedItem } from '../../../types/detected-item';
import type { DetectionResult, DetectOptions, VlmDetector } from '../../../services/vlm-detector';
import { DEFAULT_SCENE } from '../../../services/vlm-detector.parse';
import { VlmRunStore } from '../../../services/vlm-run-store';

const ITEMS: DetectedItem[] = [
  {
    label: 'sofa',
    description: 'red velvet sofa',
    category: 'Furniture',
    tags: ['red'],
    box: { x: 0.1, y: 0.5, width: 0.5, height: 0.3 },
  },
];

/** Records the DetectOptions each detector entry point was called with. */
function fakeDetector(captured: { opts?: DetectOptions }[]): VlmDetector {
  const scene = { ...DEFAULT_SCENE, type: 'room' as const, estimatedTotalItems: 1 };
  return {
    detect: async (_buf: Buffer, opts?: DetectOptions): Promise<DetectionResult> => {
      captured.push({ opts });
      return { scene, items: ITEMS, mergeSuggestions: [] };
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    detectStream: async function* (_buf: Buffer, opts?: DetectOptions) {
      captured.push({ opts });
      yield { kind: 'scene' as const, scene };
      for (const i of ITEMS) yield { kind: 'item' as const, item: i };
    },
  } as unknown as VlmDetector;
}

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

/** Hand-built multipart body so field-before-file ordering is testable. */
function multipartBody(
  parts: Array<{ name: string; value?: string; file?: Buffer }>,
  boundary: string,
): Buffer {
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (p.file) {
      chunks.push(
        Buffer.from(`Content-Disposition: form-data; name="${p.name}"; filename="a.jpg"\r\n`),
      );
      chunks.push(Buffer.from('Content-Type: image/jpeg\r\n\r\n'));
      chunks.push(p.file);
      chunks.push(Buffer.from('\r\n'));
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${p.name}"\r\n\r\n`));
      chunks.push(Buffer.from(p.value ?? ''));
      chunks.push(Buffer.from('\r\n'));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

describe('detect routes — vocab priming field', () => {
  let app: FastifyInstance;
  let captured: { opts?: DetectOptions }[];

  beforeEach(async () => {
    envConfig.detector = 'vlm';
    captured = [];
    app = Fastify({ logger: false });
    app.addSchema(detectedItemSchema);
    await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 3 } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).vlmDetector = fakeDetector(captured);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).vlmRuns = new VlmRunStore(fakeDetector(captured));
    await app.register(detectRoute);
    await app.register(detectStreamRoute);
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts a JSON-array vocab field and passes the cleaned list to the detector', async () => {
    const form = new FormData();
    // Field BEFORE the file: vocab must be collected regardless of order.
    form.append('vocab', JSON.stringify(['  Navy Sofa ', 'lamp', '', 'lamp', 'NAVY SOFA']));
    form.append('photo', TINY_JPEG, { filename: 'frame.jpg', contentType: 'image/jpeg' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect',
      payload: form.getBuffer(),
      headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
    });
    expect(res.statusCode).toBe(200);
    expect(captured).toHaveLength(1);
    // Trimmed, empties dropped, deduped case-insensitively (first casing wins).
    expect(captured[0]!.opts?.vocab).toEqual(['Navy Sofa', 'lamp']);
  });

  it('accepts a comma-separated vocab field', async () => {
    const form = new FormData();
    form.append('photo', TINY_JPEG, { filename: 'frame.jpg', contentType: 'image/jpeg' });
    form.append('vocab', 'oak table, brass lamp,,oak table');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect',
      payload: form.getBuffer(),
      headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
    });
    expect(res.statusCode).toBe(200);
    expect(captured[0]!.opts?.vocab).toEqual(['oak table', 'brass lamp']);
  });

  it('silently truncates to 120 entries', async () => {
    const form = new FormData();
    form.append('photo', TINY_JPEG, { filename: 'frame.jpg', contentType: 'image/jpeg' });
    form.append('vocab', JSON.stringify(Array.from({ length: 150 }, (_, i) => `item ${i}`)));
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect',
      payload: form.getBuffer(),
      headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
    });
    expect(res.statusCode).toBe(200);
    const vocab = captured[0]!.opts?.vocab;
    expect(vocab).toHaveLength(120);
    expect(vocab![0]).toBe('item 0');
    expect(vocab![119]).toBe('item 119');
  });

  it('silently cuts entries longer than 40 chars', async () => {
    const form = new FormData();
    form.append('photo', TINY_JPEG, { filename: 'frame.jpg', contentType: 'image/jpeg' });
    form.append('vocab', 'x'.repeat(50));
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect',
      payload: form.getBuffer(),
      headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
    });
    expect(res.statusCode).toBe(200);
    expect(captured[0]!.opts?.vocab).toEqual(['x'.repeat(40)]);
  });

  it('rejects unparseable JSON vocab with 400 invalid_body', async () => {
    const form = new FormData();
    form.append('photo', TINY_JPEG, { filename: 'frame.jpg', contentType: 'image/jpeg' });
    form.append('vocab', '["unclosed');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect',
      payload: form.getBuffer(),
      headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_body');
    expect(captured).toHaveLength(0);
  });

  it('rejects JSON that is not an array with 400 invalid_body', async () => {
    const form = new FormData();
    form.append('photo', TINY_JPEG, { filename: 'frame.jpg', contentType: 'image/jpeg' });
    form.append('vocab', '"sofa"');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect',
      payload: form.getBuffer(),
      headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_body');
  });

  it('rejects arrays with non-string entries with 400 invalid_body', async () => {
    const form = new FormData();
    form.append('photo', TINY_JPEG, { filename: 'frame.jpg', contentType: 'image/jpeg' });
    form.append('vocab', '[1, 2]');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect',
      payload: form.getBuffer(),
      headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_body');
  });

  it('leaves the detector call untouched when vocab is absent', async () => {
    const form = new FormData();
    form.append('photo', TINY_JPEG, { filename: 'frame.jpg', contentType: 'image/jpeg' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect',
      payload: form.getBuffer(),
      headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
    });
    expect(res.statusCode).toBe(200);
    expect(captured[0]!.opts).toBeUndefined();
  });

  it('an empty vocab field behaves like an absent one', async () => {
    const form = new FormData();
    form.append('photo', TINY_JPEG, { filename: 'frame.jpg', contentType: 'image/jpeg' });
    form.append('vocab', '   ');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect',
      payload: form.getBuffer(),
      headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
    });
    expect(res.statusCode).toBe(200);
    expect(captured[0]!.opts).toBeUndefined();
  });

  it('combines vocab with scout mode (?mode=scout)', async () => {
    const form = new FormData();
    form.append('photo', TINY_JPEG, { filename: 'frame.jpg', contentType: 'image/jpeg' });
    form.append('vocab', 'sofa');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect?mode=scout',
      payload: form.getBuffer(),
      headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
    });
    expect(res.statusCode).toBe(200);
    expect(captured[0]!.opts).toEqual({ twoPass: false, vocab: ['sofa'] });
  });

  it('carries vocab into the async (?async=1) run options', async () => {
    const form = new FormData();
    form.append('photo', TINY_JPEG, { filename: 'frame.jpg', contentType: 'image/jpeg' });
    form.append('vocab', 'sofa, lamp');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect?async=1',
      payload: form.getBuffer(),
      headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
    });
    expect(res.statusCode).toBe(202);
    // The run store's detector picks the options up once it executes.
    await new Promise((r) => setTimeout(r, 5));
    expect(captured[0]!.opts?.vocab).toEqual(['sofa', 'lamp']);
  });

  it('stream endpoint passes vocab to the streaming detector', async () => {
    const boundary = '----formdata-vocab-stream-1';
    const body = multipartBody(
      [
        { name: 'frame', file: TINY_JPEG },
        { name: 'vocab', value: JSON.stringify(['navy blue couch']) },
      ],
      boundary,
    );
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect/stream',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(captured[0]!.opts?.vocab).toEqual(['navy blue couch']);
    expect(res.body).toContain('event: done');
  });

  it('stream endpoint rejects invalid vocab with a plain 400 before SSE headers', async () => {
    const boundary = '----formdata-vocab-stream-2';
    const body = multipartBody(
      [
        { name: 'frame', file: TINY_JPEG },
        { name: 'vocab', value: '["unclosed' },
      ],
      boundary,
    );
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect/stream',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_body');
    expect(res.headers['content-type']).not.toContain('text/event-stream');
    expect(captured).toHaveLength(0);
  });
});
