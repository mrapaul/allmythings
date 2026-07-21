import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FlywheelService } from '../../../services/flywheel.service';

let dir: string;
let svc: FlywheelService;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flywheel-test-'));
  svc = new FlywheelService(dir);
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('FlywheelService', () => {
  it('appends one JSON line per record into a dated file', async () => {
    await svc.append({ photoSha256: 'a'.repeat(64), model: 'm', events: [] });
    await svc.append({ photoSha256: 'b'.repeat(64), model: 'm', events: [] });

    const files = await fs.readdir(path.join(dir, 'flywheel'));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}\.jsonl$/);

    const lines = (await fs.readFile(path.join(dir, 'flywheel', files[0]!), 'utf-8'))
      .trim()
      .split('\n');
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]!);
    expect(first.photoSha256).toBe('a'.repeat(64));
    expect(typeof first.receivedAt).toBe('string');
  });
});
