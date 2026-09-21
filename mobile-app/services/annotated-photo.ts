import { resolveApiBaseUrl, resolveApiKey } from '@/api/base-url';
import { annotatedPhotoUrl } from '@/lib/annotated-photo';

/**
 * Downloads the server's annotated render of a run's photo into the app
 * cache, keyed by photoSha256. Best-effort by contract: the annotated render
 * is an enhancement, so ANY failure — 404 (server has no render for this
 * photo), network, missing cache directory — resolves null and the caller
 * keeps the existing raw-photo flow. The inventory save copies the file into
 * app storage, so the volatile cache location is safe.
 */

interface LegacyFileSystem {
  cacheDirectory: string | null;
  downloadAsync(
    url: string,
    fileUri: string,
    options?: { headers?: Record<string, string> },
  ): Promise<{ status: number }>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
}

function legacyFileSystem(): LegacyFileSystem | null {
  try {
    // biome-ignore lint/correctness/noNodejsModules: RN-only module, required lazily so tests need no native bindings
    // biome-ignore lint/suspicious/noExplicitAny: CJS interop for expo-file-system/legacy
    return (require as any)('expo-file-system/legacy') as LegacyFileSystem;
  } catch {
    return null;
  }
}

/** Local cache uri of the annotated render, or null when unavailable. */
export async function fetchAnnotatedPhoto(photoSha256: string): Promise<string | null> {
  const fs = legacyFileSystem();
  if (!fs?.cacheDirectory) return null;
  const target = `${fs.cacheDirectory}annotated_${photoSha256}.jpg`;
  const apiKey = resolveApiKey();
  try {
    const result = await fs.downloadAsync(
      annotatedPhotoUrl(resolveApiBaseUrl(), photoSha256),
      target,
      { headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {} },
    );
    if (result.status === 200) return target;
    // A 404 body still lands on disk — drop it so the cache never fills
    // with error pages.
    await fs.deleteAsync(target, { idempotent: true });
    return null;
  } catch {
    return null;
  }
}
