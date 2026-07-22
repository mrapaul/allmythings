import { describe, it, expect, vi } from 'vitest';
import { VlmRunStore } from '../../../services/vlm-run-store';
import type { Detector, DetectorEvent } from '../../../services/vlm-detector';
import { DEFAULT_SCENE } from '../../../services/vlm-detector.parse';
import { DetectorUnavailableError } from '../../../clients/vlm-client';
import type { DetectedItem } from '../../../types/detected-item';

const ITEM: DetectedItem = {
  label: 'sofa',
  description: '',
  category: 'Furniture',
  tags: [],
  box: { x: 0, y: 0, width: 0.5, height: 0.5 },
};

function slowDetector(gate: { release: () => void; promise: Promise<void> }): Detector {
  return {
    async detect() {
      throw new Error('unused');
    },
    async *detectStream(): AsyncGenerator<DetectorEvent> {
      yield { kind: 'scene', scene: { ...DEFAULT_SCENE, type: 'room' } };
      yield { kind: 'item', item: ITEM };
      await gate.promise;
      yield { kind: 'item', item: { ...ITEM, label: 'lamp' } };
    },
  };
}

function makeGate() {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { release, promise };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('VlmRunStore', () => {
  it('exposes partial results while running and final results when done', async () => {
    const gate = makeGate();
    const store = new VlmRunStore(slowDetector(gate));
    const run = store.start(Buffer.from('img'), 'a'.repeat(64));

    expect(run.runId).toMatch(/^[0-9a-f]{32}$/);
    await tick();
    const partial = store.get(run.runId)!;
    expect(partial.status).toBe('running');
    expect(partial.scene?.type).toBe('room');
    expect(partial.items.map((i) => i.label)).toEqual(['sofa']);

    gate.release();
    await tick();
    const done = store.get(run.runId)!;
    expect(done.status).toBe('completed');
    expect(done.items.map((i) => i.label)).toEqual(['sofa', 'lamp']);
  });

  it('marks the run failed when the detector is unavailable', async () => {
    const detector: Detector = {
      async detect() {
        throw new Error('unused');
      },
      // eslint-disable-next-line require-yield
      async *detectStream(): AsyncGenerator<DetectorEvent> {
        throw new DetectorUnavailableError('down');
      },
    };
    const store = new VlmRunStore(detector);
    const run = store.start(Buffer.from('img'), 'b'.repeat(64));
    await tick();
    const failed = store.get(run.runId)!;
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('down');
  });

  it('prunes runs past their TTL', async () => {
    vi.useFakeTimers();
    try {
      const gate = makeGate();
      gate.release();
      const store = new VlmRunStore(slowDetector(gate), 1000);
      const run = store.start(Buffer.from('img'), 'c'.repeat(64));
      await vi.advanceTimersByTimeAsync(1);
      expect(store.get(run.runId)).not.toBeNull();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(store.get(run.runId)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null for unknown run ids', () => {
    const gate = makeGate();
    const store = new VlmRunStore(slowDetector(gate));
    expect(store.get('deadbeef')).toBeNull();
  });
});
