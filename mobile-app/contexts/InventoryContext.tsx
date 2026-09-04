import type { AddItemInput, Repo } from '@/db/repository';
import type { PhotoStorage } from '@/services/photo-storage';
import type { InventoryItem } from '@/types/inventory';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useHomes } from './HomesContext';

/** How long a delete stays undoable before it actually commits. */
// 8s, not 5: deleting an item is the most consequential mis-tap in the app,
// and the extra beat costs nothing — the snackbar is non-blocking. (It also
// de-flakes E2E assertions that race the window on slow hierarchy dumps.)
const DELETE_UNDO_WINDOW_MS = 8_000;

export interface PendingDelete {
  ids: string[];
  /** Display name (single item) — bulk messages use ids.length. */
  label: string;
}

interface InventoryContextValue {
  items: InventoryItem[];
  counts: Record<string, number>;
  addItems: (
    items: Array<Omit<AddItemInput, 'primaryPhotoUri'> & { primaryPhotoUri: string }>,
  ) => Promise<string[]>;
  updateItem: (id: string, patch: Partial<InventoryItem>) => Promise<void>;
  /** Immediate bulk removal with a single refresh — used by post-save Undo. */
  deleteItems: (ids: string[]) => Promise<void>;
  /**
   * Undoable delete: items vanish from `items` immediately, but the database
   * commit waits 5s so a snackbar Undo can bring them back losslessly.
   * Screens render the snackbar from `pendingDelete`.
   */
  softDelete: (ids: string[], label: string) => void;
  undoDelete: () => void;
  pendingDelete: PendingDelete | null;
  /** Folds duplicates into the kept item (tidy-up flow). */
  mergeItems: (keepId: string, mergeIds: string[]) => Promise<void>;
  addPhotoToItem: (id: string, uri: string) => Promise<void>;
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
        // Generated thumbnails arrive as volatile cache files — move them
        // into app storage so tiles keep rendering across restarts.
        const thumbnail = data.thumbnailUri
          ? await photoStorage.saveThumbnail(data.thumbnailUri, `thumb_${Date.now()}_${i}`)
          : null;
        prepared.push({ ...data, primaryPhotoUri: stored, thumbnailUri: thumbnail });
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

  const deleteItems: InventoryContextValue['deleteItems'] = useCallback(
    async (ids) => {
      for (const id of ids) {
        await repo.deleteItem(id);
      }
      await refresh();
    },
    [refresh, repo],
  );

  const mergeItems: InventoryContextValue['mergeItems'] = useCallback(
    async (keepId, mergeIds) => {
      await repo.mergeItems(keepId, mergeIds);
      await refresh();
    },
    [refresh, repo],
  );

  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const pendingDeleteRef = useRef<PendingDelete | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitPendingDelete = useCallback(async () => {
    const pending = pendingDeleteRef.current;
    pendingDeleteRef.current = null;
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    setPendingDelete(null);
    if (!pending) return;
    for (const id of pending.ids) {
      await repo.deleteItem(id);
    }
    await refresh();
  }, [refresh, repo]);

  const softDelete: InventoryContextValue['softDelete'] = useCallback(
    (ids, label) => {
      // A second delete while one is pending commits the first immediately —
      // only ever one undo window at a time.
      void commitPendingDelete().then(() => {
        const pending: PendingDelete = { ids, label };
        pendingDeleteRef.current = pending;
        setPendingDelete(pending);
        pendingTimerRef.current = setTimeout(() => {
          void commitPendingDelete();
        }, DELETE_UNDO_WINDOW_MS);
      });
    },
    [commitPendingDelete],
  );

  const undoDelete: InventoryContextValue['undoDelete'] = useCallback(() => {
    pendingDeleteRef.current = null;
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    setPendingDelete(null);
  }, []);

  // Pending-delete items disappear from consumers instantly; the rows only
  // leave SQLite when the undo window closes.
  const visibleItems = useMemo(
    () => (pendingDelete ? items.filter((it) => !pendingDelete.ids.includes(it.id)) : items),
    [items, pendingDelete],
  );

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
      items: visibleItems,
      counts,
      addItems,
      updateItem,
      deleteItems,
      softDelete,
      undoDelete,
      pendingDelete,
      mergeItems,
      addPhotoToItem,
      refresh,
      isLoading,
      repo,
    }),
    [
      visibleItems,
      counts,
      addItems,
      updateItem,
      deleteItems,
      softDelete,
      undoDelete,
      pendingDelete,
      mergeItems,
      addPhotoToItem,
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
