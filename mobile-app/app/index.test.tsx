import { act, render } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';

/**
 * Contract test for the capture → walk-mode dispatch handoff. Regression
 * guard for losing the picked photo URI between the picker and detection
 * (originally: navigation without params → "No image selected"; now: the
 * background dispatch must receive the exact URI).
 */

const pushSpy = vi.fn();
const dispatchSpy = vi.fn(async () => ({ ok: true, runId: 'r-walk' }));

// Controllable server health: unit tests must never probe a real network.
let serverHealth: 'unknown' | 'online' | 'offline' = 'unknown';
vi.mock('@/hooks/useServerHealth', () => ({
  useServerHealth: () => ({ health: serverHealth, baseUrl: 'http://test:14000' }),
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), back: vi.fn() }),
  useLocalSearchParams: () => ({}),
  Link: 'Link',
  Stack: { Screen: 'StackScreen' },
}));

vi.mock('@/services/walk-capture', () => ({
  dispatchShot: dispatchSpy,
  // Fail-open contract: a null quality report ("no opinion") must never
  // block the dispatch, and nothing on the shutter path touches the network.
  checkShotQuality: vi.fn(async () => null),
  precheckShot: vi.fn(async () => null),
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
    softDelete: vi.fn(),
    undoDelete: vi.fn(),
    pendingDelete: null,
  }),
}));

const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const HomeScreen = (await import('./index')).default;

function renderHomeElement() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <HomeScreen />
    </QueryClientProvider>
  );
}

function renderHome() {
  return render(renderHomeElement());
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

describe('HomeScreen capture → walk-mode dispatch contract', () => {
  it('hands the picked photo URI to the background dispatch (no navigation)', async () => {
    const view = renderHome();
    const tree = view.toJSON();
    const libraryBtn = findByTestId(tree, 'action-capsule-library');
    expect(libraryBtn).toBeTruthy();

    await act(async () => {
      (libraryBtn!.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(dispatchSpy).toHaveBeenCalledWith(expect.anything(), 'file:///picked-room.jpg');
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('does not dispatch when the picker is cancelled', async () => {
    const picker = await import('expo-image-picker');
    vi.mocked(picker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: true,
      assets: null,
    } as never);
    dispatchSpy.mockClear();

    const view = renderHome();
    const libraryBtn = findByTestId(view.toJSON(), 'action-capsule-library');
    await act(async () => {
      (libraryBtn!.props.onPress as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('surfaces an unreachable server as a visible banner that opens settings', () => {
    serverHealth = 'offline';
    try {
      const view = renderHome();
      const banner = findByTestId(view.toJSON(), 'server-offline-banner');
      expect(banner).toBeTruthy();
      (banner?.props.onPress as () => void)();
      expect(pushSpy).toHaveBeenCalledWith('/settings');
    } finally {
      serverHealth = 'unknown';
    }
  });

  it('shows no banner while health is unknown or online', () => {
    serverHealth = 'online';
    try {
      const view = renderHome();
      expect(findByTestId(view.toJSON(), 'server-offline-banner')).toBeNull();
    } finally {
      serverHealth = 'unknown';
    }
  });

  it('auto-retries failed dispatches when the server comes back online', async () => {
    const { addJob, getJobsStore } = await import('@/stores/jobs.store');
    addJob({
      runId: 'local-1',
      photoUri: 'file:///queued.jpg',
      startedAt: Date.now(),
      roomSessionId: 'room-1',
      status: 'failed',
      itemCount: 0,
      errorCode: 'start_failed',
      reviewed: false,
      advice: null,
    });
    dispatchSpy.mockClear();
    serverHealth = 'offline';
    try {
      const view = renderHome();
      expect(dispatchSpy).not.toHaveBeenCalled();

      serverHealth = 'online';
      await act(async () => {
        view.update(renderHomeElement());
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(dispatchSpy).toHaveBeenCalledWith(expect.anything(), 'file:///queued.jpg', {
        roomSessionId: 'room-1',
      });
      // The dead local job made way for the re-dispatch.
      expect(
        getJobsStore()
          .getState()
          .jobs.some((j) => j.runId === 'local-1'),
      ).toBe(false);
    } finally {
      serverHealth = 'unknown';
      getJobsStore().setState({ jobs: [] });
    }
  });
});
