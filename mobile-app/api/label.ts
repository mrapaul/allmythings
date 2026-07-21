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
  });
}
