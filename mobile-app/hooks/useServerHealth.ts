import { resolveApiBaseUrl } from '@/api/base-url';
import { verifyServer } from '@/services/server-discovery';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Live reachability of the detection server, so an unreachable backend is
 * never a silent failure — the home screen turns it into a visible,
 * actionable state instead of shots quietly queueing forever.
 *
 * 'unknown' until the first probe answers; then 'online'/'offline', refreshed
 * on an interval and whenever the app returns to the foreground (the moment
 * a Wi-Fi change would have broken the path).
 */

export type ServerHealth = 'unknown' | 'online' | 'offline';

const PROBE_INTERVAL_MS = 30_000;

interface ServerHealthDeps {
  verify?: typeof verifyServer;
  resolveUrl?: typeof resolveApiBaseUrl;
  intervalMs?: number;
}

export function useServerHealth(deps: ServerHealthDeps = {}): {
  health: ServerHealth;
  baseUrl: string;
} {
  const verify = deps.verify ?? verifyServer;
  const resolveUrl = deps.resolveUrl ?? resolveApiBaseUrl;
  const intervalMs = deps.intervalMs ?? PROBE_INTERVAL_MS;

  const [health, setHealth] = useState<ServerHealth>('unknown');
  const [baseUrl, setBaseUrl] = useState(() => resolveUrl());
  const probingRef = useRef(false);

  useEffect(() => {
    let disposed = false;

    const probe = async () => {
      if (probingRef.current) return;
      probingRef.current = true;
      try {
        // Re-resolve every probe: settings overrides and mDNS discovery can
        // change the effective endpoint while the screen is open.
        const url = resolveUrl();
        const ok = await verify(url);
        if (!disposed) {
          setBaseUrl(url);
          setHealth(ok ? 'online' : 'offline');
        }
      } finally {
        probingRef.current = false;
      }
    };

    void probe();
    const timer = setInterval(() => void probe(), intervalMs);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void probe();
    });
    return () => {
      disposed = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [verify, resolveUrl, intervalMs]);

  return { health, baseUrl };
}
