import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The load-bearing timing guarantee of walk mode: dispatch must NOT be gated
 * on the server precheck (~15s measured). These tests hold a precheck promise
 * open and assert the detection request still goes out and the job is queued.
 */

const startDetectionMock = vi.hoisted(() => vi.fn());
const precheckFrameMock = vi.hoisted(() => vi.fn());
const prepareJpegMock = vi.hoisted(() => vi.fn());
const inspectQualityMock = vi.hoisted(() => vi.fn());

vi.mock('@/api/detect', () => ({ startDetection: startDetectionMock }));
vi.mock('@/api/precheck', () => ({ precheckFrame: precheckFrameMock }));
vi.mock('./image-prep', () => ({ prepareJpeg: prepareJpegMock }));
vi.mock('./image-quality', () => ({ inspectCaptureQuality: inspectQualityMock }));

const { checkShotQuality, dispatchShot } = await import('./walk-capture');
const { Prefs } = await import('@/stores/prefs');
const { getJobsStore, initJobsStore } = await import('@/stores/jobs.store');

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  startDetectionMock.mockReset();
  precheckFrameMock.mockReset();
  prepareJpegMock.mockReset();
  inspectQualityMock.mockReset();
  prepareJpegMock.mockResolvedValue({ uri: 'file:///small.jpg', width: 1280, height: 960 });
  startDetectionMock.mockResolvedValue({
    runId: 'r-1',
    photoSha256: 'ab',
    statusUrl: '/v1/detect/status/r-1',
  });
  initJobsStore(Prefs.makeInMemory());
});

describe('dispatchShot', () => {
  it('does not wait on the precheck promise before dispatching', async () => {
    // A precheck that never settles stands in for the 15s round-trip.
    let settlePrecheck: ((v: unknown) => void) | null = null;
    precheckFrameMock.mockReturnValue(
      new Promise((resolve) => {
        settlePrecheck = resolve;
      }),
    );

    const result = await dispatchShot(Prefs.makeInMemory(), 'file:///shot.jpg');

    // Dispatch completed and the job is queued while precheck is still open.
    expect(result).toEqual({ ok: true, runId: 'r-1' });
    expect(startDetectionMock).toHaveBeenCalledTimes(1);
    const job = getJobsStore().getState().jobs[0];
    expect(job).toMatchObject({ runId: 'r-1', status: 'running', advice: null });
    expect(settlePrecheck).not.toBeNull();
  });

  it('attaches the semantic verdict to the job once it eventually arrives', async () => {
    precheckFrameMock.mockResolvedValue({
      scene: 'person_focus',
      quality: 'ok',
      objectDensity: 'none',
      peoplePresent: true,
      processable: false,
      advice: 'Looks like a portrait — point it at your things instead.',
    });

    await dispatchShot(Prefs.makeInMemory(), 'file:///shot.jpg');
    // Job is queued immediately, with no advice yet.
    expect(getJobsStore().getState().jobs[0]?.advice).toBeNull();

    await flush();

    expect(getJobsStore().getState().jobs[0]).toMatchObject({
      advice: 'Looks like a portrait — point it at your things instead.',
      unprocessable: true,
    });
  });

  it('leaves the job untouched when the precheck fails or has nothing to say', async () => {
    precheckFrameMock.mockRejectedValue(new Error('404'));
    await dispatchShot(Prefs.makeInMemory(), 'file:///shot.jpg');
    await flush();
    expect(getJobsStore().getState().jobs[0]).toMatchObject({ advice: null });
    expect(getJobsStore().getState().jobs[0]?.unprocessable).toBeUndefined();
  });

  it('INCIDENT: a hung upload times out into the visible failure path, never silence', async () => {
    vi.useFakeTimers();
    try {
      // A request against an unreachable-but-not-refusing host: never settles.
      startDetectionMock.mockReturnValue(new Promise(() => {}));
      const prefs = Prefs.makeInMemory();

      const dispatch = dispatchShot(prefs, 'file:///shot.jpg');
      await vi.advanceTimersByTimeAsync(45_000 + 1);
      const result = await dispatch;

      // Bounded, resolved, and VISIBLE: failed inbox card + queued capture.
      expect(result.ok).toBe(false);
      expect(getJobsStore().getState().jobs[0]).toMatchObject({
        status: 'failed',
        errorCode: 'start_failed',
      });
      expect(prefs.getPendingCaptures()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('queues a failed job (not a lost capture) when the upload cannot start', async () => {
    startDetectionMock.mockRejectedValue(new Error('offline'));
    const prefs = Prefs.makeInMemory();

    const result = await dispatchShot(prefs, 'file:///shot.jpg');

    expect(result.ok).toBe(false);
    expect(getJobsStore().getState().jobs[0]).toMatchObject({ status: 'failed' });
    expect(prefs.getPendingCaptures()).toHaveLength(1);
  });

  it('failure joins the auto-retry ladder: attempt counted, next try delayed, reason recorded', async () => {
    startDetectionMock.mockRejectedValue(new Error('network request failed'));
    const prefs = Prefs.makeInMemory();
    const before = Date.now();

    await dispatchShot(prefs, 'file:///shot.jpg', { attempts: 2 });
    const job = getJobsStore().getState().jobs[0];

    expect(job).toMatchObject({
      status: 'failed',
      errorCode: 'start_failed',
      attempts: 3,
    });
    // Backoff before the next retry is legal, roughly nextRetryDelayMs(3)=40s.
    expect(job?.nextRetryAt).toBeGreaterThan(before + 30_000);
    expect(job?.nextRetryAt).toBeLessThan(before + 60_000);
    // Self-diagnosing: the failure card can show WHY without a console.
    expect(job?.lastError).toContain('network request failed');
  });

  it('carries the attempt count across re-dispatches so the ladder converges', async () => {
    startDetectionMock.mockRejectedValue(new Error('still offline'));
    const prefs = Prefs.makeInMemory();

    await dispatchShot(prefs, 'file:///shot.jpg', { attempts: 7 });
    const job = getJobsStore().getState().jobs[0];
    expect(job?.attempts).toBe(8);
    // 8th attempt = ladder ceiling: autoRetryableJobs must leave it alone.
    const { autoRetryableJobs } = await import('@/lib/jobs');
    expect(autoRetryableJobs(getJobsStore().getState().jobs)).toHaveLength(0);
  });
});

describe('checkShotQuality', () => {
  it('passes the on-device report through', async () => {
    inspectQualityMock.mockResolvedValue({ verdict: 'too_dark', advice: 'Too dark — …' });
    await expect(checkShotQuality('file:///a.jpg')).resolves.toMatchObject({
      verdict: 'too_dark',
    });
    // No network involved in the shutter path.
    expect(precheckFrameMock).not.toHaveBeenCalled();
    expect(startDetectionMock).not.toHaveBeenCalled();
  });
});
