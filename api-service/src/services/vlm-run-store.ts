import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../utils/logger';
import type { DetectedItem } from '../types/detected-item';
import type { DetectOptions, Detector } from './vlm-detector';
import type { MergeSuggestion, SceneInfo } from './vlm-detector.parse';
import type { DetectGate } from '../utils/concurrency';

/**
 * Store of asynchronous VLM detection runs: in-memory Map for speed, mirrored
 * to disk for durability.
 *
 * Free-tier detections take minutes; a phone cannot reliably hold one HTTP
 * stream open that long (screen lock / backgrounding kills it). The app
 * instead POSTs the photo, gets a runId immediately, and polls short status
 * requests. Results accumulate here — partial while running, full when done —
 * and survive client disconnects.
 *
 * Durability (incident driver): a process restart used to wipe the Map, so a
 * COMPLETED run the user was reviewing answered `run_not_found` and their
 * inbox was stuck. Now every state transition (started/completed/failed)
 * writes one JSON file per run under `<dataDir>/runs/` — async and
 * fire-and-forget, failures logged never thrown — and the whole directory is
 * reloaded at boot. `run_not_found` only ever means genuinely expired.
 * A run persisted as 'running' whose producing process died is surfaced as
 * 'failed' after reload, because its detector stream is gone for good.
 */

export interface VlmRun {
  runId: string;
  photoSha256: string;
  status: 'running' | 'completed' | 'failed';
  scene: SceneInfo | null;
  items: DetectedItem[];
  /** Merge candidates for the app to confirm later; indices refer to `items`. */
  mergeSuggestions: MergeSuggestion[];
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export interface VlmRunStoreOptions {
  ttlMs?: number;
  /** Data root (same root the flywheel/photos use); null disables persistence. */
  dataDir?: string | null;
  /**
   * Admission gate shared with the sync detect path. Runs wait FIFO for a
   * detector slot; when the queue is full the run fails fast with a
   * server_busy error the app can retry, instead of piling unbounded GPU
   * work onto one Ollama instance.
   */
  gate?: DetectGate;
  /**
   * Fire-and-forget hook invoked once a run's stream completes successfully.
   * Used for the annotated-photo burn-in; must never throw (failures are
   * swallowed and logged — a side effect must not retro-fail a good run).
   */
  onCompleted?: (run: VlmRun, imageBuffer: Buffer) => void;
}

const DEFAULT_TTL_MS = 30 * 60_000;
const PRUNE_INTERVAL_MS = 60_000;
const RUN_ID_PATTERN = /^[0-9a-f]{32}$/;
const RUN_STATUSES = new Set(['running', 'completed', 'failed']);

/** Uniquifies temp filenames so overlapping writes of one run never collide. */
let tmpFileCounter = 0;

export class VlmRunStore {
  private readonly runs = new Map<string, VlmRun>();
  /** photoSha256 → runId, for idempotent redispatch (see start()). */
  private readonly byPhoto = new Map<string, string>();
  private readonly ttlMs: number;
  private readonly runsDir: string | null;
  private readonly gate: DetectGate | undefined;
  private readonly onCompleted: VlmRunStoreOptions['onCompleted'];
  private readonly pendingIo = new Set<Promise<void>>();
  /** Serializes writes/deletes so state transitions land on disk in order. */
  private ioChain: Promise<void> = Promise.resolve();
  private lastPrune = 0;

  constructor(
    private readonly detector: Detector,
    opts?: VlmRunStoreOptions,
  ) {
    this.ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
    this.runsDir = opts?.dataDir ? path.join(opts.dataDir, 'runs') : null;
    this.gate = opts?.gate;
    this.onCompleted = opts?.onCompleted;
    this.loadFromDisk();
  }

  /**
   * Register a run and start consuming the detector stream in the background.
   *
   * Idempotent: the mobile client retries dispatch after disconnects and
   * backgrounding, so the identical photo must map to the same run instead
   * of queuing a second multi-minute GPU pass. A failed run is the one case
   * where a redispatch is a genuinely new attempt.
   *
   * `opts` carries the per-request detect overrides (scout mode) into the
   * detector call, exactly like the sync and SSE routes pass them.
   */
  start(imageBuffer: Buffer, photoSha256: string, opts?: DetectOptions): VlmRun {
    this.prune();
    const existingId = this.byPhoto.get(photoSha256);
    if (existingId) {
      const existing = this.runs.get(existingId);
      if (existing && existing.status !== 'failed') return existing;
    }
    const run: VlmRun = {
      runId: crypto.randomBytes(16).toString('hex'),
      photoSha256,
      status: 'running',
      scene: null,
      items: [],
      mergeSuggestions: [],
      startedAt: Date.now(),
    };
    this.runs.set(run.runId, run);
    this.byPhoto.set(photoSha256, run.runId);
    this.persist(run);

    void (async () => {
      if (this.gate) {
        const admitted = await this.gate.acquire();
        if (!admitted) {
          run.status = 'failed';
          run.error = 'server_busy: detection queue is full, retry later';
          run.completedAt = Date.now();
          this.persist(run);
          logger.warn({ runId: run.runId }, 'vlm_async_run_rejected_queue_full');
          return;
        }
      }
      try {
        for await (const ev of this.detector.detectStream(imageBuffer, opts)) {
          if (ev.kind === 'scene') run.scene = ev.scene;
          else if (ev.kind === 'item') run.items = [...run.items, ev.item];
          else run.mergeSuggestions = [...run.mergeSuggestions, ev.suggestion];
        }
        run.status = 'completed';
        run.completedAt = Date.now();
        this.persist(run);
        logger.info(
          { runId: run.runId, items: run.items.length, ms: run.completedAt - run.startedAt },
          'vlm_async_run_completed',
        );
        this.notifyCompleted(run, imageBuffer);
      } catch (err: unknown) {
        run.status = 'failed';
        run.error = err instanceof Error ? err.message : String(err);
        run.completedAt = Date.now();
        this.persist(run);
        logger.warn({ runId: run.runId, err: run.error }, 'vlm_async_run_failed');
      } finally {
        this.gate?.release();
      }
    })();

    return run;
  }

