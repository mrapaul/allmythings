import { render } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';

// Profile reads live data from Homes/Inventory contexts whose hooks throw
// outside their providers. Substitute lean fixtures so the smoke test stays
// scoped to render-doesn't-throw — same pattern as `components/TopBar.test.tsx`.
vi.mock('@/contexts/HomesContext', () => ({
  useHomes: () => ({
    homes: [{ id: 'home-1', name: 'My Home', icon: '🏡', createdAt: 0 }],
    activeHomeId: 'home-1',
    activeHome: { id: 'home-1', name: 'My Home', icon: '🏡', createdAt: 0 },
    profile: { name: 'You', initials: 'Y' },
    setActiveHomeId: async () => {},
    addHome: async () => ({ id: 'h2', name: 'X', icon: '🏡', createdAt: 1 }),
    renameHome: async () => {},
    deleteHome: async () => {},
    updateProfile: async () => {},
    isLoading: false,
  }),
}));

vi.mock('@/contexts/InventoryContext', () => ({
  useInventory: () => ({
    items: [],
    counts: { 'home-1': 5 },
  }),
}));

const ProfileScreen = (await import('./profile')).default;

describe('ProfileScreen', () => {
  it('renders without throwing', () => {
    const tree = render(<ProfileScreen />).toJSON();
    expect(tree).toBeTruthy();
  });
});
