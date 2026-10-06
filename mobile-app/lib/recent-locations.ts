/**
 * Whereabouts vocabulary. Locations are free text the user typed once and
 * reused ("hallway closet — top shelf"); the screens offer the most recent
 * ones as one-tap chips so cataloguing a shelf-full takes one decision, not
 * one typing session. Storage is the Prefs MMKV-backed JSON list
 * (`getRecentLocations`/`setRecentLocations`) — this module owns the list
 * semantics, mirroring lib/search-query's recent-searches helper.
 */

export const MAX_RECENT_LOCATIONS = 8;

/** Most-recent-first, case-insensitively deduplicated, capped list. */
export function pushRecentLocation(
  list: string[],
  location: string,
  max: number = MAX_RECENT_LOCATIONS,
): string[] {
  const trimmed = location.trim();
  if (!trimmed) return list;
  const rest = list.filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase());
  return [trimmed, ...rest].slice(0, max);
}
