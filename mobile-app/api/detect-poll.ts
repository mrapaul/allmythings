import { getDetectStatus } from './detect-status';
import type { DetectStreamEvent } from './types';

/**
 * Poll an async detection run and surface progress as the same event stream
 * the review screen already consumes.
 *
 * Detection takes minutes on the free tier; a held-open HTTP stream dies the
 * moment iOS locks the screen or backgrounds the app. Short status polls are
 * resilient: results live server-side, so a dropped poll just retries, and a
 * relaunched app resumes the same runId.
 */

const DEFAULT_INTERVAL_MS = 4_000;
const MAX_CONSECUTIVE_FAILURES = 5;

export interface PollOptions {
  intervalMs?: number;
  signal?: AbortSignal;
}

export async function* pollDetectionEvents(
  runId: string,
  opts: PollOptions = {},
): AsyncGenerator<DetectStreamEvent, void, unknown> {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  let metaEmitted = false;
  let sceneEmitted = false;
  let itemsSent = 0;
  let failures = 0;

  while (!opts.signal?.aborted) {
    let status: Awaited<ReturnType<typeof getDetectStatus>>;
    try {
      status = await getDetectStatus(runId);
      failures = 0;
    } catch (err) {
      failures += 1;
      const terminal =
        (err as { data?: { status?: string } }).data?.status === 'failed' ||
        failures >= MAX_CONSECUTIVE_FAILURES;
      if (terminal) {
        yield {
          type: 'error',
          code: 'detect_run_failed',
          runId,
          message: err instanceof Error ? err.message : String(err),
        };
        return;
      }
      await sleep(intervalMs, opts.signal);
      continue;
    }
    if (opts.signal?.aborted) return;

    if (!metaEmitted) {
      metaEmitted = true;
      yield {
        type: 'meta',
        runId,
        traceId: '',
        ...(status.photoSha256 ? { photoSha256: status.photoSha256 } : {}),
      };
    }
    if (!sceneEmitted && status.scene) {
      sceneEmitted = true;
      yield { type: 'scene', scene: status.scene };
    }
    const items = status.result?.items ?? [];
    while (itemsSent < items.length) {
      const item = items[itemsSent];
      itemsSent += 1;
      if (item) yield { type: 'item', item };
    }

    if (status.status === 'completed') {
      yield { type: 'done', runId, totalItems: itemsSent };
      return;
    }
    if (status.status !== 'running') {
      yield {
        type: 'error',
        code: status.errorCode ?? 'detect_run_failed',
        runId,
        ...(status.errorMessage ? { message: status.errorMessage } : {}),
      };
      return;
    }
    await sleep(intervalMs, opts.signal);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