  get(runId: string): VlmRun | null {
    this.prune();
    return this.runs.get(runId) ?? null;
  }

  /** Side effects after a successful run (photo annotation); never throws. */
  private notifyCompleted(run: VlmRun, imageBuffer: Buffer): void {
    if (!this.onCompleted) return;
    try {
      this.onCompleted(run, imageBuffer);
    } catch (err: unknown) {
      logger.warn(
        { runId: run.runId, err: err instanceof Error ? err.message : String(err) },
        'vlm_run_on_completed_failed',
      );
    }
  }

  /** Wait for all in-flight persistence writes/deletes (tests, drain on close). */
  async flushPersistence(): Promise<void> {
    while (this.pendingIo.size > 0) {
      await Promise.all([...this.pendingIo]);
    }
  }

  private prune(): void {
    const now = Date.now();
    if (now - this.lastPrune < PRUNE_INTERVAL_MS) return;
    this.lastPrune = now;
    for (const [id, run] of this.runs) {
      if (now - run.startedAt > this.ttlMs) {
        this.runs.delete(id);
        if (this.byPhoto.get(run.photoSha256) === id) this.byPhoto.delete(run.photoSha256);
        this.deleteFile(id);
      }
    }
  }

  /** Async, non-blocking, never throws — a failed write is logged and forgotten. */
  private persist(run: VlmRun): void {
    if (!this.runsDir) return;
    const dir = this.runsDir;
    // Snapshot NOW: the run object keeps mutating while the stream runs.
    const payload = JSON.stringify(run);
    const file = path.join(dir, `${run.runId}.json`);
    const tmp = `${file}.${process.pid}.${tmpFileCounter++}.tmp`;
    this.enqueueIo(run.runId, 'vlm_run_persist_failed', async () => {
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(tmp, payload, 'utf-8');
      // Atomic swap: a crash mid-write can never leave a torn run file.
      await fsp.rename(tmp, file);
    });
  }

  private deleteFile(runId: string): void {
    if (!this.runsDir) return;
    const file = path.join(this.runsDir, `${runId}.json`);
    this.enqueueIo(runId, 'vlm_run_file_delete_failed', () => fsp.rm(file, { force: true }));
  }

  /** FIFO disk IO: ordered, tracked for flushing, failures logged never thrown. */
  private enqueueIo(runId: string, failEvent: string, task: () => Promise<void>): void {
    const op = this.ioChain.then(task).catch((err: unknown) => {
      logger.warn(
        { runId, err: err instanceof Error ? err.message : String(err) },
        failEvent,
      );
    });
    this.ioChain = op;
    this.pendingIo.add(op);
    void op.finally(() => this.pendingIo.delete(op));
  }

  /** Synchronous boot-time reload; runs are small and TTL keeps the dir tiny. */
  private loadFromDisk(): void {
    if (!this.runsDir) return;
    try {
      fs.mkdirSync(this.runsDir, { recursive: true });
      const now = Date.now();
      let restored = 0;
      for (const name of fs.readdirSync(this.runsDir)) {
        const file = path.join(this.runsDir, name);
        if (name.endsWith('.tmp')) {
          // Leftover from a write interrupted by a crash.
          fs.rmSync(file, { force: true });
          continue;
        }
        if (!name.endsWith('.json')) continue;
        const run = readRunFile(file);
        if (!run || now - run.startedAt > this.ttlMs) {
          fs.rmSync(file, { force: true });
          continue;
        }
        if (run.status === 'running') {
          // The process that owned this stream died; the run can never finish.
          run.status = 'failed';
          run.error = 'interrupted by server restart';
          run.completedAt = run.completedAt ?? now;
          this.persist(run);
        }
        this.runs.set(run.runId, run);
        // Only non-failed runs can satisfy an idempotent redispatch; a failed
        // run must not shadow a fresh attempt at the same photo.
        if (run.status !== 'failed') this.byPhoto.set(run.photoSha256, run.runId);
        restored += 1;
      }
      if (restored > 0) {
        logger.info({ restored, dir: this.runsDir }, 'vlm_runs_restored_from_disk');
      }
    } catch (err: unknown) {
      // Persistence is best-effort; the store still works memory-only.
      logger.warn(
        { dir: this.runsDir, err: err instanceof Error ? err.message : String(err) },
        'vlm_run_store_load_failed',
      );
    }
  }
}

// ---------------------------------------------------------------------------

function readRunFile(file: string): VlmRun | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return isPersistedRun(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Never trust file content: a torn or foreign file is skipped, not crashed on. */
function isPersistedRun(value: unknown): value is VlmRun {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const run = value as Record<string, unknown>;
  return (
    typeof run.runId === 'string' &&
    RUN_ID_PATTERN.test(run.runId) &&
    typeof run.photoSha256 === 'string' &&
    typeof run.status === 'string' &&
    RUN_STATUSES.has(run.status) &&
    typeof run.startedAt === 'number' &&
    Array.isArray(run.items) &&
    Array.isArray(run.mergeSuggestions)
  );
}
