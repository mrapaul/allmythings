import { Prefs } from '@/stores/prefs';
import Constants from 'expo-constants';

/**
 * Effective backend endpoint: the in-app Settings override wins (so a store
 * build can point at a Tailscale hostname), falling back to the build-time
 * config, then localhost for the simulator.
 */

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
  const override = getPrefs().getApiBaseUrlOverride();
  if (override) return override;
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };
  return extra.apiBaseUrl ?? 'http://localhost:14000';
}

export function resolveApiKey(): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiKey?: string };
  return extra.apiKey;
}
