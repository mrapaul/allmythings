import { render } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';

// Settings reads live data from Homes/Inventory contexts whose hooks throw
// outside their providers. Substitute lean fixtures so the smoke test stays
// scoped to render-doesn't-throw — same pattern as `components/TopBar.test.tsx`.
vi.mock('@/contexts/HomesContext', () => ({
  useHomes: () => ({
    homes: [
      { id: 'home-1', name: 'My Home', icon: '🏡', createdAt: 0 },
      { id: 'home-2', name: 'Beach', icon: '🏖️', createdAt: 1 },
    ],
    activeHomeId: 'home-1',
    activeHome: { id: 'home-1', name: 'My Home', icon: '🏡', createdAt: 0 },
    profile: { name: 'You', initials: 'Y' },
    setActiveHomeId: async () => {},
    addHome: async () => ({ id: 'home-3', name: 'New Home', icon: '🏡', createdAt: 2 }),
    renameHome: async () => {},
    deleteHome: async () => {},
    updateProfile: async () => {},
    isLoading: false,
  }),
}));

vi.mock('@/contexts/InventoryContext', () => ({
  useInventory: () => ({
    items: [],
    counts: { 'home-1': 3, 'home-2': 0 },
    repo: { getItemsByHome: async () => [] },
    softDelete: vi.fn(),
    undoDelete: vi.fn(),
    pendingDelete: null,
  }),
}));

const SettingsScreen = (await import('./settings')).default;

describe('SettingsScreen', () => {
  it('renders without throwing', () => {
    const tree = render(<SettingsScreen />).toJSON();
    expect(tree).toBeTruthy();
  });
});
