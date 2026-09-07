import { candidateUrls, tetheringCandidates } from '@/lib/server-candidates';
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
  /** Scan the USB-tethering subnets when nothing else answers. */
  scanTethering?: boolean;
  /** Probes in flight during that scan. */
  concurrency?: number;
}

/** Probes many addresses at once and returns the first that answers. */
async function firstReachable(
  urls: readonly string[],
  verify: (url: string) => Promise<boolean>,
  concurrency: number,
): Promise<string | null> {
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async (url) => ((await verify(url)) ? url : null)));
    const hit = results.find((r): r is string => r !== null);
    if (hit) return hit;
  }
  return null;
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

  const remember = (url: string): string => {
    // Remember it: the next request skips the probe entirely.
    if (prefs.getDiscoveredApiUrl() !== url) prefs.setDiscoveredApiUrl(url);
    return url;
  };

  for (const url of candidates) {
    if (await verify(url)) return remember(url);
  }

  if (deps.scanTethering === false) return null;
  // Last resort: the computer on the other end of the USB cable.
  const tethered = await firstReachable(tetheringCandidates(), verify, deps.concurrency ?? 24);
  return tethered ? remember(tethered) : null;
}
