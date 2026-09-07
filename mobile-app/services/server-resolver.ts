import { candidateUrls } from '@/lib/server-candidates';
import { verifyServer } from '@/services/server-discovery';
import type { Prefs } from '@/stores/prefs';
import Constants from 'expo-constants';

/**
 * Finds an address the server actually answers on, and remembers it.
 *
 * Probes candidates in order (settings, last-known-good, baked default, USB
 * tunnel) and stores the first that responds as the discovered URL, so every
 * later request uses it without probing again. Returns null when nothing
 * answers — the caller then leaves the capture queue to hold the photos,
 * which is the honest outcome rather than a wrong endpoint.
 */

export interface ResolveDeps {
  verify?: (url: string) => Promise<boolean>;
  /** Test seam for expo-constants. */
  extraDefault?: string | null;
}

export async function resolveReachableServer(
  prefs: Pick<Prefs, 'getApiBaseUrlOverride' | 'getDiscoveredApiUrl' | 'setDiscoveredApiUrl'>,
  deps: ResolveDeps = {},
): Promise<string | null> {
  const verify = deps.verify ?? verifyServer;
  const extra =
    deps.extraDefault !== undefined
      ? deps.extraDefault
      : (((Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string }).apiBaseUrl ?? null);

  const candidates = candidateUrls({
    override: prefs.getApiBaseUrlOverride(),
    discovered: prefs.getDiscoveredApiUrl(),
    extraDefault: extra,
  });

  for (const url of candidates) {
    if (await verify(url)) {
      // Remember it: the next request skips the probe entirely.
      if (prefs.getDiscoveredApiUrl() !== url) prefs.setDiscoveredApiUrl(url);
      return url;
    }
  }
  return null;
}
