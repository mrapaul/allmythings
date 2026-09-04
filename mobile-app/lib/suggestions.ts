import type { InventoryItem } from '@/types/inventory';
import { labelsForDisplay } from './labels';

/**
 * Merge suggestions — the quiet half of duplicate handling. Suggestions are
 * NEVER modal and never block: they accumulate here, surface as a count on
 * the collection header, and are resolved one card at a time in app/tidy.tsx.
 *
 * Two sources: locally computed (type+color agreement across the WHOLE
 * inventory) and server-provided (`mergeSuggestions` on the detect payload /
 * SSE), parsed defensively so an absent or changed contract is a no-op.
 */

export type SuggestionSource = 'local' | 'server';
export type SuggestionConfidence = 'medium' | 'high';

export interface MergeSuggestion {
  /** Stable pair key — order-independent, so (a,b) and (b,a) are one entry. */
  id: string;
  keepId: string;
  mergeId: string;
  source: SuggestionSource;
  confidence: SuggestionConfidence;
  createdAt: number;
}

/** Server scores at or above this read as high confidence. */
const HIGH_CONFIDENCE_SCORE = 0.8;

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}

export function isMergeSuggestion(value: unknown): value is MergeSuggestion {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.keepId === 'string' &&
    typeof v.mergeId === 'string' &&
    (v.source === 'local' || v.source === 'server') &&
    (v.confidence === 'medium' || v.confidence === 'high') &&
    typeof v.createdAt === 'number'
  );
}

function labelValue(item: InventoryItem, key: string): string | null {
  const v = labelsForDisplay(item).find((l) => l.key === key)?.value;
  return v ? v.toLowerCase() : null;
}

/**
 * Whole-inventory duplicate scan. Items are bucketed by type+color so the
 * pass is linear rather than pairwise; within a bucket the oldest item is
 * the keeper and each newer one becomes a suggestion against it.
 */
export function computeLocalSuggestions(
  items: InventoryItem[],
  now: number = Date.now(),
): MergeSuggestion[] {
  const buckets = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const type = labelValue(item, 'type');
    if (!type) continue;
    const key = `${type}|${labelValue(item, 'color') ?? ''}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  const out: MergeSuggestion[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    const sorted = [...bucket].sort((a, b) => a.createdAt - b.createdAt);
    const keeper = sorted[0] as InventoryItem;
    for (const other of sorted.slice(1)) {
      out.push({
        id: pairKey(keeper.id, other.id),
        keepId: keeper.id,
        mergeId: other.id,
        source: 'local',
        confidence: 'medium',
        createdAt: now,
      });
    }
  }
  return out;
}

/**
 * Defensive parse of a server `mergeSuggestions` payload. Accepts entries
 * shaped {keepId|itemId, mergeId|duplicateId, score?}; anything else is
 * ignored so a lagging or changed contract can't break the client.
 */
export function parseServerSuggestions(
  payload: unknown,
  now: number = Date.now(),
): MergeSuggestion[] {
  if (!Array.isArray(payload)) return [];
  const out: MergeSuggestion[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const keepId =
      typeof e.keepId === 'string' ? e.keepId : typeof e.itemId === 'string' ? e.itemId : null;
    const mergeId =
      typeof e.mergeId === 'string'
        ? e.mergeId
        : typeof e.duplicateId === 'string'
          ? e.duplicateId
          : null;
    if (!keepId || !mergeId || keepId === mergeId) continue;
    const score = typeof e.score === 'number' ? e.score : null;
    out.push({
      id: pairKey(keepId, mergeId),
      keepId,
      mergeId,
      source: 'server',
      confidence: score !== null && score >= HIGH_CONFIDENCE_SCORE ? 'high' : 'medium',
      createdAt: now,
    });
  }
  return out;
}

/**
 * Merges incoming suggestions into the stored list: deduped by pair key,
 * permanently-dismissed pairs skipped, existing entries kept as-is.
 */
export function mergeSuggestionLists(
  existing: MergeSuggestion[],
  incoming: MergeSuggestion[],
  dismissed: string[],
): MergeSuggestion[] {
  const dismissedSet = new Set(dismissed);
  const seen = new Set(existing.map((s) => s.id));
  const out = existing.filter((s) => !dismissedSet.has(s.id));
  for (const suggestion of incoming) {
    if (dismissedSet.has(suggestion.id) || seen.has(suggestion.id)) continue;
    seen.add(suggestion.id);
    out.push(suggestion);
  }
  return out;
}

/** Drops suggestions whose items no longer exist (deleted or already merged). */
export function pruneSuggestions(
  suggestions: MergeSuggestion[],
  existingItemIds: Iterable<string>,
): MergeSuggestion[] {
  const ids = new Set(existingItemIds);
  return suggestions.filter((s) => ids.has(s.keepId) && ids.has(s.mergeId));
}
