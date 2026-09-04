import { stageTitle } from './detect-stages';

/**
 * The capture reel: every in-flight shot's journey made visible without
 * leaving the camera. Unlike the old single-slot tray (which narrated only
 * the latest shot and folded everything else into a badge), the reel keeps
 * one frame PER shot, each with its own live status:
 *
 * shutter → sending → processing (staged copy) → done ("✓ N items found",
 * brief) → pruned (the ready badge takes over). Failures land on
 * "Saved — will retry" — never silence.
 *
 * Pure state machine — the viewfinder renders what this returns.
 */

export type ShotPhase = 'sending' | 'processing' | 'done' | 'failed';

export interface QueueShot {
  /** Stable per-shot identity (assigned at shutter, survives dispatch). */
  key: string;
  uri: string;
  /** Run backing this shot (null before dispatch answers). */
  runId: string | null;
  phase: ShotPhase;
  /** Shutter time; drives the staged-progress copy. */
  startedAt: number;
  /** When the current phase began; drives done/failed linger pruning. */
  phaseAt: number;
  itemCount: number;
}

export type QueueEvent =
  | { type: 'shutter'; key: string; uri: string; at: number }
  | { type: 'dispatched'; key: string; runId: string }
  | { type: 'dispatch_failed'; key: string; at: number }
  | { type: 'run_ready'; runId: string; itemCount: number; at: number }
  | { type: 'run_failed'; runId: string; at: number }
  /** Sweep resolved frames whose linger has expired off the reel. */
  | { type: 'prune'; now: number };

/** How long a "✓ N items found" frame lingers before yielding to the badge. */
export const DONE_LINGER_MS = 2_500;
/** Failure copy stays longer — it carries an implication worth reading. */
export const FAILED_LINGER_MS = 5_000;
/** Reel frames rendered at once; older in-flight shots collapse to a +N chip. */
export const MAX_REEL_FRAMES = 4;

export function initialQueueState(): QueueShot[] {
  return [];
}

export function queueReduce(shots: QueueShot[], event: QueueEvent): QueueShot[] {
  switch (event.type) {
    case 'shutter':
      // Newest last: the reel grows upward from where the shot flies in.
      return [
        ...shots,
        {
          key: event.key,
          uri: event.uri,
          runId: null,
          phase: 'sending',
          startedAt: event.at,
          phaseAt: event.at,
          itemCount: 0,
        },
      ];
    case 'dispatched':
      return shots.map((s) =>
        s.key === event.key && s.phase === 'sending'
          ? { ...s, phase: 'processing', runId: event.runId }
          : s,
      );
    case 'dispatch_failed':
      return shots.map((s) =>
        s.key === event.key && s.phase === 'sending'
          ? { ...s, phase: 'failed', phaseAt: event.at }
          : s,
      );
    case 'run_ready':
      return shots.map((s) =>
        s.runId === event.runId && s.phase === 'processing'
          ? { ...s, phase: 'done', itemCount: event.itemCount, phaseAt: event.at }
          : s,
      );
    case 'run_failed':
      return shots.map((s) =>
        s.runId === event.runId && s.phase === 'processing'
          ? { ...s, phase: 'failed', phaseAt: event.at }
          : s,
      );
    case 'prune': {
      const keep = shots.filter((s) => {
        if (s.phase === 'done') return event.now - s.phaseAt < DONE_LINGER_MS;
        if (s.phase === 'failed') return event.now - s.phaseAt < FAILED_LINGER_MS;
        return true;
      });
      // Identity-stable when nothing expired, so React skips the re-render.
      return keep.length === shots.length ? shots : keep;
    }
    default:
      return shots;
  }
}

/**
 * One calm line per frame. Processing reuses the staged-progress vocabulary
 * so the camera, the home pill, and the review screen all narrate the same
 * way.
 */
export function shotStatusLine(shot: QueueShot, now: number): string {
  switch (shot.phase) {
    case 'sending':
      return 'Sending…';
    case 'processing':
      return stageTitle({
        elapsedMs: Math.max(0, now - shot.startedAt),
        itemCount: 0,
        expectedTotal: null,
      });
    case 'done':
      return `✓ ${shot.itemCount} item${shot.itemCount === 1 ? '' : 's'} found`;
    case 'failed':
      return 'Saved — will retry';
  }
}

/** Whether the reel needs a ticking clock (staged copy or pending prunes). */
export function queueNeedsClock(shots: QueueShot[]): boolean {
  return shots.some((s) => s.phase === 'processing' || s.phase === 'done' || s.phase === 'failed');
}
