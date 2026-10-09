import { resolveApiBaseUrl, resolveApiKey } from './base-url';
import { makeTraceparent } from './client';
import { createSseParser } from './sse';
import type { DetectStreamEvent } from './types';
import { appendDetectVocab, resolveDetectVocab } from './vocab';

/**
 * Fast single-pass detect over a held-open SSE stream (mode=scout), consumed
 * WHILE the user is still framing. Progressive by design: item bursts render
 * as they land, never after the stream ends.
 *
 * Transport is XMLHttpRequest rather than fetch: RN's fetch implementation
 * buffers the whole body (no streaming reader), while XHR exposes
 * incremental responseText through onprogress. A plain 4xx before the SSE
 * headers flush (validation, unavailable detector) rejects the promise; once
 * the stream is open the only error channel is the terminal SSE `error`
 * event, which the caller folds into its reducer like any other event.
 */

export const SCOUT_STREAM_TIMEOUT_MS = 30_000;

export interface ScoutStreamInput {
  fileUri: string;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface ScoutStreamHandlers {
  onEvent: (event: DetectStreamEvent) => void;
}

/** Maps one SSE wire message onto the app's shared detection event type. */
export function decodeScoutEvent(message: {
  event: string | null;
  data: string;
}): DetectStreamEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(message.data);
  } catch {
    return null; // partial/corrupt payload — the stream moves on
  }
  const payload = (data ?? {}) as Record<string, unknown>;
  switch (message.event) {
    case 'meta':
      return {
        type: 'meta',
        runId: String(payload.runId ?? ''),
        traceId: String(payload.traceId ?? ''),
        ...(typeof payload.photoSha256 === 'string' ? { photoSha256: payload.photoSha256 } : {}),
      };
    case 'scene':
      return { type: 'scene', scene: payload as never };
    case 'item':
      return { type: 'item', item: payload as never };
    case 'done':
      return {
        type: 'done',
        runId: String(payload.runId ?? ''),
        totalItems: typeof payload.totalItems === 'number' ? payload.totalItems : 0,
      };
    case 'merge-suggestion':
      return { type: 'merge-suggestions', suggestions: payload };
    case 'error':
      return {
        type: 'error',
        code: String(payload.code ?? 'scout_failed'),
        ...(typeof payload.message === 'string' ? { message: payload.message } : {}),
      };
    default:
      return null;
  }
}

/**
 * POSTs the frame and folds every SSE event into `handlers.onEvent` as it
 * arrives. Resolves when the server closes the stream (or the abort signal
 * fires); rejects only on transport-level failure (HTTP error, network,
 * timeout) — server-side failures arrive as `error` EVENTS instead.
 */
export function streamScoutEvents(
  input: ScoutStreamInput,
  handlers: ScoutStreamHandlers,
  opts?: { signal?: AbortSignal },
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const parser = createSseParser();
    let settled = false;
    let offset = 0;

    const finish = (err?: Error): void => {
      if (settled) return;
      settled = true;
      opts?.signal?.removeEventListener('abort', onAbort);
      if (err) reject(err);
      else resolve();
    };

    const drain = (): void => {
      const text = typeof xhr.responseText === 'string' ? xhr.responseText : '';
      if (text.length <= offset) return;
      const chunk = text.slice(offset);
      offset = text.length;
      for (const message of parser.feed(chunk)) {
        const event = decodeScoutEvent(message);
        if (event) handlers.onEvent(event);
      }
    };

    const url = `${resolveApiBaseUrl().replace(/\/+$/, '')}/v1/detect/stream?mode=scout`;
    xhr.open('POST', url);
    xhr.setRequestHeader('accept', 'text/event-stream');
    const apiKey = resolveApiKey();
    if (apiKey) xhr.setRequestHeader('authorization', `Bearer ${apiKey}`);
    xhr.setRequestHeader('traceparent', makeTraceparent());
    xhr.timeout = SCOUT_STREAM_TIMEOUT_MS;

    xhr.onprogress = drain;
    xhr.onload = () => {
      drain();
      if (xhr.status >= 200 && xhr.status < 300) finish();
      else finish(new Error(`scout stream HTTP ${xhr.status}`));
    };
    xhr.onerror = () => finish(new Error('scout stream network error'));
    xhr.ontimeout = () => finish(new Error('scout stream timed out'));
    xhr.onabort = () => finish();

    const onAbort = (): void => xhr.abort();
    opts?.signal?.addEventListener('abort', onAbort, { once: true });

    // Vocab resolution is async (local SQLite) — the send waits on it, never
    // on the network. resolveDetectVocab never rejects and resolves fast, so
    // the stream open takes no meaningful extra latency.
    resolveDetectVocab()
      .then((vocab) => {
        // Aborted while resolving: onAbort already finished the promise.
        if (settled) return;
        const form = new FormData();
        form.append('frame', {
          uri: input.fileUri,
          name: input.fileName,
          type: input.mimeType,
        } as unknown as Blob);
        appendDetectVocab(form, vocab);
        xhr.send(form);
      })
      .catch((err: unknown) => finish(err instanceof Error ? err : new Error(String(err))));
  });
}
