import { act, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * In-context export on the home screen: the share-2 button beside the
 * view-mode toggle opens an action sheet whose "current view" variants export
 * exactly the filtered/visible hook result, and whose "everything" variants
 * reuse the whole-inventory flow (all homes via the repo).
 */

const alertSpy = vi.fn();
const shareExportFileSpy = vi.fn(
  async (_fileName: string, _content: string, _mimeType: string) => 'shared' as const,
);
const getItemsByHomeSpy = vi.fn(async (_homeId: string) => [ARMCHAIR, VASE]);

vi.mock('react-native', async () => {
  const actual = await vi.importActual<typeof import('__tests__/stubs/react-native')>(
    '__tests__/stubs/react-native',
  );
  return { ...actual, Alert: { alert: (...args: unknown[]) => alertSpy(...args) } };
});

vi.mock('@/services/export-share', () => ({
  shareExportFile: shareExportFileSpy,
}));

const pushSpy = vi.fn();
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), back: vi.fn() }),
  useLocalSearchParams: () => ({}),
  Link: 'Link',
  Stack: { Screen: 'StackScreen' },
}));

vi.mock('@/hooks/useServerHealth', () => ({
  useServerHealth: () => ({ health: 'unknown', baseUrl: 'http://test:14000' }),
}));

vi.mock('@/services/walk-capture', () => ({
  dispatchShot: vi.fn(async () => ({ ok: true })),
  checkShotQuality: vi.fn(async () => null),
  precheckShot: vi.fn(async () => null),
}));

vi.mock('@/contexts/HomesContext', () => ({
  useHomes: () => ({
    homes: [{ id: 'h1', name: 'Home', icon: '🏡', createdAt: 1 }],
    activeHome: { id: 'h1', name: 'Home', icon: '🏡', createdAt: 1 },
    activeHomeId: 'h1',
    profile: { name: 'You', initials: 'Y' },
    setActiveHomeId: vi.fn(),
  }),
}));

vi.mock('@/contexts/InventoryContext', () => ({
  useInventory: () => ({
    items: [ARMCHAIR, VASE],
    counts: { h1: 2 },
    repo: {
      searchItems: vi.fn(async () => []),
      getItemsByHome: getItemsByHomeSpy,
    },
    softDelete: vi.fn(),
    undoDelete: vi.fn(),
    pendingDelete: null,
  }),
}));

const ARMCHAIR = {
  id: 'item-1',
  homeId: 'h1',
  label: 'armchair',
  description: 'orange armchair',
  category: 'Furniture',
  tags: ['orange'],
  primaryPhotoUri: 'file:///a.jpg',
  thumbnailUri: null,
  attributes: null,
  labels: [
    { key: 'type', value: 'armchair' },
    { key: 'color', value: 'orange' },
  ],
  additionalPhotoUris: [],
  notes: 'a "quoted" note',
  box: { x: 0.3, y: 0.3, width: 0.3, height: 0.3 },
  createdAt: 20,
  updatedAt: 20,
};

const VASE = {
  ...ARMCHAIR,
  id: 'item-2',
  label: 'vase',
  description: 'ceramic vase',
  category: 'Decor',
  tags: [],
  createdAt: 10,
  updatedAt: 10,
};

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
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByTestId(child, testID);
      if (hit) return hit;
    }
    return null;
  }
  const n = node as { props?: Record<string, unknown>; children?: unknown };
  if (n.props?.testID === testID) return n as { props: Record<string, unknown> };
  return findByTestId(n.children, testID);
}

type SheetButton = { text?: string; onPress?: () => void };

function sheetButtons(): SheetButton[] {
  const call = alertSpy.mock.calls[0] as unknown[] | undefined;
  return (call?.[2] as SheetButton[] | undefined) ?? [];
}

