import { act, render } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';

const replaceSpy = vi.fn();

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
});
