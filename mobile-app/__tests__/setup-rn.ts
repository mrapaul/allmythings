import { vi } from 'vitest';

// React 19 `act()` requires this global flag to be set in the test env.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// `react-native` is aliased to `__tests__/stubs/react-native.ts` via vitest
// config because Vite cannot parse RN's Flow-typed source.

vi.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
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
