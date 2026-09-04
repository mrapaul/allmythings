import { act, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mergeItemsSpy = vi.fn(async () => undefined);

const fixture = vi.hoisted(() => ({
  items: [] as unknown[],
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useLocalSearchParams: () => ({}),
}));

vi.mock('@/contexts/InventoryContext', () => ({
  useInventory: () => ({ items: fixture.items, mergeItems: mergeItemsSpy }),
}));

const { Prefs } = await import('@/stores/prefs');
const { initSuggestionsStore, refreshLocalSuggestions, getSuggestionsStore } = await import(
  '@/stores/suggestions.store'
);
const TidyScreen = (await import('./tidy')).default;

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

const chairPair = [
  {
    id: 'old',
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
    box: { x: 0, y: 0, width: 0.3, height: 0.3 },
    createdAt: 10,
    updatedAt: 10,
  },
  {
    id: 'new',
    homeId: 'h1',
    label: 'armchair',
    description: '',
    category: 'Furniture',
    tags: [],
    primaryPhotoUri: 'file:///b.jpg',
    thumbnailUri: null,
    attributes: null,
    labels: [
      { key: 'type', value: 'armchair' },
      { key: 'color', value: 'orange' },
    ],
    additionalPhotoUris: [],
    notes: '',
    box: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
    createdAt: 20,
    updatedAt: 20,
  },
];

describe('TidyScreen', () => {
  beforeEach(() => {
    mergeItemsSpy.mockClear();
    initSuggestionsStore(Prefs.makeInMemory());
    fixture.items = [];
  });

  it('congratulates when there is nothing to tidy', () => {
    const view = render(<TidyScreen />);
    expect(findByTestId(view.toJSON(), 'tidy-empty')).toBeTruthy();
    expect(findByTestId(view.toJSON(), 'tidy-card')).toBeNull();
  });

  it('shows one suggestion card with both items and merges on tap', async () => {
    fixture.items = chairPair;
    refreshLocalSuggestions(chairPair as never);

    const view = render(<TidyScreen />);
    expect(findByTestId(view.toJSON(), 'tidy-card')).toBeTruthy();
    const flat = JSON.stringify(view.toJSON());
    expect(flat).toContain('KEEPING');
    expect(flat).toContain('FOLDING IN');
    expect(flat).toContain('Armchair');

    const mergeBtn = findByTestId(view.toJSON(), 'tidy-merge');
    await act(async () => {
      (mergeBtn?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });
    // Oldest item is the keeper.
    expect(mergeItemsSpy).toHaveBeenCalledWith('old', ['new']);
    expect(getSuggestionsStore().getState().suggestions).toHaveLength(0);
  });

  it('"Not the same" dismisses the pair permanently', async () => {
    fixture.items = chairPair;
    const prefs = Prefs.makeInMemory();
    initSuggestionsStore(prefs);
    refreshLocalSuggestions(chairPair as never);

    const view = render(<TidyScreen />);
    const notSame = findByTestId(view.toJSON(), 'tidy-not-same');
    await act(async () => {
      (notSame?.props.onPress as () => void)();
    });

    expect(getSuggestionsStore().getState().suggestions).toHaveLength(0);
    expect(prefs.getDismissedSuggestions()).toHaveLength(1);
    // A later background scan must not resurrect it.
    refreshLocalSuggestions(chairPair as never);
    expect(getSuggestionsStore().getState().suggestions).toHaveLength(0);
  });

  it('Skip leaves the suggestion queued for later', async () => {
    fixture.items = chairPair;
    refreshLocalSuggestions(chairPair as never);

    const view = render(<TidyScreen />);
    const skip = findByTestId(view.toJSON(), 'tidy-skip');
    await act(async () => {
      (skip?.props.onPress as () => void)();
    });

    expect(getSuggestionsStore().getState().suggestions).toHaveLength(1);
    expect(findByTestId(view.toJSON(), 'tidy-empty')).toBeTruthy();
  });
});
