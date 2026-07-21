import type { DetectedItem } from '@/api/types';
import { Prefs } from '@/stores/prefs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CorrectionsQueue, MAX_QUEUED, buildCorrectionEvents } from './corrections';

vi.mock('@/api/client', () => ({
  apiFetch: vi.fn(async () => undefined),
  makeTraceparent: () => '00-abc-def-01',
}));

import { apiFetch } from '@/api/client';

const item = (label: string): DetectedItem => ({
  label,
  description: '',
  category: 'Decor',
  tags: [],
  box: { x: 0, y: 0, width: 0.2, height: 0.2 },
});

const row = (over: Record<string, unknown>) => ({
  id: 'r1',
  item: item('vase'),
  included: true,
  saving: false,
  saved: false,
  ...over,
});

describe('buildCorrectionEvents', () => {
  it('maps rows to accept / discard / relabel / add_box events', () => {
    const rows = [
      row({ id: 'a' }),
      row({ id: 'b', included: false }),
      row({ id: 'c', manual: true }),
      row({ id: 'd' }),
    ];
    const tagsByRow = { d: ['blue vase', 'blue'] };
    const events = buildCorrectionEvents(rows, tagsByRow, null, false);
    expect(events.map((e) => e.type)).toEqual(['accept', 'discard', 'add_box', 'relabel']);
    const relabel = events[3] as { newLabel: string; newTags: string[] };
    expect(relabel.newLabel).toBe('blue vase');
    expect(relabel.newTags).toEqual(['blue vase', 'blue']);
  });

  it('appends a photo_verdict event when a scene verdict exists', () => {
    const scene = {
      type: 'room' as const,
      estimatedTotalItems: null,
      verdict: 'too_dark' as const,
      verdictReason: null,
    };
    const events = buildCorrectionEvents([], {}, scene, true);
    expect(events).toEqual([{ type: 'photo_verdict', verdict: 'too_dark', userOverride: true }]);
  });
});

describe('CorrectionsQueue', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockClear();
    vi.mocked(apiFetch).mockResolvedValue(undefined as never);
  });

  const payload = {
    photoSha256: 'ab'.repeat(32),
    model: 'unknown',
    capturedAt: '2026-07-21T00:00:00.000Z',
    scene: null,
    events: [],
  };

  it('posts immediately and leaves the queue empty on success', async () => {
    const q = new CorrectionsQueue(Prefs.makeInMemory());
    await q.submit(payload);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(await q.flush()).toBe(0);
  });

  it('keeps failed payloads queued and retries them on flush', async () => {
    const prefs = Prefs.makeInMemory();
    const q = new CorrectionsQueue(prefs);
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('offline'));
    await q.submit(payload);
    expect(prefs.getCorrectionsQueue()).toHaveLength(1);

    await q.flush();
    expect(prefs.getCorrectionsQueue()).toHaveLength(0);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('caps the stored queue at MAX_QUEUED', async () => {
    const prefs = Prefs.makeInMemory();
    const q = new CorrectionsQueue(prefs);
    vi.mocked(apiFetch).mockRejectedValue(new Error('offline'));
    for (let i = 0; i < MAX_QUEUED + 5; i++) {
      await q.submit({ ...payload, capturedAt: String(i) });
    }
    expect(prefs.getCorrectionsQueue()).toHaveLength(MAX_QUEUED);
  });
});
