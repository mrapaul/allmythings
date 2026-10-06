import { getDetectStatus } from '@/api/detect-status';
import { RUN_LOST_ERROR_CODE, isRunNotFoundError } from '@/lib/jobs';
import { nextRetryDelayMs } from '@/lib/retry-backoff';
import { getJobsStore, initJobsStore, patchJob } from '@/stores/jobs.store';
import type { Prefs } from '@/stores/prefs';
import { AppState } from 'react-native';
import { runAutoRetries } from './auto-retry';
import {
  announceReadyScans,
  hapticReadyScans,
  markReadyScansAnnounced,
  noteReadyScansBackgrounded,
  pendingReadyScans,
  pruneReadyScansLedger,
} from './notifications';

/**
 * Central background poller for walk-mode jobs: hydrates the jobs store,
 * then polls RUNNING jobs sequentially (one status request at a time, only
 * while the app is active). Transient poll errors are retried on the next
 * tick — the server keeps the run either way.
 */

const POLL_INTERVAL_MS = 5_000;

interface JobPollingDeps {
  intervalMs?: number;
  getStatus?: typeof getDetectStatus;
}

/**
 * Freshly ready scans: while foregrounded the inbox updates right in front
 * of the user, so a banner would be noise — just a haptic. While
 * backgrounded (a background-fetch tick observed the transition) the runIds
 * are remembered and announced the next time the app foregrounds.
 */
function notifyReadyTransitions(prefs: Prefs, runIds: string[]): void {
  if (runIds.length === 0) return;
  const kv = prefs.getKvBackend();
  if (AppState.currentState === 'active') {
    hapticReadyScans();
    markReadyScansAnnounced(kv, runIds);
  } else {
    noteReadyScansBackgrounded(kv, runIds);
  }
}

/**
 * Foreground entry point for remembered transitions: one notification for
 * every pending runId that is still an unreviewed ready job, plus a haptic.
 * Best-effort — a failed announce stays pending for the next foreground.
 */
export async function announcePendingReadyScans(prefs: Prefs): Promise<void> {
  try {
    const kv = prefs.getKvBackend();
    const readyRunIds = getJobsStore()
      .getState()
      .jobs.filter((j) => j.status === 'ready' && !j.reviewed)
      .map((j) => j.runId);
    await announceReadyScans(kv, pendingReadyScans(kv, readyRunIds));
  } catch {
    // best-effort: never let an announcement break the foreground path
  }
}

/**
 * One pass over the job list: poll every running job, promote finished ones,
 * then run the auto-retry ladder. Shared by the foreground interval and the
 * background-fetch task (which enters via runBackgroundJobTick).
 */
async function tickJobs(prefs: Prefs, getStatus: typeof getDetectStatus): Promise<void> {
  const readyTransitions: string[] = [];
  const running = getJobsStore()
    .getState()
    .jobs.filter((j) => j.status === 'running');
  for (const job of running) {
    try {
      const status = await getStatus(job.runId);
      if (status.status === 'completed') {
        patchJob(job.runId, {
          status: 'ready',
          itemCount: status.result?.items.length ?? 0,
        });
        readyTransitions.push(job.runId);
      } else if (status.status !== 'running') {
        patchJob(job.runId, {
          status: 'failed',
          errorCode: status.errorCode ?? status.status,
        });
      }
    } catch (err) {
      if (isRunNotFoundError(err)) {
        // The server no longer knows this run (restart / result TTL).
        // Not terminal anymore: join the auto-retry ladder — the
        // scheduler re-dispatches the saved photo with backoff, so a
        // server restart self-heals instead of stranding the shot.
        const attempts = (job.attempts ?? 0) + 1;
        patchJob(job.runId, {
          status: 'failed',
          errorCode: RUN_LOST_ERROR_CODE,
          attempts,
          nextRetryAt: Date.now() + nextRetryDelayMs(attempts),
        });
      }
      // Anything else is a transient network failure — retry next tick.
    }
  }
  // Failed shots heal themselves: the ladder re-dispatches due jobs with
  // backoff while the app is foregrounded — no tap, no health flip.
  await runAutoRetries(prefs);
  notifyReadyTransitions(prefs, readyTransitions);
  pruneReadyScansLedger(
    prefs.getKvBackend(),
    getJobsStore()
      .getState()
      .jobs.map((j) => j.runId),
  );
}

/**
 * One best-effort tick for the background-fetch task: the same work as a
 * foreground tick, but not gated on AppState (the app is backgrounded by
 * definition, and that is exactly when ready transitions must be remembered
 * for the next foreground). Never throws.
 */
export async function runBackgroundJobTick(
  prefs: Prefs,
  deps: Pick<JobPollingDeps, 'getStatus'> = {},
): Promise<void> {
  try {
    initJobsStore(prefs);
    await tickJobs(prefs, deps.getStatus ?? getDetectStatus);
  } catch {
    // The next background window (or the foreground poller) retries.
  }
}

export function startJobPolling(prefs: Prefs, deps: JobPollingDeps = {}): () => void {
  initJobsStore(prefs);
  const getStatus = deps.getStatus ?? getDetectStatus;
  let stopped = false;
  let polling = false;

  const tick = async (): Promise<void> => {
    if (stopped || polling) return;
    if (AppState.currentState !== 'active') return;
    polling = true;
    try {
      await tickJobs(prefs, getStatus);
    } finally {
      polling = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, deps.intervalMs ?? POLL_INTERVAL_MS);
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void tick();
      void announcePendingReadyScans(prefs);
    }
  });
  void tick();

  return () => {
    stopped = true;
    clearInterval(timer);
    sub.remove();
  };
}
