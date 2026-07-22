import { describe, expect, it, vi } from 'vitest';

vi.mock('./detect-status', () => ({
  getDetectStatus: vi.fn(),
}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));

import { pollDetectionEvents } from './detect-poll';
import { getDetectStatus } from './detect-status';

const item = (label: string) => ({
  label,
  description: '',
  category: 'Decor',
  tags: [],
  box: { x: 0, y: 0, width: 0.5, height: 0.5 },
});

const scene = { type: 'room', estimatedTotalItems: 5, verdict: 'ok', verdictReason: null };

describe('pollDetectionEvents', () => {
  it('emits meta, scene, incremental items, and done across polls', async () => {
    vi.mocked(getDetectStatus)
      .mockResolvedValueOnce({
        status: 'running',
        workflowId: 'r1',
        photoSha256: 'aa',
        scene,
        result: { items: [item('sofa')] },
      } as never)
      .mockResolvedValueOnce({
        status: 'running',
        workflowId: 'r1',
        photoSha256: 'aa',
        scene,
        result: { items: [item('sofa'), item('lamp')] },
      } as never)
      .mockResolvedValueOnce({
        status: 'completed',
        workflowId: 'r1',
        photoSha256: 'aa',
        scene,
        result: { items: [item('sofa'), item('lamp'), item('rug')] },
      } as never);

    const events = [];
    for await (const ev of pollDetectionEvents('r1', { intervalMs: 1 })) events.push(ev);

    expect(events.map((e) => e.type)).toEqual(['meta', 'scene', 'item', 'item', 'item', 'done']);
    expect(events[0]).toMatchObject({ type: 'meta', runId: 'r1', photoSha256: 'aa' });
    const labels = events
      .filter((e) => e.type === 'item')
      .map((e) => (e as { item: { label: string } }).item.label);
    expect(labels).toEqual(['sofa', 'lamp', 'rug']);
    expect(events.at(-1)).toMatchObject({ type: 'done', totalItems: 3 });
  });

  it('emits an error event when the run failed', async () => {
    vi.mocked(getDetectStatus).mockRejectedValueOnce(
      Object.assign(new Error('500'), {
        data: { status: 'failed', errorMessage: 'model down' },
      }),
    );
    const events = [];
    for await (const ev of pollDetectionEvents('r2', { intervalMs: 1 })) events.push(ev);
    expect(events.at(-1)).toMatchObject({ type: 'error' });
  });

  it('survives transient poll failures and keeps going', async () => {
    vi.mocked(getDetectStatus)
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({
        status: 'completed',
        workflowId: 'r3',
        photoSha256: 'bb',
        scene: null,
        result: { items: [item('vase')] },
      } as never);
    const events = [];
    for await (const ev of pollDetectionEvents('r3', { intervalMs: 1 })) events.push(ev);
    expect(events.map((e) => e.type)).toEqual(['meta', 'item', 'done']);
  });

  it('stops silently when aborted', async () => {
    const ctrl = new AbortController();
    vi.mocked(getDetectStatus).mockImplementation(async () => {
      ctrl.abort();
      return {
        status: 'running',
        workflowId: 'r4',
        photoSha256: 'cc',
        scene: null,
        result: { items: [] },
      } as never;
    });
    const events = [];
    for await (const ev of pollDetectionEvents('r4', { intervalMs: 1, signal: ctrl.signal })) {
      events.push(ev);
    }
    expect(events.filter((e) => e.type === 'done')).toHaveLength(0);
  });
});
