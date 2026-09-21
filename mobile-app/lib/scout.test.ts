import type { DetectStreamEvent, SceneInfo } from '@/api/types';
import type { BoundingBox } from '@/components/BoundingBoxOverlay';
import { describe, expect, it } from 'vitest';
import {
  applyScoutEvent,
  beginScout,
  cancelScout,
  initialScoutState,
  scoutProgress,
} from './scout';

const scene = (estimatedTotalItems: number | null): SceneInfo => ({
  type: 'shelf',
  estimatedTotalItems,
  verdict: 'ok',
  verdictReason: null,
});

const box = (x: number): BoundingBox => ({ x, y: 0.1, width: 0.2, height: 0.2 });

const itemEvent = (label: string, x: number): DetectStreamEvent => ({
  type: 'item',
  item: { label, description: '', category: 'Other', tags: [], box: box(x) },
});

function scanningWith(...events: DetectStreamEvent[]) {
  let s = beginScout(initialScoutState());
  for (const ev of events) s = applyScoutEvent(s, ev);
  return s;
}

describe('scout reducer', () => {
  it('begins empty and scanning', () => {
    const s = beginScout(initialScoutState());
    expect(s.status).toBe('scanning');
    expect(s.items).toEqual([]);
    expect(s.failed).toBe(false);
  });

  it('merges item bursts progressively in arrival order', () => {
    const s = scanningWith(
      { type: 'meta', runId: 'r1', traceId: 't1' },
      itemEvent('Vase', 0.1),
      itemEvent('Bowl', 0.4),
      itemEvent('Clock', 0.7),
    );
    expect(s.items.map((i) => i.label)).toEqual(['Vase', 'Bowl', 'Clock']);
    // Ids are stable per run + index.
    expect(s.items.map((i) => i.id)).toEqual(['r1-0', 'r1-1', 'r1-2']);
    // Boxes pass through untouched.
    expect(s.items[0]?.box).toEqual(box(0.1));
  });

  it('records the scene estimate for the progress denominator', () => {
    const s = scanningWith({ type: 'scene', scene: scene(12) }, itemEvent('A', 0.1));
    expect(s.scene?.estimatedTotalItems).toBe(12);
    expect(scoutProgress(s)).toBeCloseTo(1 / 12);
  });

  it('progress caps at 1 when more items arrive than the estimate', () => {
    let s = scanningWith({ type: 'scene', scene: scene(2) });
    s = applyScoutEvent(s, itemEvent('A', 0.1));
    s = applyScoutEvent(s, itemEvent('B', 0.3));
    s = applyScoutEvent(s, itemEvent('C', 0.5));
    expect(scoutProgress(s)).toBe(1);
  });

  it('progress is null without a scene estimate (indeterminate)', () => {
    const s = scanningWith(itemEvent('A', 0.1));
    expect(scoutProgress(s)).toBeNull();
  });

  it('done freezes the overlay with the final predictions', () => {
    const s = scanningWith(itemEvent('A', 0.1), {
      type: 'done',
      runId: 'r1',
      totalItems: 1,
    });
    expect(s.status).toBe('done');
    expect(s.items).toHaveLength(1);
    // Progress bar only exists while scanning.
    expect(scoutProgress(s)).toBeNull();
  });

  it('server error marks the run failed so the caller hides it silently', () => {
    const s = scanningWith(itemEvent('A', 0.1), {
      type: 'error',
      code: 'detector_unavailable',
    });
    expect(s.status).toBe('done');
    expect(s.failed).toBe(true);
  });

  it('cancel hides and drops predictions', () => {
    const s = scanningWith({ type: 'meta', runId: 'r1', traceId: 't1' }, itemEvent('A', 0.1));
    const cancelled = cancelScout(s);
    expect(cancelled).toEqual(initialScoutState());
  });

  it('cancel on an idle state is a no-op (same reference)', () => {
    const idle = initialScoutState();
    expect(cancelScout(idle)).toBe(idle);
  });

  it('ignores events that arrive after cancel (stale stream)', () => {
    const cancelled = cancelScout(scanningWith(itemEvent('A', 0.1)));
    const after = applyScoutEvent(cancelled, itemEvent('B', 0.4));
    expect(after.status).toBe('idle');
    expect(after.items).toEqual([]);
  });

  it('ignores events that arrive after done', () => {
    const done = scanningWith(itemEvent('A', 0.1), { type: 'done', runId: 'r1', totalItems: 1 });
    const after = applyScoutEvent(done, itemEvent('B', 0.4));
    expect(after.items).toHaveLength(1);
  });

  it('restarting mid-scan clears boxes but keeps the scene estimate', () => {
    let s = scanningWith({ type: 'scene', scene: scene(8) }, itemEvent('A', 0.1));
    s = beginScout(s);
    expect(s.status).toBe('scanning');
    expect(s.items).toEqual([]);
    expect(s.scene?.estimatedTotalItems).toBe(8);
  });

  it('merge suggestions do not touch the overlay', () => {
    const s = scanningWith({ type: 'merge-suggestions', suggestions: [] }, itemEvent('A', 0.1));
    expect(s.items).toHaveLength(1);
  });
});
