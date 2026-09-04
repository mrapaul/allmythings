import { Prefs } from '@/stores/prefs';
import Constants from 'expo-constants';

/**
 * Effective backend endpoint. Resolution order:
 *   1. in-app Settings override (a store build can point at a Tailscale host)
 *   2. last-known-good server found via mDNS discovery (health-checked,
 *      persisted by `services/server-discovery.ts`)
 *   3. build-time config (`extra.apiBaseUrl`)
 *   4. localhost for the simulator
 */

export const LOCALHOST_FALLBACK_URL = 'http://localhost:14000';

export interface BaseUrlCandidates {
  override: string | null;
  discovered: string | null;
  extraDefault: string | null;
}

/** Pure resolution-order logic — first non-empty candidate wins. */
export function pickApiBaseUrl(candidates: BaseUrlCandidates): string {
  return (
    candidates.override ??
    candidates.discovered ??
    candidates.extraDefault ??
    LOCALHOST_FALLBACK_URL
  );
}

let prefs: Prefs | null = null;
function getPrefs(): Prefs {
  if (!prefs) {
    try {
      prefs = Prefs.makeMmkv();
    } catch {
      prefs = Prefs.makeInMemory();
    }
  }
  return prefs;
}

export function resolveApiBaseUrl(): string {
  const p = getPrefs();
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };
  return pickApiBaseUrl({
    override: p.getApiBaseUrlOverride(),
    discovered: p.getDiscoveredApiUrl(),
    extraDefault: extra.apiBaseUrl ?? null,
  });
}

export function resolveApiKey(): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiKey?: string };
  return extra.apiKey;
}
