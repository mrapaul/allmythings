import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}));

vi.mock('./client', () => ({
  apiFetch: vi.fn(async () => ({
    runId: 'r-123',
    photoSha256: 'ab'.repeat(32),
    statusUrl: '/v1/detect/status/r-123',
  })),
  makeTraceparent: () => '00-abc-def-01',
}));

import { apiFetch } from './client';
import { startDetection } from './detect';
import { clearDetectVocabProvider, setDetectVocabProvider } from './vocab';

const FRAME = {
  fileUri: 'file:///room.jpg',
  fileName: 'room.jpg',
  mimeType: 'image/jpeg',
} as const;

describe('startDetection', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockClear();
  });

  afterEach(() => {
    clearDetectVocabProvider();
  });

  it('POSTs the frame to the async endpoint and returns the run handle', async () => {
    const handle = await startDetection(FRAME);
    expect(handle.runId).toBe('r-123');
    expect(handle.photoSha256).toBe('ab'.repeat(32));
    const [url, init] = vi.mocked(apiFetch).mock.calls[0] ?? [];
    expect(url).toBe('/v1/detect?async=1');
    expect((init as { method: string }).method).toBe('POST');
  });

  it('attaches the inventory vocabulary as the vocab multipart field', async () => {
    setDetectVocabProvider(async () => ['sofa', 'Lamp']);
    await startDetection(FRAME);
    const [, init] = vi.mocked(apiFetch).mock.calls[0] ?? [];
    const body = (init as { body: FormData }).body;
    expect(JSON.parse(body.get('vocab') as string)).toEqual(['sofa', 'Lamp']);
  });

  it('caps the attached vocabulary at 120 entries', async () => {
    setDetectVocabProvider(async () => Array.from({ length: 200 }, (_, i) => `item-${i}`));
    await startDetection(FRAME);
    const [, init] = vi.mocked(apiFetch).mock.calls[0] ?? [];
    const body = (init as { body: FormData }).body;
    expect((JSON.parse(body.get('vocab') as string) as string[]).length).toBeLessThanOrEqual(120);
  });

  it('omits the vocab field entirely when the inventory has nothing to say', async () => {
    await startDetection(FRAME);
    const [, init] = vi.mocked(apiFetch).mock.calls[0] ?? [];
    const body = (init as { body: FormData }).body;
    expect(body.get('vocab')).toBeNull();
  });

  it('still dispatches when the vocab provider throws', async () => {
    setDetectVocabProvider(async () => {
      throw new Error('db locked');
    });
    await expect(startDetection(FRAME)).resolves.toMatchObject({ runId: 'r-123' });
    const [, init] = vi.mocked(apiFetch).mock.calls[0] ?? [];
    expect((init as { body: FormData }).body.get('vocab')).toBeNull();
  });
});
