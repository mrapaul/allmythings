import { describe, expect, it } from 'vitest';
import {
  DONE_LINGER_MS,
  FAILED_LINGER_MS,
  type QueueEvent,
  initialQueueState,
  queueNeedsClock,
  queueReduce,
  shotStatusLine,
} from './capture-queue';

const run = (events: QueueEvent[]) => events.reduce(queueReduce, initialQueueState());

const first = (shots: ReturnType<typeof run>) => {
  const shot = shots[0];
  if (!shot) throw new Error('expected a shot on the reel');
  return shot;
};

describe('queueReduce', () => {
  it('narrates one shot end to end: shutter → sending → processing → done', () => {
    let shots = run([{ type: 'shutter', key: 'k1', uri: 'file:///a.jpg', at: 1000 }]);
    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({ phase: 'sending', uri: 'file:///a.jpg' });

    shots = queueReduce(shots, { type: 'dispatched', key: 'k1', runId: 'r1' });
    expect(shots[0]).toMatchObject({ phase: 'processing', runId: 'r1' });

    shots = queueReduce(shots, { type: 'run_ready', runId: 'r1', itemCount: 12, at: 9000 });
    expect(shots[0]).toMatchObject({ phase: 'done', itemCount: 12, phaseAt: 9000 });
  });

  it('keeps every in-flight shot as its own frame, newest last', () => {
    const shots = run([
      { type: 'shutter', key: 'k1', uri: 'file:///a.jpg', at: 0 },
      { type: 'dispatched', key: 'k1', runId: 'r1' },
      { type: 'shutter', key: 'k2', uri: 'file:///b.jpg', at: 5000 },
    ]);
    expect(shots.map((s) => s.uri)).toEqual(['file:///a.jpg', 'file:///b.jpg']);
    expect(shots.map((s) => s.phase)).toEqual(['processing', 'sending']);

    // The first run finishing updates ITS frame, not the newest one.
    const after = queueReduce(shots, { type: 'run_ready', runId: 'r1', itemCount: 3, at: 6000 });
    expect(after.map((s) => s.phase)).toEqual(['done', 'sending']);
  });

  it('routes both failure legs to the saved-for-retry state', () => {
    const dispatchFail = run([
      { type: 'shutter', key: 'k1', uri: 'file:///a.jpg', at: 0 },
      { type: 'dispatch_failed', key: 'k1', at: 100 },
    ]);
    expect(first(dispatchFail)).toMatchObject({ phase: 'failed', phaseAt: 100 });

    const runFail = run([
      { type: 'shutter', key: 'k1', uri: 'file:///a.jpg', at: 0 },
      { type: 'dispatched', key: 'k1', runId: 'r1' },
      { type: 'run_failed', runId: 'r1', at: 200 },
    ]);
    expect(first(runFail)).toMatchObject({ phase: 'failed', phaseAt: 200 });
  });

  it('prunes done frames after their linger, failed frames after theirs', () => {
    const shots = run([
      { type: 'shutter', key: 'k1', uri: 'file:///a.jpg', at: 0 },
      { type: 'dispatched', key: 'k1', runId: 'r1' },
      { type: 'run_ready', runId: 'r1', itemCount: 2, at: 1000 },
      { type: 'shutter', key: 'k2', uri: 'file:///b.jpg', at: 0 },
      { type: 'dispatch_failed', key: 'k2', at: 1000 },
      { type: 'shutter', key: 'k3', uri: 'file:///c.jpg', at: 0 },
    ]);

    // Before either linger expires: everything stays.
    const early = queueReduce(shots, { type: 'prune', now: 1000 + DONE_LINGER_MS - 1 });
    expect(early).toHaveLength(3);
    // Identity-stable when nothing expired.
    expect(early).toBe(shots);

    // Done expires first…
    const midway = queueReduce(shots, { type: 'prune', now: 1000 + DONE_LINGER_MS });
    expect(midway.map((s) => s.key)).toEqual(['k2', 'k3']);

    // …then failed; in-flight frames are never pruned.
    const late = queueReduce(shots, { type: 'prune', now: 1000 + FAILED_LINGER_MS });
    expect(late.map((s) => s.key)).toEqual(['k3']);
  });

  it('ignores stale events for unknown keys and non-matching phases', () => {
    const shots = run([
      { type: 'shutter', key: 'k1', uri: 'file:///a.jpg', at: 0 },
      { type: 'dispatch_failed', key: 'k1', at: 100 },
    ]);
    // A late dispatch answer for an already-failed shot changes nothing.
    expect(first(queueReduce(shots, { type: 'dispatched', key: 'k1', runId: 'r1' })).phase).toBe(
      'failed',
    );
    expect(
      first(queueReduce(shots, { type: 'run_ready', runId: 'zzz', itemCount: 1, at: 0 })).phase,
    ).toBe('failed');
  });
});

describe('shotStatusLine', () => {
  it('speaks the shared staged vocabulary while processing', () => {
    const shot = first(
      run([
        { type: 'shutter', key: 'k1', uri: 'file:///a.jpg', at: 0 },
        { type: 'dispatched', key: 'k1', runId: 'r1' },
      ]),
    );
    expect(shotStatusLine(shot, 2_000)).toBe('Reading the scene…');
    expect(shotStatusLine(shot, 20_000)).toBe('Cataloguing items…');
  });

  it('covers every phase with one calm line', () => {
    const base = first(run([{ type: 'shutter', key: 'k1', uri: 'file:///a.jpg', at: 0 }]));
    expect(shotStatusLine(base, 0)).toBe('Sending…');
    expect(shotStatusLine({ ...base, phase: 'done', itemCount: 1 }, 0)).toBe('✓ 1 item found');
    expect(shotStatusLine({ ...base, phase: 'done', itemCount: 12 }, 0)).toBe('✓ 12 items found');
    expect(shotStatusLine({ ...base, phase: 'failed' }, 0)).toBe('Saved — will retry');
  });
});

describe('queueNeedsClock', () => {
  it('ticks only while something is processing or lingering', () => {
    expect(queueNeedsClock(initialQueueState())).toBe(false);
    const sending = run([{ type: 'shutter', key: 'k1', uri: 'file:///a.jpg', at: 0 }]);
    expect(queueNeedsClock(sending)).toBe(false);
    const processing = queueReduce(sending, { type: 'dispatched', key: 'k1', runId: 'r1' });
    expect(queueNeedsClock(processing)).toBe(true);
    const done = queueReduce(processing, {
      type: 'run_ready',
      runId: 'r1',
      itemCount: 1,
      at: 0,
    });
    expect(queueNeedsClock(done)).toBe(true);
  });
});
