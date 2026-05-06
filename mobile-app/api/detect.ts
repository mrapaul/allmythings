import Constants from 'expo-constants';
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

  const baseUrl =
    (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
    'http://localhost:14000';
  const apiKey = (Constants.expoConfig?.extra as { apiKey?: string } | undefined)?.apiKey;
  const headers: Record<string, string> = { traceparent };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const init: RequestInit = {
    method: 'POST',
    body: form as unknown as BodyInit,
    headers,
  };
  if (signal) init.signal = signal;
  const res = await fetch(`${baseUrl}/v1/detect/stream`, init);
  if (!res.ok || !res.body) throw new Error(`detect/stream HTTP ${res.status}`);

  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const { events, remainder } = parseSseChunks(buf);
      buf = remainder;
      for (const ev of events) yield _testParseStreamLine(ev);
    }
    if (buf.trim()) {
      const { events } = parseSseChunks(`${buf}\n\n`);
      for (const ev of events) yield _testParseStreamLine(ev);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }
}

export function _testParseStreamLine(ev: RawSseEvent): DetectStreamEvent {
  const data = JSON.parse(ev.data) as Record<string, unknown>;
  switch (ev.event) {
    case 'meta':
      return { type: 'meta', runId: String(data.runId), traceId: String(data.traceId) };
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
