import type { AddItemInput, Repo } from '@/db/repository';
import type { PhotoStorage } from '@/services/photo-storage';
import type { InventoryItem } from '@/types/inventory';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useHomes } from './HomesContext';

interface InventoryContextValue {
  items: InventoryItem[];
  counts: Record<string, number>;
  addItems: (
    items: Array<Omit<AddItemInput, 'primaryPhotoUri'> & { primaryPhotoUri: string }>,
  ) => Promise<string[]>;
  updateItem: (id: string, patch: Partial<InventoryItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  addPhotoToItem: (id: string, uri: string) => Promise<void>;
  deleteAllInActiveHome: () => Promise<void>;
  refresh: () => Promise<void>;
  isLoading: boolean;
  /**
   * Direct access to the underlying repository for read-only flows that
   * benefit from TanStack Query (e.g. FTS search). Mutations should still
   * go through the typed helpers above so the in-memory cache stays in
   * sync.
   */
  repo: Repo;
}

const InventoryContext = createContext<InventoryContextValue | undefined>(undefined);

interface ProviderProps {
  repo: Repo;
  photoStorage: PhotoStorage;
  children: ReactNode;
}

export function InventoryProvider({ repo, photoStorage, children }: ProviderProps) {
  const { activeHomeId } = useHomes();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!activeHomeId) {
      setItems([]);
      setCounts(await repo.counts());
      setIsLoading(false);
      return;
    }
    const [list, c] = await Promise.all([repo.getItemsByHome(activeHomeId), repo.counts()]);
    setItems(list);
    setCounts(c);
    setIsLoading(false);
  }, [activeHomeId, repo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addItems: InventoryContextValue['addItems'] = useCallback(
    async (incoming) => {
      if (!activeHomeId) return [];
      const cache = new Map<string, string>();
      const prepared: AddItemInput[] = [];
      let i = 0;
      for (const data of incoming) {
        const cached = cache.get(data.primaryPhotoUri);
        const stored =
          cached ??
          (await photoStorage.savePhoto(data.primaryPhotoUri, `photo_${Date.now()}_${i++}`));
        if (!cached) cache.set(data.primaryPhotoUri, stored);
        prepared.push({ ...data, primaryPhotoUri: stored });
      }
      const ids = await repo.addItems(activeHomeId, prepared);
      await refresh();
      return ids;
    },
    [activeHomeId, photoStorage, refresh, repo],
  );

  const updateItem: InventoryContextValue['updateItem'] = useCallback(
    async (id, patch) => {
      await repo.updateItem(id, patch);
      await refresh();
    },
    [refresh, repo],
  );

  const deleteItem: InventoryContextValue['deleteItem'] = useCallback(
    async (id) => {
      await repo.deleteItem(id);
      await refresh();
    },
    [refresh, repo],
  );

  const deleteAllInActiveHome: InventoryContextValue['deleteAllInActiveHome'] =
    useCallback(async () => {
      if (!activeHomeId) return;
      await repo.deleteAllInHome(activeHomeId);
      await refresh();
    }, [activeHomeId, refresh, repo]);

  const addPhotoToItem: InventoryContextValue['addPhotoToItem'] = useCallback(
    async (id, uri) => {
      const item = await repo.getItem(id);
      if (!item) return;
      const stored = await photoStorage.savePhoto(
        uri,
        `photo_${id}_${Date.now()}_${item.additionalPhotoUris.length + 1}`,
      );
      await repo.updateItem(id, {
        additionalPhotoUris: [...item.additionalPhotoUris, stored],
      });
      await refresh();
    },
    [photoStorage, refresh, repo],
  );

  const value = useMemo<InventoryContextValue>(
    () => ({
      items,
      counts,
      addItems,
      updateItem,
      deleteItem,
      addPhotoToItem,
      deleteAllInActiveHome,
      refresh,
      isLoading,
      repo,
    }),
    [
      items,
      counts,
      addItems,
      updateItem,
      deleteItem,
      addPhotoToItem,
      deleteAllInActiveHome,
      refresh,
      isLoading,
      repo,
    ],
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory(): InventoryContextValue {
  const v = useContext(InventoryContext);
  if (!v) throw new Error('useInventory outside InventoryProvider');
  return v;
}
