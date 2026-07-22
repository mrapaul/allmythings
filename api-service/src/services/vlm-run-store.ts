import crypto from 'node:crypto';
import { logger } from '../utils/logger';
import type { DetectedItem } from '../types/detected-item';
import type { Detector } from './vlm-detector';
import type { SceneInfo } from './vlm-detector.parse';

/**
 * In-memory store of asynchronous VLM detection runs.
 *
 * Free-tier detections take minutes; a phone cannot reliably hold one HTTP
 * stream open that long (screen lock / backgrounding kills it). The app
 * instead POSTs the photo, gets a runId immediately, and polls short status
 * requests. Results accumulate here — partial while running, full when done —
 * and survive client disconnects. Single-user scale: a Map with TTL pruning.
 */

export interface VlmRun {
  runId: string;
  photoSha256: string;
  status: 'running' | 'completed' | 'failed';
  scene: SceneInfo | null;
  items: DetectedItem[];
  error?: string;
  startedAt: number;
  completedAt?: number;
}

const DEFAULT_TTL_MS = 30 * 60_000;
const PRUNE_INTERVAL_MS = 60_000;

export class VlmRunStore {
  private readonly runs = new Map<string, VlmRun>();
  private lastPrune = 0;

  constructor(
    private readonly detector: Detector,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
  ) {}

  /** Register a run and start consuming the detector stream in the background. */
  start(imageBuffer: Buffer, photoSha256: string): VlmRun {
    this.prune();
    const run: VlmRun = {
      runId: crypto.randomBytes(16).toString('hex'),
      photoSha256,
      status: 'running',
      scene: null,
      items: [],
      startedAt: Date.now(),
    };
    this.runs.set(run.runId, run);

    void (async () => {
      try {
        for await (const ev of this.detector.detectStream(imageBuffer)) {
          if (ev.kind === 'scene') run.scene = ev.scene;
          else run.items = [...run.items, ev.item];
        }
        run.status = 'completed';
        run.completedAt = Date.now();
        logger.info(
          { runId: run.runId, items: run.items.length, ms: run.completedAt - run.startedAt },
          'vlm_async_run_completed',
        );
      } catch (err: unknown) {
        run.status = 'failed';
        run.error = err instanceof Error ? err.message : String(err);
        run.completedAt = Date.now();
        logger.warn({ runId: run.runId, err: run.error }, 'vlm_async_run_failed');
      }
    })();

    return run;
  }

  get(runId: string): VlmRun | null {
    this.prune();
    return this.runs.get(runId) ?? null;
  }

  private prune(): void {
    const now = Date.now();
    if (now - this.lastPrune < PRUNE_INTERVAL_MS) return;
    this.lastPrune = now;
    for (const [id, run] of this.runs) {
      if (now - run.startedAt > this.ttlMs) this.runs.delete(id);
    }
  }
}
