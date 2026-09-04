import { act, render } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';

// Detail-screen tests with lean fixtures rather than real Drizzle/PhotoStorage
// providers — same pattern as `components/TopBar.test.tsx`. The fixture holder
// lets each test choose the route id + inventory contents.

const fixture = vi.hoisted(() => ({
  paramId: 'nonexistent',
  items: [] as unknown[],
}));

// `expo-image-picker` reaches into `expo-modules-core` at import time, which
// expects native bindings that don't exist under Vitest.
vi.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: async () => ({ granted: true }),
  requestMediaLibraryPermissionsAsync: async () => ({ granted: true }),
  launchCameraAsync: async () => ({ canceled: true, assets: [] }),
  launchImageLibraryAsync: async () => ({ canceled: true, assets: [] }),
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: fixture.paramId }),
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    back: () => undefined,
  }),
  Stack: { Screen: 'StackScreen' },
  Link: 'Link',
}));

vi.mock('@/contexts/InventoryContext', () => ({
  useInventory: () => ({
    items: fixture.items,
    counts: {},
    addItems: async () => [],
    updateItem: async () => {},
    softDelete: () => undefined,
    undoDelete: () => undefined,
    pendingDelete: null,
    addPhotoToItem: async () => {},
    refresh: async () => {},
    isLoading: false,
    repo: undefined,
  }),
}));

const ItemDetailScreen = (await import('./[id]')).default;

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

// Realistic fixture straight from the bug report: valid detected box whose
// x is 0.0 — zero coordinates are valid and must never be treated as falsy.
const GOLD_PAINTING = {
  id: 'item-1',
  homeId: 'h1',
  label: 'framed painting',
  description: 'gold framed painting',
  category: 'Decor',
  tags: ['gold', 'framed'],
  primaryPhotoUri: 'file:///room.jpg',
  thumbnailUri: 'file:///thumbs/painting.jpg',
  attributes: null,
  additionalPhotoUris: [],
  notes: '',
  box: { x: 0.0, y: 0.2, width: 0.248, height: 0.085 },
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

describe('ItemDetailScreen (not-found)', () => {
  it('renders the not-found state without throwing', () => {
    fixture.paramId = 'nonexistent';
    fixture.items = [];
    const tree = render(<ItemDetailScreen />).toJSON();
    expect(tree).toBeTruthy();
    const flat = JSON.stringify(tree);
    expect(flat).toContain("We can't find that item");
  });
});

describe('ItemDetailScreen (detected item)', () => {
  it('always renders the bbox overlay for a valid detected box (x=0 included)', async () => {
    fixture.paramId = 'item-1';
    fixture.items = [GOLD_PAINTING];
    const view = render(<ItemDetailScreen />);
    // Overlay must be present IMMEDIATELY (square-mapping fallback), not
    // only after the async natural-size read lands.
    expect(findByTestId(view.toJSON(), 'detail-bbox-overlay')).toBeTruthy();

    // Flush the Image.loadAsync natural-size read; overlay stays.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const overlay = findByTestId(view.toJSON(), 'detail-bbox-overlay');
    expect(overlay).toBeTruthy();
    const flat = JSON.stringify(view.toJSON());
    expect(flat).toContain('detected');
  });

  it('renders the type handle as heading and the derived label chips (no title field)', async () => {
    fixture.paramId = 'item-1';
    fixture.items = [GOLD_PAINTING];
    const view = render(<ItemDetailScreen />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const flat = JSON.stringify(view.toJSON());
    // Heading is the capitalized head noun of the stored label.
    expect(flat).toContain('Painting');
    // Derived chips: type + category + color, each individually addressable.
    expect(findByTestId(view.toJSON(), 'label-chip-type-painting')).toBeTruthy();
    expect(findByTestId(view.toJSON(), 'label-chip-color-gold')).toBeTruthy();
    expect(findByTestId(view.toJSON(), 'label-chip-category-Decor')).toBeTruthy();
    // Chip editor affordance present; raw stored label no longer a heading.
    expect(findByTestId(view.toJSON(), 'label-editor-open')).toBeTruthy();
  });
});
