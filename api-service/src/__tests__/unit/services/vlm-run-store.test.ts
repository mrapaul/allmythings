import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VlmRunStore } from '../../../services/vlm-run-store';
import { DetectGate } from '../../../utils/concurrency';
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
      const store = new VlmRunStore(slowDetector(gate), { ttlMs: 1000 });
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

describe('VlmRunStore persistence', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vlm-run-store-'));
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const runFile = (runId: string) => path.join(dataDir, 'runs', `${runId}.json`);

  it('round-trips a completed run across a simulated restart', async () => {
    // Arrange — complete a run in one store instance.
    const gate = makeGate();
    gate.release();
    const store = new VlmRunStore(slowDetector(gate), { dataDir });
    const run = store.start(Buffer.from('img'), 'a'.repeat(64));
    await tick();
    await tick();
    expect(store.get(run.runId)?.status).toBe('completed');
    await store.flushPersistence();
    expect(fs.existsSync(runFile(run.runId))).toBe(true);

    // Act — "restart": a brand-new store instance over the same directory.
    const reborn = new VlmRunStore(slowDetector(makeGate()), { dataDir });
    const restored = reborn.get(run.runId);

    // Assert — the completed run survived, items intact.
    expect(restored).not.toBeNull();
    expect(restored?.status).toBe('completed');
    expect(restored?.photoSha256).toBe('a'.repeat(64));
    expect(restored?.items.map((i) => i.label)).toEqual(['sofa', 'lamp']);
  });

  it('marks a run that was mid-flight during the restart as failed, not lost', async () => {
    // Arrange — a run persisted as 'running' whose process then died.
    const gate = makeGate(); // never released: the stream never finishes
    const store = new VlmRunStore(slowDetector(gate), { dataDir });
    const run = store.start(Buffer.from('img'), 'b'.repeat(64));
    await store.flushPersistence();

    // Act — restart.
    const reborn = new VlmRunStore(slowDetector(makeGate()), { dataDir });
    const restored = reborn.get(run.runId);

    // Assert — surfaced as failed (its stream is gone), never run_not_found.
    expect(restored?.status).toBe('failed');
    expect(restored?.error).toContain('restart');
  });

  it('TTL pruning also deletes the run file on disk', async () => {
    vi.useFakeTimers();
    try {
      // Arrange
      const gate = makeGate();
      gate.release();
      const store = new VlmRunStore(slowDetector(gate), { dataDir, ttlMs: 1000 });
      const run = store.start(Buffer.from('img'), 'c'.repeat(64));
      await vi.advanceTimersByTimeAsync(1);
      await store.flushPersistence();
      expect(fs.existsSync(runFile(run.runId))).toBe(true);

      // Act — cross the TTL and trigger a prune.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(store.get(run.runId)).toBeNull();
      await store.flushPersistence();

      // Assert
      expect(fs.existsSync(runFile(run.runId))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips expired and torn files at boot instead of crashing', async () => {
    // Arrange — one expired run, one torn file, one healthy completed run.
    const runsDir = path.join(dataDir, 'runs');
    fs.mkdirSync(runsDir, { recursive: true });
    const healthyId = 'f'.repeat(32);
    const expiredId = 'e'.repeat(32);
    const baseRun = {
      photoSha256: 'd'.repeat(64),
      status: 'completed',
      scene: null,
      items: [ITEM],
      mergeSuggestions: [],
      completedAt: Date.now(),
    };
    fs.writeFileSync(
      path.join(runsDir, `${healthyId}.json`),
      JSON.stringify({ ...baseRun, runId: healthyId, startedAt: Date.now() }),
    );
    fs.writeFileSync(
      path.join(runsDir, `${expiredId}.json`),
      JSON.stringify({ ...baseRun, runId: expiredId, startedAt: Date.now() - 60 * 60_000 }),
    );
    fs.writeFileSync(path.join(runsDir, 'torn.json'), '{"runId": "tr');

    // Act
    const store = new VlmRunStore(slowDetector(makeGate()), { dataDir });

    // Assert
    expect(store.get(healthyId)?.status).toBe('completed');
    expect(store.get(expiredId)).toBeNull();
    expect(fs.existsSync(path.join(runsDir, `${expiredId}.json`))).toBe(false);
    expect(fs.existsSync(path.join(runsDir, 'torn.json'))).toBe(false);
  });

  it('redispatching the identical photo returns the same run (idempotency)', async () => {
    let consumptions = 0;
    const detector: Detector = {
      async detect() {
        throw new Error('unused');
      },
      async *detectStream(): AsyncGenerator<DetectorEvent> {
        consumptions += 1;
        yield { kind: 'item', item: ITEM };
      },
    };
    const store = new VlmRunStore(detector);
    const sha = 'f'.repeat(64);
    const first = store.start(Buffer.from('img'), sha);
    const second = store.start(Buffer.from('img'), sha);

    expect(second.runId).toBe(first.runId);
    await tick();
    await tick();
    expect(consumptions).toBe(1);
    expect(store.get(first.runId)?.status).toBe('completed');
  });

  it('a failed run does not shadow a redispatch of the same photo', async () => {
    let shouldFail = true;
    const detector: Detector = {
      async detect() {
        throw new Error('unused');
      },
      // eslint-disable-next-line require-yield
      async *detectStream(): AsyncGenerator<DetectorEvent> {
        if (shouldFail) throw new Error('boom');
        yield { kind: 'item', item: ITEM };
      },
    };
    const store = new VlmRunStore(detector);
    const sha = 'e'.repeat(64);
    const first = store.start(Buffer.from('img'), sha);
    await tick();
    expect(store.get(first.runId)?.status).toBe('failed');

    shouldFail = false;
    const second = store.start(Buffer.from('img'), sha);
    expect(second.runId).not.toBe(first.runId);
    await tick();
    expect(store.get(second.runId)?.status).toBe('completed');
  });

  it('fails fast with server_busy when the gate queue is full', async () => {
    const hang = makeGate(); // never released: occupies the only slot
    const store = new VlmRunStore(slowDetector(hang), {
      gate: new DetectGate(1, 0),
    });
    const first = store.start(Buffer.from('img'), 'a'.repeat(64));
    await tick();
    const second = store.start(Buffer.from('img'), 'b'.repeat(64));
    await tick();
    expect(store.get(first.runId)?.status).toBe('running');
    expect(store.get(second.runId)?.status).toBe('failed');
    expect(store.get(second.runId)?.error).toContain('server_busy');
    hang.release();
  });

  it('queues async runs FIFO on the gate and runs them once slots free', async () => {
    const firstGate = makeGate();
    const store = new VlmRunStore(slowDetector(firstGate), {
      gate: new DetectGate(1, 1),
    });
    const first = store.start(Buffer.from('img'), 'a'.repeat(64));
    const second = store.start(Buffer.from('img'), 'b'.repeat(64));
    await tick();
    // Second is queued, not failed (queue cap 1 not exceeded).
    expect(store.get(second.runId)?.status).toBe('running');

    firstGate.release();
    await tick();
    await tick();
    expect(store.get(first.runId)?.status).toBe('completed');
    expect(store.get(second.runId)?.status).toBe('completed');
  });
});
