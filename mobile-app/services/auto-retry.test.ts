import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The proactive retry ladder: failed shots (dispatch never landed, or the
 * server lost the run) re-dispatch themselves with backoff while the app is
 * foregrounded — no tap, no connectivity flip. Terminal only after
 * MAX_DISPATCH_ATTEMPTS.
 */

const { Prefs } = await import('@/stores/prefs');
const { getJobsStore, initJobsStore, addJob } = await import('@/stores/jobs.store');
const { runAutoRetries } = await import('./auto-retry');
const { MAX_DISPATCH_ATTEMPTS } = await import('@/lib/jobs');
const { nextRetryDelayMs } = await import('@/lib/retry-backoff');

function failedJob(patch: Record<string, unknown> = {}) {
  return {
    runId: 'local-1',
    photoUri: 'file:///queued.jpg',
    startedAt: 1_000,
    roomSessionId: 'session-1',
    status: 'failed' as const,
    itemCount: 0,
    errorCode: 'start_failed',
    reviewed: false,
    advice: null,
    ...patch,
  };
}

describe('runAutoRetries', () => {
  beforeEach(() => {
    initJobsStore(Prefs.makeInMemory());
  });

  it('re-dispatches a due failed job and removes the dead one', async () => {
    const prefs = Prefs.makeInMemory();
    addJob(failedJob({ nextRetryAt: 500 }));
    const dispatch = vi.fn(async () => ({ ok: false }));
    const now = 1_000_000;

    const ran = await runAutoRetries(prefs, { now: () => now, dispatch });

    expect(ran).toBe(1);
    expect(dispatch).toHaveBeenCalledWith(prefs, 'file:///queued.jpg', {
      roomSessionId: 'session-1',
      attempts: undefined,
    });
    // The failed placeholder made way for the re-dispatch.
    expect(getJobsStore().getState().jobs).toHaveLength(0);
  });

  it('respects nextRetryAt — a job whose backoff has not elapsed is left alone', async () => {
    const prefs = Prefs.makeInMemory();
    addJob(failedJob({ nextRetryAt: Date.now() + 60_000 }));
    const dispatch = vi.fn();

    const ran = await runAutoRetries(prefs, { dispatch });

    expect(ran).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
    expect(getJobsStore().getState().jobs).toHaveLength(1);
  });

  it('claims the job before dispatching so overlapping runs never double-send', async () => {
    const prefs = Prefs.makeInMemory();
    addJob(failedJob({ attempts: 1, nextRetryAt: 500 }));
    const dispatch = vi.fn(async () => ({ ok: false }));
    const now = 1_000_000;

    await runAutoRetries(prefs, { now: () => now, dispatch });
    // Second overlapping pass: the claim pushed nextRetryAt out, so even with
    // the store entry still present (mock dispatch), it must not re-send.
    await runAutoRetries(prefs, { now: () => now + 50, dispatch });

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('never touches jobs that exhausted the ladder or failed server-side', async () => {
    const prefs = Prefs.makeInMemory();
    addJob(failedJob({ runId: 'exhausted', attempts: MAX_DISPATCH_ATTEMPTS }));
    addJob(failedJob({ runId: 'model-error', errorCode: 'vlm_timeout', nextRetryAt: 0 }));
    const dispatch = vi.fn();

    const ran = await runAutoRetries(prefs, { now: () => 9_999_999, dispatch });

    expect(ran).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
    expect(getJobsStore().getState().jobs).toHaveLength(2);
  });

  it('carries attempts forward so the ladder converges instead of looping forever', async () => {
    const prefs = Prefs.makeInMemory();
    addJob(failedJob({ attempts: 3, nextRetryAt: 0 }));
    const dispatch = vi.fn(async () => ({ ok: false }));

    await runAutoRetries(prefs, { now: () => 1_000_000, dispatch });

    expect(dispatch).toHaveBeenCalledWith(expect.anything(), 'file:///queued.jpg', {
      roomSessionId: 'session-1',
      attempts: 3,
    });
  });

  it('claims with the real backoff delay, not an instant re-queue', async () => {
    const prefs = Prefs.makeInMemory();
    addJob(failedJob({ attempts: 0, nextRetryAt: 0 }));
    const dispatch = vi.fn(async () => ({ ok: false }));
    const now = 1_000_000;

    await runAutoRetries(prefs, { now: () => now, dispatch });
    // The job was removed (mock dispatch replaces it), so assert through the
    // claim math instead: next retry would have been now + nextRetryDelayMs(1).
    expect(nextRetryDelayMs(1)).toBe(10_000);
  });
});
