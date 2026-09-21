import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Incident regression: a server restart wipes in-memory runs, so polling a
 * persisted runId returns 404 {"error":"run_not_found"}. The manager must
 * NOT spin on that status — it transitions the job to failed/run_lost and
 * hands it to the auto-retry ladder (backoff re-dispatch of the saved
 * photo), instead of the endless status polling that once stuck the inbox.
 */

const dispatchShotMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/walk-capture', () => ({ dispatchShot: dispatchShotMock }));

const { Prefs } = await import('@/stores/prefs');
const { getJobsStore, initJobsStore, addJob } = await import('@/stores/jobs.store');
const { startJobPolling } = await import('./job-manager');

const flush = () => new Promise((r) => setTimeout(r, 0));

function runningJob(runId: string) {
  return {
    runId,
    photoUri: `file:///${runId}.jpg`,
    startedAt: Date.now(),
    roomSessionId: 'session-1',
    status: 'running' as const,
    itemCount: 0,
    errorCode: null,
    reviewed: false,
    advice: null,
  };
}

describe('job manager — lost runs', () => {
  // One prefs instance per test: jobs added pre-start persist through it, and
  // startJobPolling re-hydrates the store from the same source (exactly the
  // restart scenario: persisted job, fresh app session).
  let prefs: ReturnType<typeof Prefs.makeInMemory>;
  beforeEach(() => {
    prefs = Prefs.makeInMemory();
    initJobsStore(prefs);
  });

  it('transitions a job to failed/run_lost on a 404 run_not_found', async () => {
    addJob(runningJob('r-dead'));
    const getStatus = vi
      .fn()
      .mockRejectedValue({ status: 404, data: { error: 'run_not_found', workflowId: 'r-dead' } });

    const stop = startJobPolling(prefs, { getStatus, intervalMs: 5 });
    await flush();
    stop();

    const job = getJobsStore()
      .getState()
      .jobs.find((j) => j.runId === 'r-dead');
    expect(job).toMatchObject({ status: 'failed', errorCode: 'run_lost' });
    // Joined the ladder: backoff-gated, not polled again on later ticks.
    expect(job?.attempts).toBe(1);
    expect(job?.nextRetryAt).toBeGreaterThan(Date.now());
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it('auto-retries due failed jobs on the tick — no tap, no health flip', async () => {
    addJob({
      ...runningJob('local-1'),
      status: 'failed',
      errorCode: 'start_failed',
      attempts: 1,
      nextRetryAt: Date.now() - 1, // backoff already elapsed
    });
    dispatchShotMock.mockReset();
    dispatchShotMock.mockResolvedValue({ ok: false });

    const stop = startJobPolling(prefs, { getStatus: vi.fn(), intervalMs: 5 });
    await flush();
    stop();

    expect(dispatchShotMock).toHaveBeenCalledWith(
      prefs,
      'file:///local-1.jpg',
      { roomSessionId: 'session-1', attempts: 1 },
    );
    expect(
      getJobsStore()
        .getState()
        .jobs.some((j) => j.runId === 'local-1'),
    ).toBe(false);
  });

  it('keeps a job running through a transient network failure', async () => {
    addJob(runningJob('r-alive'));
    const getStatus = vi.fn().mockRejectedValue(new Error('socket hang up'));

    const stop = startJobPolling(prefs, { getStatus, intervalMs: 5 });
    await flush();
    stop();

    expect(
      getJobsStore()
        .getState()
        .jobs.find((j) => j.runId === 'r-alive')?.status,
    ).toBe('running');
  });

  it('still promotes completed runs to ready', async () => {
    addJob(runningJob('r-ok'));
    const getStatus = vi.fn().mockResolvedValue({
      status: 'completed',
      workflowId: 'r-ok',
      result: { items: [{}, {}] },
    });

    const stop = startJobPolling(prefs, { getStatus, intervalMs: 5 });
    await flush();
    stop();

    expect(
      getJobsStore()
        .getState()
        .jobs.find((j) => j.runId === 'r-ok'),
    ).toMatchObject({ status: 'ready', itemCount: 2 });
  });
});
