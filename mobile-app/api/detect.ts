import { makeAsyncQueue } from './async-queue';
import { resolveApiBaseUrl, resolveApiKey } from './base-url';
import { apiFetch, makeTraceparent } from './client';
import { type RawSseEvent, parseSseChunks } from './sse';
import type { DetectStreamEvent, DetectedItem } from './types';

interface DetectInput {
  fileUri: string;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export async function detectImage(
  input: DetectInput,
): Promise<{ items: DetectedItem[]; traceparent: string }> {
  const traceparent = makeTraceparent();
  const form = new FormData();
  form.append('frame', {
    uri: input.fileUri,
    name: input.fileName,
    type: input.mimeType,
  } as unknown as Blob);
  const data = await apiFetch<{ items: DetectedItem[] }>('/v1/detect', {
    method: 'POST',
    body: form,
    headers: { traceparent },
  });
  return { items: data.items, traceparent };
}

/**
 * Stream detection events over SSE using XMLHttpRequest.
 *
 * React Native's fetch has no streaming response body (`res.body` is null),
 * which made every fetch-based reader fail on-device with "HTTP 200". XHR's
 * incremental `onprogress` + growing `responseText` is the reliable RN
 * transport for server-sent events, and works on web too.
 */
export async function* detectImageStream(
  input: DetectInput,
  signal?: AbortSignal,
): AsyncGenerator<DetectStreamEvent, void, unknown> {
  const traceparent = makeTraceparent();
  const form = new FormData();
  form.append('frame', {
    uri: input.fileUri,
    name: input.fileName,
    type: input.mimeType,
  } as unknown as Blob);

  const baseUrl = resolveApiBaseUrl();
  const apiKey = resolveApiKey();

  const queue = makeAsyncQueue<RawSseEvent>();
  const xhr = new XMLHttpRequest();
  let seen = 0;
  let buf = '';

  const consume = (final: boolean): void => {
    const text = xhr.responseText ?? '';
    buf += text.slice(seen);
    seen = text.length;
    const { events, remainder } = parseSseChunks(final && buf.trim() ? `${buf}\n\n` : buf);
    buf = final ? '' : remainder;
    for (const ev of events) queue.push(ev);
  };

  xhr.open('POST', `${baseUrl}/v1/detect/stream`);
  xhr.setRequestHeader('traceparent', traceparent);
  if (apiKey) xhr.setRequestHeader('authorization', `Bearer ${apiKey}`);
  xhr.onprogress = () => {
    if (xhr.status && xhr.status !== 200) return;
    consume(false);
  };
  xhr.onload = () => {
    if (xhr.status !== 200) {
      queue.fail(new Error(`detect/stream HTTP ${xhr.status}`));
      return;
    }
    consume(true);
    queue.end();
  };
  xhr.onerror = () => queue.fail(new Error('detect/stream network error'));
  xhr.ontimeout = () => queue.fail(new Error('detect/stream timed out'));
  if (signal) {
    signal.addEventListener('abort', () => {
      xhr.abort();
      queue.end();
    });
  }
  xhr.send(form as unknown as XMLHttpRequestBodyInit);

  for await (const raw of queue.iterate()) {
    yield _testParseStreamLine(raw);
  }
}

export function _testParseStreamLine(ev: RawSseEvent): DetectStreamEvent {
  const data = JSON.parse(ev.data) as Record<string, unknown>;
  switch (ev.event) {
    case 'meta':
      return {
        type: 'meta',
        runId: String(data.runId),
        traceId: String(data.traceId),
        ...(typeof data.photoSha256 === 'string' ? { photoSha256: data.photoSha256 } : {}),
      };
    case 'scene':
      return { type: 'scene', scene: data as unknown as import('./types').SceneInfo };
    case 'item':
      return { type: 'item', item: data as unknown as DetectedItem };
    case 'done':
      return {
        type: 'done',
        runId: String(data.runId),
        totalItems: Number(data.totalItems ?? 0),
      };
    case 'error':
      return {
        type: 'error',
        code: String(data.code ?? 'unknown'),
        ...(typeof data.runId === 'string' ? { runId: data.runId } : {}),
        ...(typeof data.message === 'string' ? { message: data.message } : {}),
        ...(typeof data.retryAfterS === 'number' ? { retryAfterS: data.retryAfterS } : {}),
      };
    default:
      return { type: 'error', code: 'unknown_event', message: ev.event };
  }
}
