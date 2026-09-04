import type { InventoryItem } from '@/types/inventory';

/**
 * Overview mode: the organization layer made visible. Items grouped into
 * category sections, largest first, each collapsible. Pure logic — the screen
 * only renders what this returns.
 */

export interface OverviewSection {
  category: string;
  items: InventoryItem[];
  count: number;
  /**
   * Index of this section's first tile in the flattened tile order, so tile
   * testIDs (collection-tile-<n>) stay continuous across sections and match
   * what the flat grid would produce.
   */
  startIndex: number;
}

export function groupByCategory(items: InventoryItem[]): OverviewSection[] {
  const buckets = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const key = item.category?.trim() || 'Other';
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  const sections = Array.from(buckets.entries())
    .map(([category, sectionItems]) => ({
      category,
      items: sectionItems,
      count: sectionItems.length,
    }))
    // Largest first; stable alphabetical tiebreak so order never jitters.
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  let running = 0;
  return sections.map((s) => {
    const withIndex = { ...s, startIndex: running };
    running += s.count;
    return withIndex;
  });
}

/** Immutable collapse toggle; returns a new set. */
export function toggleCollapsed(collapsed: ReadonlySet<string>, category: string): Set<string> {
  const next = new Set(collapsed);
  if (next.has(category)) next.delete(category);
  else next.add(category);
  return next;
}
