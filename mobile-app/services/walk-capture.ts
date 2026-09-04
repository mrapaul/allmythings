import { startDetection } from '@/api/detect';
import { precheckFrame } from '@/api/precheck';
import type { PrecheckResult } from '@/api/types';
import type { QualityReport } from '@/lib/image-quality';
import { nextRoomSessionId } from '@/lib/jobs';
import { removePendingCapture, upsertPendingCapture } from '@/lib/pending-captures';
import { addJob, getJobsStore, patchJob } from '@/stores/jobs.store';
import type { Prefs } from '@/stores/prefs';
import { prepareJpeg } from './image-prep';
import { inspectCaptureQuality } from './image-quality';

/**
 * Walk mode: dispatch a shot for background detection and return to camera
 * immediately.
 *
 * Timing contract — capture NEVER waits on the network:
 *  1. the on-device quality check (pure pixel math, no round-trip) gates the
 *     shutter, so bad frames are caught instantly;
 *  2. detection is dispatched right away;
 *  3. the server precheck (~15s) runs DETACHED, and its semantic verdict is
 *     attached to the already-queued job instead of blocking the walk.
 */

const UPLOAD_WIDTH = 1280;
const PRECHECK_WIDTH = 512;

/**
 * Hard ceiling on the whole dispatch (prepare + upload). Belt to the API
 * client's own 30s braces: whatever goes wrong below — hung TCP connect to
 * a stale IP, a stalled upload body — the shot MUST resolve into the
 * visible failure path (pending capture + failed inbox card) instead of
 * awaiting forever. The silent-shutter incident was exactly this wait.
 */
export const DISPATCH_TIMEOUT_MS = 45_000;

class DispatchTimeoutError extends Error {
  constructor() {
    super(`dispatch timed out after ${DISPATCH_TIMEOUT_MS}ms`);
  }
}

function withDispatchTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DispatchTimeoutError()), DISPATCH_TIMEOUT_MS);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export interface DispatchResult {
  ok: boolean;
  runId?: string;
}

export interface DispatchOptions {
  /**
   * Keep the shot in an existing room session — used when re-dispatching a
   * lost/failed job so the retry stays grouped with its original walk.
   */
  roomSessionId?: string;
}

/**
 * Instant on-device photometric check. Returns null for "no opinion" (frame
 * could not be sampled or decoded), which callers treat as a pass.
 */
export async function checkShotQuality(photoUri: string): Promise<QualityReport | null> {
  return inspectCaptureQuality(photoUri);
}

export async function dispatchShot(
  prefs: Prefs,
  photoUri: string,
  options: DispatchOptions = {},
): Promise<DispatchResult> {
  const now = Date.now();
  const sessionId = options.roomSessionId ?? nextRoomSessionId(getJobsStore().getState().jobs, now);
  try {
    const handle = await withDispatchTimeout(
      (async () => {
        const prepared = await prepareJpeg(photoUri, UPLOAD_WIDTH);
        return startDetection({
          fileUri: prepared.uri,
          fileName: 'frame.jpg',
          mimeType: 'image/jpeg',
        });
      })(),
    );
    prefs.setPendingCaptures(removePendingCapture(prefs.getPendingCaptures(), photoUri));
    addJob({
      runId: handle.runId,
      photoUri,
      startedAt: now,
      roomSessionId: sessionId,
      status: 'running',
      itemCount: 0,
      errorCode: null,
      reviewed: false,
      advice: null,
    });
    // Detached on purpose: the semantic verdict lands on the job when it
    // arrives, seconds after the user has already moved on.
    void attachSemanticVerdict(handle.runId, photoUri);
    return { ok: true, runId: handle.runId };
  } catch {
    // Never lose a capture: queue the photo AND surface a failed job in the
    // inbox — retry re-dispatches from there.
    prefs.setPendingCaptures(upsertPendingCapture(prefs.getPendingCaptures(), photoUri));
    addJob({
      runId: `local-${now}`,
      photoUri,
      startedAt: now,
      roomSessionId: sessionId,
      status: 'failed',
      itemCount: 0,
      errorCode: 'start_failed',
      reviewed: false,
      advice: null,
    });
    return { ok: false };
  }
}

/**
 * Runs the slow server precheck out of band and records its advice on the
 * job. Never awaited by dispatchShot — a ~15s round-trip must not sit
 * between the shutter and the next shot.
 */
async function attachSemanticVerdict(runId: string, photoUri: string): Promise<void> {
  const result = await precheckShot(photoUri);
  if (!result) return;
  const advice = result.advice?.trim() ? result.advice.trim() : null;
  // Nothing worth saying: processable and no advice.
  if (!advice && result.processable) return;
  patchJob(runId, { advice, unprocessable: !result.processable });
}

/**
 * Capture precheck on a small preview frame. FAIL-OPEN: any error returns
 * null and the shot proceeds as if the server had no opinion.
 */
export async function precheckShot(photoUri: string): Promise<PrecheckResult | null> {
  try {
    const preview = await prepareJpeg(photoUri, PRECHECK_WIDTH);
    return await precheckFrame({ fileUri: preview.uri });
  } catch {
    return null;
  }
}
