import { act, render } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';

/**
 * List view: rows carry the item's location under the label when one is
 * set, and stay unchanged when it is not. Grid/overview tiles are pure
 * imagery and never show it.
 */

const prefsMock = vi.hoisted(() => ({
  viewMode: 'list' as 'overview' | 'grid' | 'list',
}));

vi.mock('@/stores/prefs', () => ({
  Prefs: {
    makeMmkv: () => ({
      getCollectionViewMode: () => prefsMock.viewMode,
      setCollectionViewMode: () => undefined,
      getRecentSearches: () => [],
      setRecentSearches: () => undefined,
      getApiBaseUrlOverride: () => null,
      setApiBaseUrlOverride: () => undefined,
      getDiscoveredApiUrl: () => null,
      setDiscoveredApiUrl: () => undefined,
    }),
    makeInMemory: () => ({
      getCollectionViewMode: () => prefsMock.viewMode,
      setCollectionViewMode: () => undefined,
      getRecentSearches: () => [],
      setRecentSearches: () => undefined,
      getApiBaseUrlOverride: () => null,
      setApiBaseUrlOverride: () => undefined,
      getDiscoveredApiUrl: () => null,
      setDiscoveredApiUrl: () => undefined,
    }),
  },
}));

vi.mock('@/hooks/useServerHealth', () => ({
  useServerHealth: () => ({ health: 'unknown', baseUrl: 'http://test:14000' }),
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useLocalSearchParams: () => ({}),
  Link: 'Link',
  Stack: { Screen: 'StackScreen' },
}));

vi.mock('@/services/walk-capture', () => ({
  dispatchShot: vi.fn(async () => ({ ok: true, runId: 'r-walk' })),
  checkShotQuality: vi.fn(async () => null),
  precheckShot: vi.fn(async () => null),
}));

vi.mock('@/contexts/HomesContext', () => ({
  useHomes: () => ({
    homes: [{ id: 'h1', name: 'Home', icon: '🏡' }],
    activeHome: { id: 'h1', name: 'Home', icon: '🏡' },
    activeHomeId: 'h1',
    profile: { name: 'You', initials: 'Y' },
    setActiveHomeId: vi.fn(),
  }),
}));

const PLACED = {
  id: 'i-placed',
  homeId: 'h1',
  label: 'scarf',
  description: '',
  category: 'Clothing',
  tags: [],
  primaryPhotoUri: 'file:///scarf.jpg',
  thumbnailUri: null,
  attributes: null,
  labels: null,
  location: 'hallway closet — top shelf',
  additionalPhotoUris: [],
  notes: '',
  box: { x: 0, y: 0, width: 1, height: 1 },
  createdAt: 2_000,
  updatedAt: 2_000,
};

const UNPLACED = {
  ...PLACED,
  id: 'i-unplaced',
  label: 'vase',
  primaryPhotoUri: 'file:///vase.jpg',
  location: null,
  createdAt: 1_000,
  updatedAt: 1_000,
};

vi.mock('@/contexts/InventoryContext', () => ({
  useInventory: () => ({
    items: [PLACED, UNPLACED],
    isLoading: false,
    counts: { h1: 2 },
    repo: { searchItems: vi.fn(async () => []) },
    softDelete: vi.fn(),
    undoDelete: vi.fn(),
    pendingDelete: null,
  }),
}));

const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const HomeScreen = (await import('./index')).default;

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HomeScreen />
    </QueryClientProvider>,
  );
}

function findByTestId(node: unknown, testID: string): { props: Record<string, unknown> } | null {
  if (!node || typeof node !== 'object') return null;
  const n = node as { props?: Record<string, unknown>; children?: unknown[] };
  if (n.props?.testID === testID) return n as { props: Record<string, unknown> };
  for (const child of n.children ?? []) {
    const hit = findByTestId(child, testID);
    if (hit) return hit;
  }
  return null;
}

function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectStrings(child, out);
    return out;
  }
  if (node && typeof node === 'object' && 'children' in node) {
    collectStrings((node as { children: unknown }).children, out);
  }
  return out;
}

describe('HomeScreen list view location line', () => {
  it('shows the location under the label only when set', async () => {
    prefsMock.viewMode = 'list';
    const view = renderHome();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const tree = view.toJSON();
    expect(findByTestId(tree, 'collection-list')).toBeTruthy();

    // Newest first: PLACED (createdAt 2000) is row 0 and carries the line…
    const located = findByTestId(tree, 'list-location-0');
    expect(located).toBeTruthy();
    expect(collectStrings(located)).toContain('hallway closet — top shelf');
    // …UNPLACED (row 1) has no location line at all.
    expect(findByTestId(tree, 'list-location-1')).toBeNull();

    const texts = collectStrings(tree);
    expect(texts).toContain('hallway closet — top shelf');
    // Row labels render capitalized via the type handle.
    expect(texts).toContain('Vase');
  });

  it('grid and overview tiles never show the location', async () => {
    for (const mode of ['grid', 'overview'] as const) {
      prefsMock.viewMode = mode;
      const view = renderHome();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      const flat = JSON.stringify(view.toJSON());
      expect(flat).not.toContain('hallway closet — top shelf');
      expect(findByTestId(view.toJSON(), 'list-location-0')).toBeNull();
      view.unmount();
    }
  });
});
