import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { savePhoto } from '../../../../temporal/activities/save-photo.activity';
import { DetectInput } from '../../../../temporal/shared-types';
import { envConfig } from '../../../../config/env.config';

describe('savePhoto activity', () => {
  let tmpDir: string;
  let originalPhotoDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'save-photo-test-'));
    originalPhotoDir = envConfig.photoDir;
    // envConfig.photoDir is computed at module-import time, so mutate directly
    // (see Task 8 Step 4 notes re: env caching).
    envConfig.photoDir = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    envConfig.photoDir = originalPhotoDir;
  });

  async function makeJpegInput(): Promise<DetectInput> {
    const buf = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: { r: 100, g: 100, b: 100 } },
    })
      .jpeg()
      .toBuffer();
    return {
      imageBase64: buf.toString('base64'),
      imageSha256: 'deadbeef',
      mimeType: 'image/jpeg',
      traceId: 'trace-1',
      requestId: 'req-1',
    };
  }

  it('saves the original image and a thumbnail, returns the ids/paths', async () => {
    const input = await makeJpegInput();
    const saved = await savePhoto(input);
    expect(saved.photoId).toMatch(/^[0-9a-f-]{36}$/);
    expect(fs.existsSync(saved.photoPath)).toBe(true);
    expect(fs.existsSync(saved.thumbnailPath)).toBe(true);
    expect(saved.bytes).toBeGreaterThan(0);
  });

  it('thumbnail width <= 400px', async () => {
    const input = await makeJpegInput();
    const saved = await savePhoto(input);
    const meta = await sharp(saved.thumbnailPath).metadata();
    expect(meta.width!).toBeLessThanOrEqual(400);
  });

  it('creates the photos directory if it does not exist', async () => {
    const nested = path.join(tmpDir, 'nested', 'photos-dir');
    envConfig.photoDir = nested;
    const input = await makeJpegInput();
    const saved = await savePhoto(input);
    expect(fs.existsSync(saved.photoPath)).toBe(true);
  });

  it('throws a non-retryable error on unsupported mime type', async () => {
    const input = await makeJpegInput();
    input.mimeType = 'text/plain';
    await expect(savePhoto(input)).rejects.toMatchObject({
      name: 'ApplicationFailure',
      nonRetryable: true,
    });
  });
});
