import { apiFetch, makeTraceparent } from './client';
import type { PrecheckResult } from './types';

interface PrecheckInput {
  fileUri: string;
}

/**
 * Fast capture precheck on a ~512px preview frame. Callers fail OPEN: a
 * network/server error must never block a capture (see walk-capture).
 */
export async function precheckFrame(input: PrecheckInput): Promise<PrecheckResult> {
  const form = new FormData();
  form.append('frame', {
    uri: input.fileUri,
    name: 'precheck.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);
  return apiFetch<PrecheckResult>('/v1/precheck', {
    method: 'POST',
    body: form,
    headers: { traceparent: makeTraceparent() },
  });
}
