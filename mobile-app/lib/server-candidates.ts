/**
 * Every address the server might answer on, in the order worth trying.
 *
 * A single configured address is a single point of failure: a phone VPN that
 * tunnels LAN traffic away, a Wi-Fi change, a Mac that moved networks — each
 * leaves the app pointed at a dead host with photos piling up. The app should
 * instead try what it knows and use whichever actually answers.
 */

/** Reachable only while the phone is tethered (`adb reverse tcp:14000`). */
export const USB_TUNNEL_URL = 'http://127.0.0.1:14000';

/**
 * Android hands the tethered computer a DHCP address on these subnets — the
 * phone itself is always the .129 gateway. When the phone's VPN has swallowed
 * the Wi-Fi LAN, this link still reaches the Mac, so scanning it is the last
 * resort before declaring the server unreachable.
 */
export const TETHER_SUBNETS = ['192.168.42', '192.168.43'] as const;
export const TETHER_HOST_RANGE = { first: 2, last: 128 } as const;

export function tetheringCandidates(port = 14000): string[] {
  const out: string[] = [];
  for (const subnet of TETHER_SUBNETS) {
    for (let host = TETHER_HOST_RANGE.first; host <= TETHER_HOST_RANGE.last; host++) {
      out.push(`http://${subnet}.${host}:${port}`);
    }
  }
  return out;
}

export interface CandidateSources {
  /** What the user typed in Settings, if anything. Tried first. */
  override: string | null;
  /** Last address that answered, or one found over mDNS. */
  discovered: string | null;
  /** Baked-in LAN default from app config. */
  extraDefault: string | null;
}

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Ordered, de-duplicated candidates. The user's own setting leads — but it
 * does not get to be the only option, because an address that does not answer
 * is not a preference, it is a dead end.
 */
export function candidateUrls(sources: CandidateSources): string[] {
  const ordered = [sources.override, sources.discovered, sources.extraDefault, USB_TUNNEL_URL];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ordered) {
    if (!raw) continue;
    const url = normalize(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
