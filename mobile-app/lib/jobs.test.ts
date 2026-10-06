import { describe, expect, it } from 'vitest';
import {
  type DetectionJob,
  MAX_DISPATCH_ATTEMPTS,
  ROOM_SESSION_GAP_MS,
  autoRetryableJobs,
  inboxCount,
  isDetectionJob,
  isRunNotFoundError,
  nextRoomSessionId,
  queueCount,
  queueJobs,
  queueProgress,
  sessionDisplayName,
} from './jobs';

const job = (patch: Partial<DetectionJob>): DetectionJob => ({
  runId: 'r1',
  photoUri: 'file:///a.jpg',
  startedAt: 0,
  roomSessionId: 'session-1',
  status: 'running',
  itemCount: 0,
  errorCode: null,
  reviewed: false,
  ...patch,
});

describe('nextRoomSessionId', () => {
  it('starts Session 1 with no prior jobs', () => {
    expect(nextRoomSessionId([], 1000)).toBe('session-1');
  });

  it('reuses the session when the previous shot is within 10 minutes', () => {
    const jobs = [job({ startedAt: 1_000_000, roomSessionId: 'session-2' })];
    expect(nextRoomSessionId(jobs, 1_000_000 + ROOM_SESSION_GAP_MS - 1)).toBe('session-2');
  });

  it('opens a new numbered session after the gap', () => {
    const jobs = [
      job({ startedAt: 0, roomSessionId: 'session-1' }),
      job({ startedAt: 1_000_000, roomSessionId: 'session-2' }),
    ];
    expect(nextRoomSessionId(jobs, 1_000_000 + ROOM_SESSION_GAP_MS + 1)).toBe('session-3');
  });
});

describe('sessionDisplayName', () => {
  it('formats the numbered session', () => {
    expect(sessionDisplayName('session-3')).toBe('Session 3');
  });
});

describe('isRunNotFoundError', () => {
  it('recognises the server body regardless of transport shape', () => {
    expect(isRunNotFoundError({ data: { error: 'run_not_found', workflowId: 'r1' } })).toBe(true);
  });

  it('recognises a bare 404 across ofetch error shapes', () => {
    expect(isRunNotFoundError({ status: 404 })).toBe(true);
    expect(isRunNotFoundError({ statusCode: 404 })).toBe(true);
    expect(isRunNotFoundError({ response: { status: 404 } })).toBe(true);
  });

  it('treats everything else as transient', () => {
    expect(isRunNotFoundError(new Error('network down'))).toBe(false);
    expect(isRunNotFoundError({ status: 500 })).toBe(false);
    expect(isRunNotFoundError({ data: { error: 'other' } })).toBe(false);
    expect(isRunNotFoundError(null)).toBe(false);
    expect(isRunNotFoundError('404')).toBe(false);
  });
});

describe('inboxCount / isDetectionJob', () => {
  it('counts ready-unreviewed and failed jobs only', () => {
    expect(
      inboxCount([
        job({ status: 'running' }),
        job({ status: 'ready' }),
        job({ status: 'ready', reviewed: true }),
        job({ status: 'failed' }),
      ]),
    ).toBe(2);
  });

  it('validates persisted job shapes', () => {
    expect(isDetectionJob(job({}))).toBe(true);
    expect(isDetectionJob({ runId: 'x' })).toBe(false);
  });
});

describe('autoRetryableJobs', () => {
  it('selects transient failures — model/validation failures keep manual retry', () => {
    const retryable = job({ status: 'failed', errorCode: 'start_failed' });
    const lost = job({ status: 'failed', errorCode: 'run_lost' });
    const modelError = job({ status: 'failed', errorCode: 'vlm_timeout', runId: 'r2' });
    const running = job({ status: 'running', runId: 'r3' });
    expect(autoRetryableJobs([retryable, lost, modelError, running])).toEqual([retryable, lost]);
  });

  it('drops a job from the ladder once it exhausted MAX_DISPATCH_ATTEMPTS', () => {
    const exhausted = job({
      status: 'failed',
      errorCode: 'start_failed',
      attempts: MAX_DISPATCH_ATTEMPTS,
    });
    const oneLeft = job({
      status: 'failed',
      errorCode: 'start_failed',
      attempts: MAX_DISPATCH_ATTEMPTS - 1,
      runId: 'r2',
    });
    expect(autoRetryableJobs([exhausted, oneLeft])).toEqual([oneLeft]);
  });
});

describe('queueJobs / queueCount', () => {
  it('selects running and failed jobs only — ready results stay inbox-only', () => {
    const running = job({ status: 'running' });
    const failed = job({ status: 'failed', runId: 'r2', errorCode: 'run_lost' });
    const ready = job({ status: 'ready', runId: 'r3', itemCount: 4 });
    const reviewed = job({ status: 'ready', reviewed: true, runId: 'r4', itemCount: 2 });
    expect(queueJobs([running, ready, failed, reviewed])).toEqual([running, failed]);
    expect(queueCount([running, ready, failed, reviewed])).toBe(2);
  });
});

describe('queueProgress', () => {
  it('is null until both the streamed count and the estimate exist', () => {
    expect(queueProgress(job({}))).toBeNull();
    expect(queueProgress(job({ progressItems: 2 }))).toBeNull();
    expect(queueProgress(job({ sceneEstimate: 8 }))).toBeNull();
    expect(queueProgress(job({ progressItems: 2, sceneEstimate: 0 }))).toBeNull();
  });

  it('computes the fraction of the estimate, clamped below done', () => {
    expect(queueProgress(job({ progressItems: 2, sceneEstimate: 8 }))).toBe(0.25);
    // 8/8 would read as finished — the ring must never get there pre-ready.
    expect(queueProgress(job({ progressItems: 8, sceneEstimate: 8 }))).toBe(0.95);
    expect(queueProgress(job({ progressItems: 12, sceneEstimate: 8 }))).toBe(0.95);
    expect(queueProgress(job({ progressItems: 0, sceneEstimate: 8 }))).toBe(0);
  });
});
