import { useInventory } from '@/contexts/InventoryContext';
import type { InventoryItem } from '@/types/inventory';
import { useQuery } from '@tanstack/react-query';

/**
 * FTS-backed search over a single home's inventory. When `query` is
 * empty we don't hit the index — callers fall back to the in-memory
 * `items` from `useInventory`. Disabled when no home is active.
 */
export function useSearch(homeId: string | null, query: string) {
  const { repo } = useInventory();
  const trimmed = query.trim();
  return useQuery<InventoryItem[]>({
    queryKey: ['search', homeId, trimmed],
    queryFn: async () => {
      if (!homeId) return [];
      return repo.searchItems(homeId, trimmed);
    },
    enabled: !!homeId && trimmed.length > 0,
    staleTime: 10_000,
  });
}
