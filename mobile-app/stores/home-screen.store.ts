import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

type Sort = 'newest' | 'oldest' | 'alpha';

interface HomeScreenState {
  query: string;
  category: string | null;
  sort: Sort;
  setQuery: (q: string) => void;
  setCategory: (c: string | null) => void;
  cycleSort: () => void;
}

export function createHomeScreenStore() {
  return createStore<HomeScreenState>((set, get) => ({
    query: '',
    category: null,
    sort: 'newest',
    setQuery: (q) => set({ query: q }),
    setCategory: (c) => set({ category: c }),
    cycleSort: () =>
      set({
        sort: get().sort === 'newest' ? 'oldest' : get().sort === 'oldest' ? 'alpha' : 'newest',
      }),
  }));
}

const homeScreenStore = createHomeScreenStore();

export function useHomeScreenStore<T>(selector: (s: HomeScreenState) => T): T {
  return useStore(homeScreenStore, selector);
}

/** Non-hook access for cross-screen actions (attribute chip → search). */
export function getHomeScreenStore() {
  return homeScreenStore;
}
