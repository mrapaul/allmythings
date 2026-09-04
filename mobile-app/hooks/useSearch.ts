import { useInventory } from '@/contexts/InventoryContext';
import { labelsForDisplay } from '@/lib/labels';
import { rankSearchResults } from '@/lib/search-query';
import { matchVocabulary } from '@/services/vocab-match';
import type { InventoryItem } from '@/types/inventory';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from './useDebouncedValue';

/** Quiet window before a keystroke fires an FTS query. */
const SEARCH_DEBOUNCE_MS = 150;

/**
 * As-you-type search over a single home's inventory. Two layers, and no
 * hardcoded vocabulary anywhere:
 *  1. FTS5 prefix/token match over each item's own indexed text (offline).
 *  2. Optional semantic expansion — the server ranks THIS inventory's own
 *     distinct label values against the query, and the winners widen the
 *     FTS match. Short timeout, per-session cache, silent fallback.
 * Hits are ranked so exact-prefix matches lead, and the previous result set
 * stays on screen while the next loads. When `query` is empty we don't hit
 * the index — callers fall back to the in-memory `items` from useInventory.
 */
export function useSearch(homeId: string | null, query: string) {
  const { repo, items } = useInventory();
  const debounced = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  return useQuery<InventoryItem[]>({
    queryKey: ['search', homeId, debounced],
    queryFn: async () => {
      if (!homeId) return [];
      // The candidate vocabulary is the user's own label values.
      const vocabulary = Array.from(
        new Set(items.flatMap((it) => labelsForDisplay(it).map((l) => l.value))),
      );
      const expansions = await matchVocabulary(debounced, vocabulary);
      const hits = await repo.searchItems(homeId, debounced, expansions);
      return rankSearchResults(hits, debounced);
    },
    enabled: !!homeId && debounced.length > 0,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}
