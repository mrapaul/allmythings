import { render } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';

// Smoke test for the not-found path: when the URL id doesn't match any
// inventory item, the screen renders an "Item not found" notice + back
// button without throwing. We substitute lean fixtures rather than wiring
// up real Drizzle/PhotoStorage providers — same pattern as
// `components/TopBar.test.tsx`.

// `expo-image-picker` reaches into `expo-modules-core` at import time, which
// expects native bindings that don't exist under Vitest. Stub the surface
// the screen touches (only `requestCameraPermissionsAsync`/`launchCameraAsync`
// + the library equivalents are referenced).
vi.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: async () => ({ granted: true }),
  requestMediaLibraryPermissionsAsync: async () => ({ granted: true }),
  launchCameraAsync: async () => ({ canceled: true, assets: [] }),
  launchImageLibraryAsync: async () => ({ canceled: true, assets: [] }),
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'nonexistent' }),
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
    items: [],
    counts: {},
    addItems: async () => [],
    updateItem: async () => {},
    deleteItem: async () => {},
    addPhotoToItem: async () => {},
    deleteAllInActiveHome: async () => {},
    refresh: async () => {},
    isLoading: false,
    repo: undefined,
  }),
}));

const ItemDetailScreen = (await import('./[id]')).default;

describe('ItemDetailScreen (not-found)', () => {
  it('renders the not-found state without throwing', () => {
    const tree = render(<ItemDetailScreen />).toJSON();
    expect(tree).toBeTruthy();
    // The not-found path renders a plain string indicator we can sniff for
    // without hitting `getByText` (which the test shim doesn't support).
    const flat = JSON.stringify(tree);
    expect(flat).toContain('Item not found');
  });
});
