import type { Prefs } from '@/stores/prefs';

/**
 * Zero-config server discovery. The api-service advertises itself over
 * Bonjour/mDNS as `allmythings-server` (`_http._tcp`, port 14000 — see
 * api-service/src/utils/bonjour-advertiser.ts). This module scans for that
 * service, verifies a candidate with a quick `/v1/health` fetch, and
 * persists the confirmed URL as the last-known-good discovered endpoint
 * consumed by `api/base-url.ts`.
 *
 * The native mDNS module (react-native-zeroconf) requires a dev-client
 * prebuild; when it is not linked yet, discovery degrades to a no-op and
 * the existing resolution chain still works.
 */

export const SERVER_SERVICE_NAME = 'allmythings-server';
const SCAN_WINDOW_MS = 12_000;
const HEALTH_TIMEOUT_MS = 2_500;

export interface DiscoveredService {
  name?: string;
  port?: number;
  host?: string;
  addresses?: string[];
}

export interface ZeroconfLike {
  on(event: 'resolved', cb: (service: DiscoveredService) => void): void;
  scan(type?: string, protocol?: string, domain?: string): void;
  stop(): void;
  removeDeviceListeners?(): void;
}

export function isInventoryServerService(service: DiscoveredService): boolean {
  return service.name === SERVER_SERVICE_NAME;
}

/**
 * Builds a base URL from a resolved mDNS service. Prefers a plain IPv4
 * address (always routable on the LAN) over the mDNS hostname; strips the
 * trailing dot mDNS hostnames carry.
 */
export function serviceToBaseUrl(service: DiscoveredService): string | null {
  const port = service.port;
  if (!port || port <= 0) return null;
  const ipv4 = (service.addresses ?? []).find((a) => /^\d{1,3}(\.\d{1,3}){3}$/.test(a));
  const host = ipv4 ?? service.host?.replace(/\.$/, '');
  if (!host) return null;
  return `http://${host}:${port}`;
}

/** Quick reachability probe before a discovered URL is trusted. */
export async function verifyServer(
  baseUrl: string,
  timeoutMs: number = HEALTH_TIMEOUT_MS,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/v1/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function makeZeroconf(): ZeroconfLike | null {
  try {
    // biome-ignore lint/style/useNodejsImportProtocol: react-native-zeroconf is RN-only
    // biome-ignore lint/correctness/noNodejsModules: dynamic require avoids loading the native module in Vitest
    // biome-ignore lint/suspicious/noExplicitAny: require is intentional for RN-only side-effecting import
    const mod = (require as any)('react-native-zeroconf') as {
      default?: new () => ZeroconfLike;
    } & (new () => ZeroconfLike);
    const Zeroconf = mod.default ?? mod;
    return new Zeroconf();
  } catch {
    return null;
  }
}

interface DiscoveryDeps {
  makeClient?: () => ZeroconfLike | null;
  verify?: typeof verifyServer;
}

/**
 * Starts a bounded discovery pass. Re-validates the persisted last-known-good
 * URL (dropping it when the server moved), then scans `_http._tcp` for the
 * advertised service and persists the first candidate that answers
 * `/v1/health`. Returns a cleanup function.
 */
export function startServerDiscovery(prefs: Prefs, deps: DiscoveryDeps = {}): () => void {
  const verify = deps.verify ?? verifyServer;
  let cancelled = false;

  const known = prefs.getDiscoveredApiUrl();
  if (known) {
    void verify(known).then((ok) => {
      if (!cancelled && !ok) prefs.setDiscoveredApiUrl(null);
    });
  }

  const zeroconf = (deps.makeClient ?? makeZeroconf)();
  if (!zeroconf) {
    return () => {
      cancelled = true;
    };
  }

  try {
    zeroconf.on('resolved', (service) => {
      if (cancelled || !isInventoryServerService(service)) return;
      const url = serviceToBaseUrl(service);
      if (!url) return;
      void verify(url).then((ok) => {
        if (!cancelled && ok) prefs.setDiscoveredApiUrl(url);
      });
    });
    zeroconf.scan('http', 'tcp', 'local.');
  } catch {
    return () => {
      cancelled = true;
    };
  }

  const stopTimer = setTimeout(() => {
    try {
      zeroconf.stop();
    } catch {
      // native teardown is best-effort
    }
  }, SCAN_WINDOW_MS);

  return () => {
    cancelled = true;
    clearTimeout(stopTimer);
    try {
      zeroconf.stop();
      zeroconf.removeDeviceListeners?.();
    } catch {
      // native teardown is best-effort
    }
  };
}
