import { act, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replaceSpy = vi.fn();

const prefsMock = vi.hoisted(() => ({
  locations: [] as string[],
}));

vi.mock('@/stores/prefs', () => ({
  Prefs: {
    makeMmkv: () => ({
      getRecentLocations: () => [...prefsMock.locations],
      setRecentLocations: (next: string[]) => {
        prefsMock.locations = next;
      },
    }),
    makeInMemory: () => ({
      getRecentLocations: () => [...prefsMock.locations],
      setRecentLocations: (next: string[]) => {
        prefsMock.locations = next;
      },
    }),
  },
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceSpy, back: vi.fn() }),
  useLocalSearchParams: () => ({}),
}));

const addItemsSpy = vi.fn(async () => ['new-1']);

vi.mock('@/contexts/InventoryContext', () => ({
  useInventory: () => ({
    items: [
      {
        id: 'i1',
        homeId: 'h1',
        label: 'sofa',
        description: '',
        category: 'Furniture',
        tags: [],
        primaryPhotoUri: '',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 1, height: 1 },
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    addItems: addItemsSpy,
  }),
}));

const AddItemScreen = (await import('./add-item')).default;

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

describe('AddItemScreen', () => {
  beforeEach(() => {
    addItemsSpy.mockClear();
    replaceSpy.mockClear();
    prefsMock.locations = [];
  });

  it('offers the collection categories plus defaults', () => {
    const tree = render(<AddItemScreen />).toJSON();
    const flat = JSON.stringify(tree);
    expect(flat).toContain('Furniture');
    expect(flat).toContain('Other');
  });

  it('saves the typed name VERBATIM — no normalization', async () => {
    const view = render(<AddItemScreen />);
    const nameInput = findByTestId(view.toJSON(), 'manual-add-name');
    expect(nameInput).toBeTruthy();

    await act(async () => {
      (nameInput?.props.onChangeText as (v: string) => void)("  grandma's WEIRD_vase ");
    });
    const saveBtn = findByTestId(view.toJSON(), 'manual-add-save');
    await act(async () => {
      (saveBtn?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(addItemsSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        label: "  grandma's WEIRD_vase ",
        category: 'Other',
        primaryPhotoUri: '',
      }),
    ]);
    expect(replaceSpy).toHaveBeenCalledWith('/');
  });

  it('does not save when the name is empty', async () => {
    addItemsSpy.mockClear();
    const view = render(<AddItemScreen />);
    const saveBtn = findByTestId(view.toJSON(), 'manual-add-save');
    await act(async () => {
      (saveBtn?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(addItemsSpy).not.toHaveBeenCalled();
  });

  it('saves null location when none was chosen', async () => {
    const view = render(<AddItemScreen />);
    const nameInput = findByTestId(view.toJSON(), 'manual-add-name');
    await act(async () => {
      (nameInput?.props.onChangeText as (v: string) => void)('vase');
    });
    await act(async () => {
      (findByTestId(view.toJSON(), 'manual-add-save')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(addItemsSpy).toHaveBeenCalledWith([expect.objectContaining({ location: null })]);
  });

  it('persists a typed location and records it as a recent one', async () => {
    prefsMock.locations = ['garage'];
    const view = render(<AddItemScreen />);
    const nameInput = findByTestId(view.toJSON(), 'manual-add-name');
    await act(async () => {
      (nameInput?.props.onChangeText as (v: string) => void)('scarf');
      (findByTestId(view.toJSON(), 'location-input')?.props.onChangeText as (v: string) => void)(
        'hallway closet — top shelf',
      );
    });
    // The seeded recent chip is offered one-tap.
    expect(findByTestId(view.toJSON(), 'location-chip-garage')).toBeTruthy();

    await act(async () => {
      (findByTestId(view.toJSON(), 'manual-add-save')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(addItemsSpy).toHaveBeenCalledWith([
      expect.objectContaining({ label: 'scarf', location: 'hallway closet — top shelf' }),
    ]);
    // New location lands in front of the seeded recents.
    expect(prefsMock.locations).toEqual(['hallway closet — top shelf', 'garage']);
  });

  it('a one-tap recent chip fills the location without typing', async () => {
    prefsMock.locations = ['attic — blue bin'];
    const view = render(<AddItemScreen />);
    const nameInput = findByTestId(view.toJSON(), 'manual-add-name');
    await act(async () => {
      (nameInput?.props.onChangeText as (v: string) => void)('lantern');
    });
    await act(async () => {
      (
        findByTestId(view.toJSON(), 'location-chip-attic — blue bin')?.props.onPress as () => void
      )();
    });
    expect(findByTestId(view.toJSON(), 'location-input')?.props.value).toBe('attic — blue bin');

    await act(async () => {
      (findByTestId(view.toJSON(), 'manual-add-save')?.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(addItemsSpy).toHaveBeenCalledWith([
      expect.objectContaining({ location: 'attic — blue bin' }),
    ]);
    // Choosing an existing recent does not duplicate it.
    expect(prefsMock.locations).toEqual(['attic — blue bin']);
  });
});
