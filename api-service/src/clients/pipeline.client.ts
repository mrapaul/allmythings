/**
 * Fastify ↔ pipeline-service HTTP client.
 *
 * Section-02 of the structural rewrite. Wraps each public method's HTTP work
 * in the existing CircuitBreaker (utils/circuit-breaker.ts) so repeated 5xx
 * fail-fast instead of timing out per request.
 *
 * Design notes:
 *   - Long-poll first via GET /runs/:id/wait?timeout_s=N. timeout_s shrinks
 *     toward the deadline; never sent ≤ 0.
 *   - Falls back to short-poll (250ms initial, ×2 capped at 2s) if /wait
 *     returns 404 in the same waitForCompletion call.
 *   - Caps total HTTP RPS at maxRpsPerRun (default 5).
 *   - All state is per-call; client holds no run history beyond the breaker.
 */

import type {
  PipelineConfig,
  RunStatus,
  SceneObservation,
} from '../types/pipeline';
import type { CircuitBreaker } from '../utils/circuit-breaker';

// --- Errors ----------------------------------------------------------------

export class QueueFullError extends Error {
  override name = 'QueueFullError';
  retryAfterS: number;
  queueDepth: number;
  constructor(retryAfterS: number, queueDepth: number) {
    super(`pipeline-service queue full (depth=${queueDepth})`);
    this.retryAfterS = retryAfterS;
    this.queueDepth = queueDepth;
  }
}

export class RunNotFoundError extends Error {
  override name = 'RunNotFoundError';
  runId: string;
  constructor(runId: string) {
    super(`run not found: ${runId}`);
    this.runId = runId;
  }
}

