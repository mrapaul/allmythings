import { describe, expect, it } from 'vitest';
import {
  type DetectionJob,
  ROOM_SESSION_GAP_MS,
  autoRetryableJobs,
  inboxCount,
  isDetectionJob,
  isRunNotFoundError,
  nextRoomSessionId,
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
  it('selects only dispatch failures — server-side failures keep manual retry', () => {
    const retryable = job({ status: 'failed', errorCode: 'start_failed' });
    const lost = job({ status: 'failed', errorCode: 'run_lost' });
    const running = job({ status: 'running' });
    expect(autoRetryableJobs([retryable, lost, running])).toEqual([retryable]);
  });
});
