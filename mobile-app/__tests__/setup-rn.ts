import { vi } from 'vitest';

// React 19 `act()` requires this global flag to be set in the test env.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// React Native's `__DEV__` global. Components branch on it for dev-only UI.
(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;

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

// Reanimated v4 ships RN-only worklet runtime that Vite cannot resolve. The
// shim exposes the surface QuickActionsSheet (and friends) use: a default
// `Animated.View`-style component plus the worklet hooks (which return
// no-op style objects in tests).
vi.mock('react-native-reanimated', () => {
  const View = 'AnimatedView';
  return {
    default: {
      View,
      Text: 'AnimatedText',
      Image: 'AnimatedImage',
      ScrollView: 'AnimatedScrollView',
    },
    Easing: {
      out: (fn: unknown) => fn,
      in: (fn: unknown) => fn,
      inOut: (fn: unknown) => fn,
      cubic: (t: number) => t,
      linear: (t: number) => t,
      bezier: () => (t: number) => t,
    },
    useSharedValue: (initial: number) => ({ value: initial }),
    useAnimatedStyle: (cb: () => Record<string, unknown>) => cb(),
    withTiming: (v: number) => v,
    withSpring: (v: number) => v,
    withDelay: (_d: number, v: number) => v,
    withRepeat: (v: number) => v,
    withSequence: (...vs: unknown[]) => vs[vs.length - 1],
    runOnJS: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
    FadeIn: { delay: () => ({ duration: () => ({}) }), duration: () => ({}) },
    FadeOut: { delay: () => ({ duration: () => ({}) }), duration: () => ({}) },
    Layout: { springify: () => ({ damping: () => ({}) }) },
  };
});

// `react-native-svg` ships native bindings + Flow source. Stub primitives
// used by BoundingBoxOverlay/BoxThumbnail so test renderer can walk the tree.
vi.mock('react-native-svg', () => ({
  default: 'Svg',
  Svg: 'Svg',
  Rect: 'Rect',
  G: 'G',
  Text: 'SvgText',
  Path: 'Path',
  Circle: 'Circle',
  Line: 'Line',
  Polygon: 'Polygon',
  Polyline: 'Polyline',
  Defs: 'Defs',
  ClipPath: 'ClipPath',
  LinearGradient: 'LinearGradient',
  Stop: 'Stop',
}));

// `react-native-gesture-handler` exports `Gesture.Pan()` builders + a
// `GestureDetector` HOC. Tests don't trigger gestures, so a chainable
// no-op surface is enough.
vi.mock('react-native-gesture-handler', () => {
  const builder = () => {
    const proxy: Record<string, unknown> = {};
    const chain = new Proxy(proxy, {
      get: () => () => chain,
    });
    return chain;
  };
  return {
    GestureDetector: ({ children }: { children: unknown }) => children,
    Gesture: { Pan: builder, Tap: builder, LongPress: builder },
    GestureHandlerRootView: 'GestureHandlerRootView',
    Pressable: 'Pressable',
  };
});

// `@shopify/flash-list` requires native bindings (Fabric renderer) that
// Vite/JSDOM can't load. Replace with string-element stand-ins.
vi.mock('@shopify/flash-list', () => ({
  FlashList: 'FlashList',
  MasonryFlashList: 'MasonryFlashList',
}));

// `expo-image` ships ESM that pulls native modules. The string-stub keeps
// snapshots and component trees parseable in tests.
vi.mock('expo-image', () => ({
  Image: 'ExpoImage',
}));

// `expo-image-manipulator` requires `expo-modules-core`'s native event
// emitter at module init. Stub the surface we use for test-time renders.
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: async (uri: string) => ({ uri, width: 1280, height: 960 }),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

// `expo-file-system` needs native bindings; the detection screen only reads
// File(uri).size for the pre-upload quality heuristic. A healthy size keeps
// the QA gate open in tests.
vi.mock('expo-file-system', () => ({
  File: class {
    size = 500_000;
  },
}));

// `expo-constants` pulls in `expo-modules-core`'s native bindings. The
// detection screen + api client read `expoConfig.extra` for base URL/api
// key — empty config returns the localhost defaults.
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}));

// `@sentry/react-native` ships native bindings + RN-only modules. The init
// path is a no-op in tests; `wrap` must be a pass-through so the wrapped
// root component still renders.
vi.mock('@sentry/react-native', () => ({
  init: vi.fn(),
  wrap: <T>(component: T): T => component,
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
