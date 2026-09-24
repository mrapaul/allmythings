import { isAutoRetryable } from '@/lib/jobs';
import { nextRetryDelayMs } from '@/lib/retry-backoff';
import { getJobsStore, patchJob, removeJob } from '@/stores/jobs.store';
import type { Prefs } from '@/stores/prefs';
import { dispatchShot } from './walk-capture';

/**
 * Proactive retry ladder for failed captures. Runs on the job-manager tick,
 * so retries happen whenever the app is foregrounded — no health-transition
 * gate, no tap required. Rules:
 *
 *  - only transient-looking failures (start_failed, run_lost) are re-run;
 *    model/validation failures stay manual — re-running them blind burns GPU
 *  - exponential backoff between attempts, persisted on the job itself so an
 *    app restart does not reset the ladder
 *  - a job is claimed (nextRetryAt pushed out) BEFORE dispatch so two
 *    overlapping ticks can never double-dispatch the same shot
 *  - after MAX_DISPATCH_ATTEMPTS the job drops out of the ladder and stays
 *    failed; the tile keeps its one-tap retry, which resets the ladder
 */

/** Injectable deps so tests can use a fake clock / dispatcher. */
export interface AutoRetryDeps {
  now?: () => number;
  dispatch?: typeof dispatchShot;
}

export async function runAutoRetries(prefs: Prefs, deps: AutoRetryDeps = {}): Promise<number> {
  const now = (deps.now ?? Date.now)();
  const dispatch = deps.dispatch ?? dispatchShot;
  const due = getJobsStore()
    .getState()
    .jobs.filter((j) => isAutoRetryable(j) && now >= (j.nextRetryAt ?? 0));
  for (const job of due) {
    // Claim first: dispatchShot is async and ticks can overlap.
    patchJob(job.runId, { nextRetryAt: now + nextRetryDelayMs((job.attempts ?? 0) + 1) });
    if (
      !getJobsStore()
        .getState()
        .jobs.some((j) => j.runId === job.runId)
    )
      continue;
    removeJob(job.runId);
    void dispatch(prefs, job.photoUri, {
      roomSessionId: job.roomSessionId,
      attempts: job.attempts,
    });
  }
  return due.length;
}
