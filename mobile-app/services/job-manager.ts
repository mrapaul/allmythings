import { getDetectStatus } from '@/api/detect-status';
import { RUN_LOST_ERROR_CODE, isRunNotFoundError } from '@/lib/jobs';
import { nextRetryDelayMs } from '@/lib/retry-backoff';
import { getJobsStore, initJobsStore, patchJob } from '@/stores/jobs.store';
import type { Prefs } from '@/stores/prefs';
import { AppState } from 'react-native';
import { runAutoRetries } from './auto-retry';

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
      const running = getJobsStore()
        .getState()
        .jobs.filter((j) => j.status === 'running');
      for (const job of running) {
        if (stopped) break;
        try {
          const status = await getStatus(job.runId);
          if (status.status === 'completed') {
            patchJob(job.runId, {
              status: 'ready',
              itemCount: status.result?.items.length ?? 0,
            });
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
    } finally {
      polling = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, deps.intervalMs ?? POLL_INTERVAL_MS);
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void tick();
  });
  void tick();

  return () => {
    stopped = true;
    clearInterval(timer);
    sub.remove();
  };
}
