/**
 * Walk-mode detection jobs: capture is decoupled from review. Each dispatched
 * shot becomes a job polled centrally (services/job-manager.ts); completed
 * jobs wait in the review inbox. Shots taken within 10 minutes of the
 * previous one share a room session.
 */

export const ROOM_SESSION_GAP_MS = 10 * 60 * 1000;

export type DetectionJobStatus = 'running' | 'ready' | 'failed';

export interface DetectionJob {
  runId: string;
  photoUri: string;
  startedAt: number;
  roomSessionId: string;
  status: DetectionJobStatus;
  itemCount: number;
  errorCode: string | null;
  reviewed: boolean;
  /**
   * Semantic advice from the server precheck, which arrives AFTER the job is
   * already dispatched. Surfaced on the inbox card instead of interrupting a
   * walk in progress.
   */
  advice?: string | null;
  /** True when the server judged the frame not worth processing. */
  unprocessable?: boolean;
  /** Dispatches attempted so far (auto-retry ladder). Undefined = first try. */
  attempts?: number;
  /** Earliest time the auto-retry scheduler may re-dispatch this job. */
  nextRetryAt?: number;
  /** Last dispatch failure detail, for diagnosis on the retry screen. */
  lastError?: string | null;
}

/**
 * Auto-retry ceiling: the scheduler re-dispatches a failed job at most this
 * many times (with growing backoff) before giving up and leaving it failed
 * for the one-tap manual retry. Chosen so the ladder runs ~4–5 minutes.
 */
export const MAX_DISPATCH_ATTEMPTS = 8;

/** Failure modes that are safe to re-run without user confirmation. */
const AUTO_RETRYABLE_ERROR_CODES = new Set(['start_failed', 'run_lost']);

/** Error code for a run the server no longer knows (restart / result TTL). */
export const RUN_LOST_ERROR_CODE = 'run_lost';

/** Calm copy for a lost run — the photo is safe, one tap re-runs it. */
export const RUN_LOST_MESSAGE = 'The server lost track of this one — tap to run it again';

/**
 * True when a status fetch failed because the run no longer exists
 * server-side: HTTP 404 with body {"error":"run_not_found"}. The server
 * keeps results in memory today (being made durable in parallel), so a
 * restart or TTL expiry makes any persisted runId permanently dead —
 * a terminal condition, never a retryable network blip.
 */
export function isRunNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    status?: unknown;
    statusCode?: unknown;
    data?: { error?: unknown } | null;
    response?: { status?: unknown } | null;
  };
  if (e.data && typeof e.data === 'object' && e.data.error === 'run_not_found') return true;
  const status = e.status ?? e.statusCode ?? e.response?.status;
  return status === 404;
}

export function isDetectionJob(value: unknown): value is DetectionJob {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.runId === 'string' &&
    typeof v.photoUri === 'string' &&
    typeof v.startedAt === 'number' &&
    typeof v.roomSessionId === 'string' &&
    (v.status === 'running' || v.status === 'ready' || v.status === 'failed')
  );
}

/**
 * Session for a new shot: reuse the most recent job's session when it
 * started within the gap window, else open "session-<n+1>".
 */
export function nextRoomSessionId(
  jobs: ReadonlyArray<Pick<DetectionJob, 'startedAt' | 'roomSessionId'>>,
  now: number = Date.now(),
): string {
  let latest: Pick<DetectionJob, 'startedAt' | 'roomSessionId'> | null = null;
  const sessions = new Set<string>();
  for (const job of jobs) {
    sessions.add(job.roomSessionId);
    if (!latest || job.startedAt > latest.startedAt) latest = job;
  }
  if (latest && now - latest.startedAt < ROOM_SESSION_GAP_MS) return latest.roomSessionId;
  return `session-${sessions.size + 1}`;
}

/** "session-3" → "Session 3". */
export function sessionDisplayName(sessionId: string): string {
  const n = sessionId.match(/(\d+)$/)?.[1];
  return n ? `Session ${n}` : 'Session';
}

/** Jobs the inbox surfaces: reviewable results plus failures needing action. */
export function inboxJobs(jobs: DetectionJob[]): DetectionJob[] {
  return jobs.filter((j) => (j.status === 'ready' && !j.reviewed) || j.status === 'failed');
}

/**
 * Jobs that become first-class tiles on the home grid: still in flight
 * ('running') plus failures awaiting action. Review-ready results stay
 * inbox-only — their card is the review entry point.
 */
export function queueJobs(jobs: DetectionJob[]): DetectionJob[] {
  return jobs.filter((j) => j.status === 'running' || j.status === 'failed');
}

export function queueCount(jobs: DetectionJob[]): number {
  return queueJobs(jobs).length;
}

export function inboxCount(jobs: DetectionJob[]): number {
  return inboxJobs(jobs).length;
}

/**
 * True when a failed job is safe for the scheduler to re-dispatch on its own:
 * a transient-looking failure (dispatch never reached the server, or the
 * server lost the run) that has not exhausted the retry ladder yet. Model /
 * validation failures stay manual — re-running those without a fix just burns
 * GPU.
 */
export function isAutoRetryable(job: DetectionJob): boolean {
  return (
    job.status === 'failed' &&
    job.errorCode != null &&
    AUTO_RETRYABLE_ERROR_CODES.has(job.errorCode) &&
    (job.attempts ?? 0) < MAX_DISPATCH_ATTEMPTS
  );
}

/**
 * Shots whose dispatch never reached the server ('start_failed'), or whose
 * run the server lost ('run_lost'), are safe to retry silently the moment
 * connectivity returns — for a start failure nothing server-side exists yet,
 * and a lost run is by definition gone. Both are backed by the scheduler's
 * backoff ladder; jobs that exhausted it drop out and keep the explicit
 * inbox retry so the user sees WHY a run kept dying.
 */
export function autoRetryableJobs(jobs: DetectionJob[]): DetectionJob[] {
  return jobs.filter(isAutoRetryable);
}
