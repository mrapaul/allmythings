/**
 * The annotated primary photo is DERIVED from the run's photoSha256 — it is
 * never part of any response schema, so nothing here touches generated API
 * types. The URL construction and the fallback decision live in pure helpers
 * so both are unit-testable.
 */

/** `${API_BASE}/photos/<photoSha256>.jpg?annotated=1` (trailing slashes trimmed). */
export function annotatedPhotoUrl(apiBaseUrl: string, photoSha256: string): string {
  const base = apiBaseUrl.trim().replace(/\/+$/, '');
  return `${base}/photos/${photoSha256.trim()}.jpg?annotated=1`;
}

/**
 * Which photo becomes an item's primary on save: the annotated render when
 * the download succeeded, otherwise the existing local raw capture. Never
 * blocks the save — the raw flow is always the fallback.
 */
export function pickPrimaryPhotoUri(
  annotatedUri: string | null,
  rawUri: string | undefined,
): string | undefined {
  return annotatedUri ?? rawUri;
}
