import { act, render } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replaceSpy = vi.fn();
const pushSpy = vi.fn();

const prefsMock = vi.hoisted(() => ({
  locations: [] as string[],
}));

const guardMock = vi.hoisted(() => ({
  matches: [] as Array<{ id: string; label: string; location: string | null }>,
}));

const findSimilarSpy = vi.hoisted(() => vi.fn(async () => guardMock.matches));

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
  useRouter: () => ({ push: pushSpy, replace: replaceSpy, back: vi.fn() }),
  useLocalSearchParams: () => ({}),
}));

const addItemsSpy = vi.fn(async () => ['new-1']);

const repoMock = { findSimilarItems: findSimilarSpy };

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
    repo: repoMock,
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
    pushSpy.mockClear();
    prefsMock.locations = [];
    guardMock.matches = [];
    findSimilarSpy.mockClear();
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

  describe('duplicate-purchase guard', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    async function typeAndSettle(view: ReturnType<typeof render>, text: string) {
      const nameInput = findByTestId(view.toJSON(), 'manual-add-name');
      await act(async () => {
        (nameInput?.props.onChangeText as (v: string) => void)(text);
      });
      // Debounce + the repo promise resolution.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
    }

    it('shows the banner with the matched item and its location', async () => {
      guardMock.matches = [{ id: 'm1', label: 'Lamp', location: 'garage' }];
      const view = render(<AddItemScreen />);
      await typeAndSettle(view, 'lamp');

      expect(findSimilarSpy).toHaveBeenCalledWith('lamp');
      const banner = findByTestId(view.toJSON(), 'dup-guard-banner');
      expect(banner).toBeTruthy();
      const bannerText = JSON.stringify(banner);
      expect(bannerText).toContain('You already have ');
      expect(bannerText).toContain('Lamp');
      expect(bannerText).toContain(' — ');
      expect(bannerText).toContain('garage');
    });

    it('says "no location set" when the match has none', async () => {
      guardMock.matches = [{ id: 'm1', label: 'Lamp', location: null }];
      const view = render(<AddItemScreen />);
      await typeAndSettle(view, 'lamp');
      const bannerText = JSON.stringify(findByTestId(view.toJSON(), 'dup-guard-banner'));
      expect(bannerText).toContain('no location set');
    });

    it('adds a count when more than one item matches', async () => {
      guardMock.matches = [
        { id: 'm1', label: 'Lamp', location: 'garage' },
        { id: 'm2', label: 'lamp shade', location: null },
      ];
      const view = render(<AddItemScreen />);
      await typeAndSettle(view, 'lamp');
      const bannerText = JSON.stringify(findByTestId(view.toJSON(), 'dup-guard-banner'));
      expect(bannerText).toContain('(+1 more)');
    });

    it('shows no banner when nothing similar exists', async () => {
      guardMock.matches = [];
      const view = render(<AddItemScreen />);
      await typeAndSettle(view, 'lamp');
      expect(findSimilarSpy).toHaveBeenCalledWith('lamp');
      expect(findByTestId(view.toJSON(), 'dup-guard-banner')).toBeNull();
    });

    it('skips the lookup for queries under 3 chars, then recovers', async () => {
      guardMock.matches = [{ id: 'm1', label: 'Lamp', location: 'garage' }];
      const view = render(<AddItemScreen />);
      await typeAndSettle(view, 'la');
      expect(findSimilarSpy).not.toHaveBeenCalled();
      expect(findByTestId(view.toJSON(), 'dup-guard-banner')).toBeNull();

      await typeAndSettle(view, 'lamp');
      expect(findSimilarSpy).toHaveBeenCalledWith('lamp');
      expect(findByTestId(view.toJSON(), 'dup-guard-banner')).toBeTruthy();
    });

    it('hides the banner again when the name is cleared', async () => {
      guardMock.matches = [{ id: 'm1', label: 'Lamp', location: 'garage' }];
      const view = render(<AddItemScreen />);
      await typeAndSettle(view, 'lamp');
      expect(findByTestId(view.toJSON(), 'dup-guard-banner')).toBeTruthy();
      await typeAndSettle(view, '');
      expect(findByTestId(view.toJSON(), 'dup-guard-banner')).toBeNull();
    });

    it('opens the existing item when the banner is tapped', async () => {
      guardMock.matches = [{ id: 'm1', label: 'Lamp', location: 'garage' }];
      const view = render(<AddItemScreen />);
      await typeAndSettle(view, 'lamp');
      await act(async () => {
        (findByTestId(view.toJSON(), 'dup-guard-banner')?.props.onPress as () => void)();
      });
      expect(pushSpy).toHaveBeenCalledWith('/item/m1');
    });

    it('never blocks saving — the banner is advisory only', async () => {
      guardMock.matches = [{ id: 'm1', label: 'Lamp', location: 'garage' }];
      const view = render(<AddItemScreen />);
      await typeAndSettle(view, 'lamp');
      expect(findByTestId(view.toJSON(), 'dup-guard-banner')).toBeTruthy();

      await act(async () => {
        (findByTestId(view.toJSON(), 'manual-add-save')?.props.onPress as () => void)();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(addItemsSpy).toHaveBeenCalledWith([
        expect.objectContaining({ label: 'lamp', location: null }),
      ]);
    });
  });
});
