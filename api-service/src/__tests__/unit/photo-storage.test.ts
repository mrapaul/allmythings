import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PhotoStorageService } from '../../services/photo-storage.service';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('PhotoStorageService', () => {
  let service: PhotoStorageService;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-test-'));
    service = new PhotoStorageService(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('saves a photo and returns id + paths', async () => {
    const image = Buffer.from('fake-jpeg-data');
    const result = await service.save(image);

    expect(result.photoId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.photoPath).toContain(result.photoId);
    expect(result.thumbnailPath).toContain(result.photoId);
    expect(fs.existsSync(result.photoPath)).toBe(true);
  });

  it('creates photos directory if it does not exist', async () => {
    const newDir = path.join(testDir, 'nested', 'photos');
    const svc = new PhotoStorageService(newDir);
    const result = await svc.save(Buffer.from('data'));
    expect(fs.existsSync(result.photoPath)).toBe(true);
  });

  it('generates a thumbnail', async () => {
    const sharp = (await import('sharp')).default;
    const image = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: { r: 128, g: 128, b: 128 } },
    }).jpeg().toBuffer();

    const result = await service.save(image);
    expect(fs.existsSync(result.thumbnailPath)).toBe(true);

    const thumbMeta = await sharp(result.thumbnailPath).metadata();
    expect(thumbMeta.width).toBeLessThanOrEqual(400);
  });
});
