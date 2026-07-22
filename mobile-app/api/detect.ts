import { apiFetch, makeTraceparent } from './client';
import type { DetectedItem } from './types';

interface DetectInput {
  fileUri: string;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface DetectionRunHandle {
  runId: string;
  photoSha256: string;
  statusUrl: string;
}

function buildFrameForm(input: DetectInput): FormData {
  const form = new FormData();
  form.append('frame', {
    uri: input.fileUri,
    name: input.fileName,
    type: input.mimeType,
  } as unknown as Blob);
  return form;
}

/** Synchronous detection — small images / tests only; blocks for the full run. */
export async function detectImage(
  input: DetectInput,
): Promise<{ items: DetectedItem[]; traceparent: string }> {
  const traceparent = makeTraceparent();
  const data = await apiFetch<{ items: DetectedItem[] }>('/v1/detect', {
    method: 'POST',
    body: buildFrameForm(input),
    headers: { traceparent },
  });
  return { items: data.items, traceparent };
}

/**
 * Kick off an asynchronous detection run. The server answers immediately with
 * a runId; progress is consumed via pollDetectionEvents (see detect-poll.ts).
 * Detection takes minutes on the free tier, and only this upload needs the
 * network to stay up — everything after survives locks/backgrounding.
 */
export async function startDetection(input: DetectInput): Promise<DetectionRunHandle> {
  return apiFetch<DetectionRunHandle>('/v1/detect?async=1', {
    method: 'POST',
    body: buildFrameForm(input),
    headers: { traceparent: makeTraceparent() },
  });
}
