import { describe, expect, it, vi } from 'vitest';

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

describe('startDetection', () => {
  it('POSTs the frame to the async endpoint and returns the run handle', async () => {
    const handle = await startDetection({
      fileUri: 'file:///room.jpg',
      fileName: 'room.jpg',
      mimeType: 'image/jpeg',
    });
    expect(handle.runId).toBe('r-123');
    expect(handle.photoSha256).toBe('ab'.repeat(32));
    const [url, init] = vi.mocked(apiFetch).mock.calls[0] ?? [];
    expect(url).toBe('/v1/detect?async=1');
    expect((init as { method: string }).method).toBe('POST');
  });
});