export class PipelineUnavailableError extends Error {
  override name = 'PipelineUnavailableError';
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

// --- Public API shapes -----------------------------------------------------

export interface LaunchRunArgs {
  idempotencyKey: string; // sha256 of concatenated frame hashes
  photoPaths: string[];
  traceId: string;
  requestId: string;
  config?: Partial<PipelineConfig>;
}

export interface LaunchRunResult {
  runId: string;
  startedAt: string;
  idempotentHit: boolean;
  status?: 'running' | 'succeeded';
  result?: SceneObservation;
}

export interface PipelineClient {
  launchRun(args: LaunchRunArgs): Promise<LaunchRunResult>;
  getRun(runId: string): Promise<RunStatus>;
  waitForCompletion(runId: string, deadlineMs: number): Promise<RunStatus>;
}

// --- Factory ---------------------------------------------------------------

export interface CreatePipelineClientArgs {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  longPollTimeoutS?: number;
  maxRpsPerRun?: number;
  circuitBreaker: CircuitBreaker;
}

export function createPipelineClient(args: CreatePipelineClientArgs): PipelineClient {
  const baseUrl = args.baseUrl.replace(/\/$/, '');
  const fetchImpl = args.fetchImpl ?? globalThis.fetch;
  const longPollTimeoutS = args.longPollTimeoutS ?? 25;
  const maxRpsPerRun = args.maxRpsPerRun ?? 5;
  const breaker = args.circuitBreaker;

  function buildTraceparent(traceId: string): string {
    // 00-<traceId-32hex>-<spanId-16hex>-01
    const spanId = randHex(16);
    return `00-${traceId}-${spanId}-01`;
  }

  function randHex(n: number): string {
    let out = '';
    for (let i = 0; i < n; i += 1) {
      out += Math.floor(Math.random() * 16).toString(16);
    }
    return out;
  }

  async function fetchOrThrow(
    path: string,
    init: RequestInit,
    options: { traceId?: string } = {},
  ): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...((init.headers as Record<string, string>) ?? {}),
    };
    if (options.traceId) headers['traceparent'] = buildTraceparent(options.traceId);
    const url = `${baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, headers });
    } catch (cause) {
      throw new PipelineUnavailableError(`fetch failed: ${url}`, cause);
    }
    let body: unknown = undefined;
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    return { status: res.status, body };
  }

  async function callLaunch(args: LaunchRunArgs): Promise<LaunchRunResult> {
    const payload = {
      idempotency_key: args.idempotencyKey,
      photo_paths: args.photoPaths,
      trace_id: args.traceId,
      request_id: args.requestId,
      ...(args.config ? { config: args.config } : {}),
    };
    const { status, body } = await fetchOrThrow(
      '/runs',
      { method: 'POST', body: JSON.stringify(payload) },
      { traceId: args.traceId },
    );
    if (status === 503) {
      const b = body as { retry_after_s?: number; queue_depth?: number };
      throw new QueueFullError(b.retry_after_s ?? 1, b.queue_depth ?? 0);
    }
    if (status === 202 || status === 200) {
      const b = body as {
        run_id: string;
        started_at: string;
        idempotent_hit: boolean;
        status?: 'running' | 'succeeded';
        result?: SceneObservation;
      };
      return {
        runId: b.run_id,
        startedAt: b.started_at,
        idempotentHit: b.idempotent_hit,
        ...(b.status ? { status: b.status } : {}),
        ...(b.result ? { result: b.result } : {}),
      };
    }
    if (status >= 500) {
      throw new PipelineUnavailableError(
        `pipeline-service /runs returned ${status}`,
      );
    }
    throw new PipelineUnavailableError(
      `pipeline-service /runs unexpected status ${status}`,
    );
  }

  async function callGet(runId: string): Promise<RunStatus> {
    const { status, body } = await fetchOrThrow(
      `/runs/${encodeURIComponent(runId)}`,
      { method: 'GET' },
    );
    if (status === 404) throw new RunNotFoundError(runId);
    if (status >= 500) {
      throw new PipelineUnavailableError(
        `pipeline-service /runs/:id returned ${status}`,
      );
    }
    return wireToRunStatus(body);
  }

  async function callWait(
    runId: string,
    timeoutS: number,
  ): Promise<{ status: 'ok' | 'wait_unavailable' | '5xx'; data?: RunStatus }> {
    const { status, body } = await fetchOrThrow(
      `/runs/${encodeURIComponent(runId)}/wait?timeout_s=${timeoutS}`,
      { method: 'GET' },
    );
    if (status === 404) return { status: 'wait_unavailable' };
    if (status >= 500) return { status: '5xx' };
    return { status: 'ok', data: wireToRunStatus(body) };
  }

  function wireToRunStatus(body: unknown): RunStatus {
    const b = body as Record<string, unknown>;
    return {
      runId: String(b.run_id ?? ''),
      status: (b.status as RunStatus['status']) ?? 'running',
      startedAt: String(b.started_at ?? ''),
      ...(b.finished_at ? { finishedAt: String(b.finished_at) } : {}),
      ...(b.result ? { result: b.result as SceneObservation } : {}),
      ...(b.error_code ? { errorCode: String(b.error_code) } : {}),
      ...(b.error_message ? { errorMessage: String(b.error_message) } : {}),
    };
  }

  function isTerminal(s: RunStatus['status']): boolean {
    return s !== 'running';
  }

  // RPS limiter — sleeps until the next slot if we've used up the quota.
  function makeRpsLimiter(): () => Promise<void> {
    const window = 1_000;
    const calls: number[] = [];
    return async () => {
      const now = Date.now();
      while (calls.length && now - calls[0] >= window) calls.shift();
      if (calls.length >= maxRpsPerRun) {
        const wait = window - (now - calls[0]);
        await new Promise<void>((resolve) => setTimeout(resolve, Math.max(wait, 1)));
      }
      calls.push(Date.now());
    };
  }

  async function callWaitForCompletion(
    runId: string,
    deadlineMs: number,
  ): Promise<RunStatus> {
    const limiter = makeRpsLimiter();
    let lastStatus: RunStatus | undefined;
    let useShortPoll = false;
    let backoff = 250;

    // If deadline already past, do exactly one short status read so the
    // caller still gets a fresh snapshot.
    if (Date.now() >= deadlineMs) {
      await limiter();
      return callGet(runId);
    }

    while (Date.now() < deadlineMs) {
      const remainingS = Math.max(
        Math.floor((deadlineMs - Date.now()) / 1000),
        1,
      );
      await limiter();

      if (!useShortPoll) {
        const timeoutS = Math.min(remainingS, longPollTimeoutS);
        const probe = await callWait(runId, timeoutS);
        if (probe.status === 'wait_unavailable') {
          useShortPoll = true;
          continue;
        }
        if (probe.status === '5xx') {
          throw new PipelineUnavailableError(
            `pipeline-service /wait returned 5xx for ${runId}`,
          );
        }
        const data = probe.data!;
        lastStatus = data;
        if (isTerminal(data.status)) return data;
        // still running → loop, deadline check at top
        continue;
      }

      // short-poll fallback
      const got = await callGet(runId);
      lastStatus = got;
      if (isTerminal(got.status)) return got;
      const sleep = Math.min(backoff, 2_000);
      backoff = Math.min(backoff * 2, 2_000);
      const left = deadlineMs - Date.now();
      if (left <= 0) break;
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.min(sleep, Math.max(left, 1))),
      );
    }
    return lastStatus ?? (await callGet(runId));
  }

  /**
   * Run ``fn`` through the breaker, but DON'T let the breaker count expected
   * client-error responses (404 RunNotFound, 503 QueueFull) as faults — those
   * are well-defined sidecar replies, not service-level outages. We do that
   * by catching them inside the executor, returning them as a discriminated
   * union, and rethrowing outside the breaker's view.
   *
   * Genuine outages (5xx, network failures) bubble up untouched and DO trip
   * the breaker per its configured threshold.
   */
  type Result<T> =
    | { ok: true; value: T }
    | { ok: false; error: RunNotFoundError | QueueFullError };

  async function runThroughBreaker<T>(fn: () => Promise<T>): Promise<T> {
    let outcome: Result<T>;
    try {
      outcome = await breaker.execute(async () => {
        try {
          const value = await fn();
          return { ok: true, value } as Result<T>;
        } catch (inner) {
          if (inner instanceof RunNotFoundError || inner instanceof QueueFullError) {
            // Reclassify as success-from-the-breaker's-POV so onFailure isn't
            // called for these expected client-side responses.
            return { ok: false, error: inner } as Result<T>;
          }
          throw inner;
        }
      });
    } catch (e) {
      if (e instanceof PipelineUnavailableError) throw e;
      const message = (e as Error)?.message ?? String(e);
      // breaker.execute throws plain Error('Circuit breaker [...] is OPEN. ...')
      // when fast-failing.
      throw new PipelineUnavailableError(message, e);
    }
    if (outcome.ok) return outcome.value;
    throw outcome.error;
  }

  return {
    launchRun: (args) => runThroughBreaker(() => callLaunch(args)),
    getRun: (runId) => runThroughBreaker(() => callGet(runId)),
    waitForCompletion: (runId, deadlineMs) =>
      runThroughBreaker(() => callWaitForCompletion(runId, deadlineMs)),
  };
}