async function pressOption(text: string) {
  const btn = sheetButtons().find((b) => b.text === text);
  expect(btn, `action sheet option "${text}"`).toBeTruthy();
  await act(async () => {
    btn?.onPress?.();
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('home screen in-context export', () => {
  beforeEach(() => {
    alertSpy.mockClear();
    shareExportFileSpy.mockClear();
    getItemsByHomeSpy.mockClear();
  });

  it('opens an action sheet with view + everything variants beside the view toggle', async () => {
    const view = renderHome();
    const btn = findByTestId(view.toJSON(), 'export-view-button');
    expect(btn?.props.accessibilityLabel).toBe('Export or share this view');
    await act(async () => {
      (btn?.props.onPress as () => void)();
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect((alertSpy.mock.calls[0] as unknown[])[0]).toBe('Export');
    expect(sheetButtons().map((b) => b.text)).toEqual([
      'Export current view (CSV)',
      'Export current view (JSON)',
      'Export everything (CSV)',
      'Export everything (JSON)',
      'Cancel',
    ]);
  });

  it('exports exactly the visible items as CSV (filtered hook result)', async () => {
    const view = renderHome();
    await act(async () => {
      (findByTestId(view.toJSON(), 'export-view-button')?.props.onPress as () => void)();
    });
    await pressOption('Export current view (CSV)');

    expect(shareExportFileSpy).toHaveBeenCalledTimes(1);
    const [fileName, content, mimeType] = shareExportFileSpy.mock.calls[0] ?? ['', '', ''];
    expect(fileName).toBe(`view-${new Date().toISOString().slice(0, 10)}.csv`);
    expect(mimeType).toBe('text/csv');
    const lines = content.trimEnd().split('\n');
    expect(lines[0]).toBe('home,label,description,category,location,tags,notes,created,updated');
    expect(lines).toHaveLength(3);
    // Sort default 'newest': armchair (createdAt 20) leads the view.
    expect(lines[1]).toContain('armchair');
    expect(lines[1]).toContain('"a ""quoted"" note"');
    expect(lines[2]).toContain('vase');
  });

  it('exports the visible view as JSON with the view title', async () => {
    const view = renderHome();
    await act(async () => {
      (findByTestId(view.toJSON(), 'export-view-button')?.props.onPress as () => void)();
    });
    await pressOption('Export current view (JSON)');

    const [fileName, content, mimeType] = shareExportFileSpy.mock.calls[0] ?? ['', '', ''];
    expect(fileName.endsWith('.json')).toBe(true);
    expect(mimeType).toBe('application/json');
    const parsed = JSON.parse(content) as {
      kind: string;
      title: string;
      home: string;
      count: number;
      items: Array<{ label: string }>;
    };
    expect(parsed.kind).toBe('view');
    expect(parsed.title).toBe('Collection');
    expect(parsed.home).toBe('Home');
    expect(parsed.count).toBe(2);
    expect(parsed.items.map((i) => i.label)).toEqual(['armchair', 'vase']);
  });

  it('export-everything (JSON) stages the whole inventory across homes', async () => {
    const view = renderHome();
    await act(async () => {
      (findByTestId(view.toJSON(), 'export-view-button')?.props.onPress as () => void)();
    });
    await pressOption('Export everything (JSON)');

    expect(getItemsByHomeSpy).toHaveBeenCalledWith('h1');
    const [fileName, content, mimeType] = shareExportFileSpy.mock.calls[0] ?? ['', '', ''];
    expect(fileName).toBe(`inventory-${new Date().toISOString().slice(0, 10)}.json`);
    expect(mimeType).toBe('application/json');
    const parsed = JSON.parse(content) as {
      homes: Array<{ name: string; items: Array<{ label: string }> }>;
    };
    expect(parsed.homes).toHaveLength(1);
    expect(parsed.homes[0]?.name).toBe('Home');
    expect(parsed.homes[0]?.items.map((i) => i.label)).toEqual(['armchair', 'vase']);
  });
});
