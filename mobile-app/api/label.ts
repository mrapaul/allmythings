import { apiFetch, makeTraceparent } from './client';

export interface LabelSuggestion {
  label: string;
  category: string;
  description: string;
  tags: string[];
}

/**
 * Ask the backend to name a user-drawn crop (draw-to-teach). One multipart
 * POST; the server runs a single VLM call over the crop.
 */
export async function labelCrop(fileUri: string): Promise<LabelSuggestion> {
  const form = new FormData();
  form.append('crop', {
    uri: fileUri,
    name: 'crop.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);
  return apiFetch<LabelSuggestion>('/v1/label', {
    method: 'POST',
    body: form,
    headers: { traceparent: makeTraceparent() },
    // A single VLM call can exceed the client-wide 30s bound on the free
    // tier; draw-to-teach degrades gracefully on failure, so wait longer.
    timeout: 90_000,
  });
}
