import { act, render } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';

/**
 * Contract test for the capture → detection handoff. Regression guard for the
 * bug where the home screen navigated to /detection without the photo URI and
 * the user saw "No image selected".
 */

const pushSpy = vi.fn();

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), back: vi.fn() }),
  useLocalSearchParams: () => ({}),
  Link: 'Link',
  Stack: { Screen: 'StackScreen' },
}));

vi.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: vi.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: vi.fn(async () => ({ granted: true })),
  launchCameraAsync: vi.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///captured-room.jpg' }],
  })),
  launchImageLibraryAsync: vi.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///picked-room.jpg' }],
  })),
}));

vi.mock('@/contexts/HomesContext', () => ({
  useHomes: () => ({
    homes: [{ id: 'h1', name: 'Home', icon: '🏡' }],
    activeHome: { id: 'h1', name: 'Home', icon: '🏡' },
    activeHomeId: 'h1',
    profile: { name: 'You', initials: 'Y' },
    setActiveHomeId: vi.fn(),
  }),
}));

vi.mock('@/contexts/InventoryContext', () => ({
  useInventory: () => ({
    items: [],
    counts: { total: 0 },
    repo: { search: vi.fn(async () => []) },
    deleteItem: vi.fn(),
    moveItem: vi.fn(),
  }),
}));

const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const HomeScreen = (await import('./index')).default;

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HomeScreen />
    </QueryClientProvider>,
  );
}

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

describe('HomeScreen capture → detection contract', () => {
  it('passes the picked photo URI to the detection route', async () => {
    const view = renderHome();
    const tree = view.toJSON();
    const libraryBtn = findByTestId(tree, 'action-capsule-library');
    expect(libraryBtn).toBeTruthy();

    await act(async () => {
      (libraryBtn!.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(pushSpy).toHaveBeenCalledWith({
      pathname: '/detection',
      params: { imageUri: 'file:///picked-room.jpg' },
    });
  });

  it('does not navigate when the picker is cancelled', async () => {
    const picker = await import('expo-image-picker');
    vi.mocked(picker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: true,
      assets: null,
    } as never);
    pushSpy.mockClear();

    const view = renderHome();
    const libraryBtn = findByTestId(view.toJSON(), 'action-capsule-library');
    await act(async () => {
      (libraryBtn!.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(pushSpy).not.toHaveBeenCalled();
  });
});
