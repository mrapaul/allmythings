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
