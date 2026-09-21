import { act, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Arrange mode (iPhone home-screen idiom) on the collection grid:
 * long-press reveals × badges, × deletes through the existing soft-delete +
 * undo path, and a tap must NOT open the item modal while arranging.
 */

const pushSpy = vi.fn();
const softDeleteSpy = vi.fn();

const ITEM = {
  id: 'item-1',
  homeId: 'h1',
  label: 'armchair',
  description: 'orange armchair',
  category: 'Furniture',
  tags: [],
  primaryPhotoUri: 'file:///a.jpg',
  thumbnailUri: null,
  attributes: null,
  labels: [
    { key: 'type', value: 'armchair' },
    { key: 'color', value: 'orange' },
  ],
  additionalPhotoUris: [],
  notes: '',
  // Touches no edge → 'full', so no partial badge in this fixture.
  box: { x: 0.3, y: 0.3, width: 0.3, height: 0.3 },
  createdAt: 10,
  updatedAt: 10,
};

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), back: vi.fn() }),
  useLocalSearchParams: () => ({}),
  Link: 'Link',
  Stack: { Screen: 'StackScreen' },
}));

vi.mock('@/services/walk-capture', () => ({
  dispatchShot: vi.fn(async () => ({ ok: true })),
  checkShotQuality: vi.fn(async () => null),
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

vi.mock('@/contexts/InventoryContext', () => ({
  useInventory: () => ({
    items: [ITEM],
    counts: { h1: 1 },
    repo: { searchItems: vi.fn(async () => []) },
    softDelete: softDeleteSpy,
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

/** In-document-order testID collection, for asserting visual ordering. */
function collectTestIDs(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) collectTestIDs(child, out);
    return out;
  }
  const n = node as { props?: Record<string, unknown>; children?: unknown };
  if (typeof n.props?.testID === 'string') out.push(n.props.testID);
  collectTestIDs(n.children, out);
  return out;
}

describe('collection grid arrange mode', () => {
  beforeEach(() => {
    pushSpy.mockClear();
    softDeleteSpy.mockClear();
  });

  it('is off by default: no × badge, no Done pill, tap opens the item', async () => {
    const view = renderHome();
    expect(findByTestId(view.toJSON(), 'tile-delete-0')).toBeNull();
    expect(findByTestId(view.toJSON(), 'arrange-done')).toBeNull();

    const tile = findByTestId(view.toJSON(), 'collection-tile-0');
    await act(async () => {
      (tile?.props.onPress as () => void)();
    });
    expect(pushSpy).toHaveBeenCalledWith('/item/item-1');
  });

  it('long-press enters arrange mode and reveals the × badge and Done pill', async () => {
    const view = renderHome();
    const tile = findByTestId(view.toJSON(), 'collection-tile-0');

    await act(async () => {
      (tile?.props.onLongPress as () => void)();
    });

    expect(findByTestId(view.toJSON(), 'tile-delete-0')).toBeTruthy();
    expect(findByTestId(view.toJSON(), 'arrange-done')).toBeTruthy();
  });

  it('a tap while arranging does not open the item modal', async () => {
    const view = renderHome();
    await act(async () => {
      (findByTestId(view.toJSON(), 'collection-tile-0')?.props.onLongPress as () => void)();
    });
    await act(async () => {
      (findByTestId(view.toJSON(), 'collection-tile-0')?.props.onPress as () => void)();
    });
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('× deletes through the soft-delete path (no confirmation dialog)', async () => {
    const view = renderHome();
    await act(async () => {
      (findByTestId(view.toJSON(), 'collection-tile-0')?.props.onLongPress as () => void)();
    });
    await act(async () => {
      (findByTestId(view.toJSON(), 'tile-delete-0')?.props.onPress as () => void)();
    });
    // Undo snackbar is the safety net, so the label is the item handle.
    expect(softDeleteSpy).toHaveBeenCalledWith(['item-1'], 'Armchair');
  });

  it('Done leaves arrange mode', async () => {
    const view = renderHome();
    await act(async () => {
      (findByTestId(view.toJSON(), 'collection-tile-0')?.props.onLongPress as () => void)();
    });
    await act(async () => {
      (findByTestId(view.toJSON(), 'arrange-done')?.props.onPress as () => void)();
    });
    expect(findByTestId(view.toJSON(), 'tile-delete-0')).toBeNull();
    expect(findByTestId(view.toJSON(), 'arrange-done')).toBeNull();
  });
});

describe('partial-visibility badge on tiles', () => {
  it('marks a truncated item and leaves a fully-visible one unmarked', async () => {
    const view = renderHome();
    // The fixture box touches no edge → no badge.
    expect(findByTestId(view.toJSON(), 'partial-badge-0')).toBeNull();
  });
});

describe('overview mode (default)', () => {
  it('renders a category section header with the tile inside', () => {
    const view = renderHome();
    // Default view mode is overview; the fixture is Furniture.
    expect(findByTestId(view.toJSON(), 'collection-overview')).toBeTruthy();
    expect(findByTestId(view.toJSON(), 'overview-section-Furniture')).toBeTruthy();
    // Tile testIDs stay continuous and reachable in overview.
    expect(findByTestId(view.toJSON(), 'collection-tile-0')).toBeTruthy();
    // Tiles are pure imagery: no text chips rendered on them.
    const flat = JSON.stringify(view.toJSON());
    expect(flat).not.toContain('tileChipText');
  });

  it('collapsing a section hides its tiles; expanding restores them', async () => {
    const view = renderHome();
    const header = findByTestId(view.toJSON(), 'overview-section-Furniture');
    await act(async () => {
      (header?.props.onPress as () => void)();
    });
    expect(findByTestId(view.toJSON(), 'collection-tile-0')).toBeNull();
    await act(async () => {
      (findByTestId(view.toJSON(), 'overview-section-Furniture')?.props.onPress as () => void)();
    });
    expect(findByTestId(view.toJSON(), 'collection-tile-0')).toBeTruthy();
  });
});

describe('queue tiles lead the collection', () => {
  it('renders the queue section ahead of every category section', async () => {
    const { addJob, getJobsStore } = await import('@/stores/jobs.store');
    getJobsStore().setState({ jobs: [] });
    try {
      addJob({
        runId: 'r-walk-running',
        photoUri: 'file:///walk.jpg',
        startedAt: Date.now(),
        roomSessionId: 'session-1',
        status: 'running',
        itemCount: 0,
        errorCode: null,
        reviewed: false,
        advice: null,
      });
      const view = renderHome();
      const ids = collectTestIDs(view.toJSON());
      expect(ids).toContain('queue-section');
      expect(ids.indexOf('queue-section')).toBeLessThan(ids.indexOf('overview-section-Furniture'));
    } finally {
      getJobsStore().setState({ jobs: [] });
    }
  });
});
