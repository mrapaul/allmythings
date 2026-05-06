import { render } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';

// TopBar pulls live data from the Homes/Inventory contexts via hooks that
// throw outside their providers. For a smoke render we substitute lean
// fixtures so the test stays scoped to the component itself.
vi.mock('@/contexts/HomesContext', () => ({
  useHomes: () => ({
    activeHome: { id: 'home-1', name: 'Test Home', icon: '🏡' },
    profile: { name: 'Test User', initials: 'TU' },
  }),
}));

vi.mock('@/contexts/InventoryContext', () => ({
  useInventory: () => ({ items: [] }),
}));

// Imported AFTER the mocks so the module sees the stubbed hooks.
const TopBar = (await import('./TopBar')).default;

describe('TopBar', () => {
  it('renders without throwing', () => {
    const tree = render(<TopBar onPickHome={() => {}} />).toJSON();
    expect(tree).toBeTruthy();
  });
});
