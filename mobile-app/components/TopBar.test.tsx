import { act, render } from '@testing-library/react-native';
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

const pushSpy = vi.fn();
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: pushSpy }),
}));

// Imported AFTER the mocks so the module sees the stubbed hooks.
const TopBar = (await import('./TopBar')).default;

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

describe('TopBar', () => {
  it('renders without throwing', () => {
    const tree = render(<TopBar onPickHome={() => {}} />).toJSON();
    expect(tree).toBeTruthy();
  });

  it('badges the queue button with the pending+failed count and opens the inbox', async () => {
    pushSpy.mockClear();
    const view = render(<TopBar onPickHome={() => {}} queueCount={3} />);
    const btn = findByTestId(view.toJSON(), 'top-bar-queue');
    expect(btn?.props.accessibilityLabel).toBe('Review queue, 3 photos waiting');
    expect(btn?.props.accessibilityHint).toBeTruthy();
    await act(async () => {
      (btn?.props.onPress as () => void)();
    });
    expect(pushSpy).toHaveBeenCalledWith('/inbox');
  });

  it('drops the badge copy when the queue is empty', () => {
    const view = render(<TopBar onPickHome={() => {}} queueCount={0} />);
    expect(findByTestId(view.toJSON(), 'top-bar-queue')?.props.accessibilityLabel).toBe(
      'Review queue',
    );
  });
});
