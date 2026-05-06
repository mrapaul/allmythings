import { vi } from 'vitest';

// React 19 `act()` requires this global flag to be set in the test env.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// `react-native` is aliased to `__tests__/stubs/react-native.ts` via vitest
// config because Vite cannot parse RN's Flow-typed source.

vi.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

vi.mock('expo-haptics', () => ({
  selectionAsync: () => Promise.resolve(),
  impactAsync: () => Promise.resolve(),
  notificationAsync: () => Promise.resolve(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  SafeAreaView: 'SafeAreaView',
}));

vi.mock('react-native-keyboard-controller', () => ({
  KeyboardAwareScrollView: 'KeyboardAwareScrollView',
  KeyboardProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock('expo', () => ({
  reloadAppAsync: () => Promise.resolve(),
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    back: () => undefined,
  }),
  useLocalSearchParams: () => ({}),
  Link: 'Link',
  Stack: { Screen: 'StackScreen' },
}));

// `@testing-library/react-native` ships CJS that pulls in the real
// `react-native` package via `require()` (which Vite's import-analysis
// cannot rewrite, so the Flow-typed RN entry is parsed and explodes).
// Replace it with a thin adapter over `react-test-renderer` that mirrors
// the API surface we use in tests.
vi.mock('@testing-library/react-native', async () => {
  const TestRenderer = (await import('react-test-renderer')) as unknown as {
    create: (el: unknown) => {
      toJSON: () => unknown;
      root: unknown;
      unmount: () => void;
      update: (el: unknown) => void;
    };
    act: (cb: () => void) => unknown;
  };
  return {
    render(element: unknown) {
      let instance!: ReturnType<typeof TestRenderer.create>;
      const result = TestRenderer.act(() => {
        instance = TestRenderer.create(element);
      });
      // React 19 returns a thenable from `act`; await synchronously is fine
      // here because `create` resolves on the same tick for non-async trees.
      void result;
      return {
        toJSON: () => instance.toJSON(),
        get root() {
          return instance.root;
        },
        unmount: () => instance.unmount(),
        update: (next: unknown) => instance.update(next),
      };
    },
    act: TestRenderer.act,
  };
});

// Some libraries (e.g., react-native-gesture-handler) check for a global `jest`.
(globalThis as unknown as { jest: typeof vi }).jest = vi;
