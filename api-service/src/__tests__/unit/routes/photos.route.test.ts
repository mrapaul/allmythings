// Pin env BEFORE importing the route modules (envConfig reads process.env at
// load time). Keep persisted photos out of the real data dir. NOTE: under
// vitest fork reuse env.config can be cached by another test file, so never
// rm -rf an envConfig-derived dir here and use per-test random photo shas —
// other files may share the resolved photos dir in parallel.
process.env.NODE_ENV = 'development';
process.env.PHOTO_DIR = '/tmp/api-test-photos-serving';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { photosRoute } from '../../../routes/photos.route';
import { annotatedPhotoPath } from '../../../services/photo-annotator';
import { envConfig } from '../../../config/env.config';

const PHOTOS_DIR = path.join(envConfig.photoDir, 'photos');

function writeRaw(sha: string): Buffer {
  const bytes = Buffer.from(`raw-photo-bytes-${sha}`);
  fs.writeFileSync(path.join(PHOTOS_DIR, `${sha}.jpg`), bytes);
  return bytes;
}

function writeAnnotated(sha: string): Buffer {
  const bytes = Buffer.from(`annotated-jpeg-bytes-${sha}`);
  fs.writeFileSync(annotatedPhotoPath(PHOTOS_DIR, sha), bytes);
  return bytes;
}

describe('GET /photos/:filename — annotated serving', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
    app = Fastify({ logger: false });
    // Mirror app.ts: static wildcard + the parametric photos route (the
    // parametric route wins for single-segment paths).
    await app.register(fastifyStatic, {
      root: PHOTOS_DIR,
      prefix: '/photos/',
      decorateReply: true,
    });
    await app.register(photosRoute);
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves the annotated render with ?annotated=1 when it exists', async () => {
    const sha = crypto.randomBytes(32).toString('hex');
    const annotated = writeAnnotated(sha);
    const res = await app.inject({ method: 'GET', url: `/photos/${sha}.jpg?annotated=1` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(res.rawPayload.equals(annotated)).toBe(true);
  });

  it('404s with ?annotated=1 when the annotated render does not exist yet', async () => {
    const sha = crypto.randomBytes(32).toString('hex');
    writeRaw(sha);
    const res = await app.inject({ method: 'GET', url: `/photos/${sha}.jpg?annotated=1` });
    expect(res.statusCode).toBe(404);
  });

  it('404s with ?annotated=1 for an unknown photo', async () => {
    const sha = crypto.randomBytes(32).toString('hex');
    const res = await app.inject({ method: 'GET', url: `/photos/${sha}.jpg?annotated=1` });
    expect(res.statusCode).toBe(404);
  });

  it('serves the raw photo when the annotated query is absent', async () => {
    const sha = crypto.randomBytes(32).toString('hex');
    const raw = writeRaw(sha);
    writeAnnotated(sha);
    const res = await app.inject({ method: 'GET', url: `/photos/${sha}.jpg` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(res.rawPayload.equals(raw)).toBe(true);
  });

  it('ignores annotated=0 and serves the raw photo', async () => {
    const sha = crypto.randomBytes(32).toString('hex');
    const raw = writeRaw(sha);
    writeAnnotated(sha);
    const res = await app.inject({ method: 'GET', url: `/photos/${sha}.jpg?annotated=0` });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(raw)).toBe(true);
  });

  it('resolves the annotated render regardless of the raw extension', async () => {
    const sha = crypto.randomBytes(32).toString('hex');
    const annotated = writeAnnotated(sha);
    const res = await app.inject({ method: 'GET', url: `/photos/${sha}.png?annotated=1` });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(annotated)).toBe(true);
  });
});
