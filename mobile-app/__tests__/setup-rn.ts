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
    interpolate: (_v: number, _input: number[], output: number[]) => output[output.length - 1],
    withTiming: (v: number) => v,
    withSpring: (v: number) => v,
    withDelay: (_d: number, v: number) => v,
    withRepeat: (v: number) => v,
    withSequence: (...vs: unknown[]) => vs[vs.length - 1],
    runOnJS: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
    FadeIn: { delay: () => ({ duration: () => ({}) }), duration: () => ({}) },
    FadeInDown: { delay: () => ({ duration: () => ({}) }), duration: () => ({}) },
    FadeOut: { delay: () => ({ duration: () => ({}) }), duration: () => ({}) },
    Layout: { springify: () => ({ damping: () => ({}) }) },
    LinearTransition: { springify: () => ({ damping: () => ({}) }), duration: () => ({}) },
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
    Gesture: { Pan: builder, Tap: builder, LongPress: builder, Pinch: builder },
    GestureHandlerRootView: 'GestureHandlerRootView',
    Pressable: 'Pressable',
  };
});

// `@shopify/flash-list` requires native bindings (Fabric renderer) that
// Vite/JSDOM can't load. The stub renders the same `FlashList` host element
// as before, but actually invokes `renderItem` for each row so tile-level
// behaviour (arrange mode, badges, presses) is testable. Header and empty
// components are honoured to match the real list's contract.
vi.mock('@shopify/flash-list', async () => {
  const { createElement } = await import('react');
  type ListProps<T> = {
    data?: readonly T[];
    renderItem?: (info: { item: T; index: number }) => React.ReactNode;
    keyExtractor?: (item: T, index: number) => string;
    ListEmptyComponent?: React.ReactNode;
    ListHeaderComponent?: React.ReactNode;
  };
  const FlashList = <T>(props: ListProps<T>) => {
    const data = props.data ?? [];
    const children: unknown[] = [];
    if (props.ListHeaderComponent) {
      children.push(createElement('FlashListHeader', { key: 'header' }, props.ListHeaderComponent));
    }
    data.forEach((item, index) => {
      children.push(
        createElement(
          'FlashListItem',
          { key: props.keyExtractor?.(item, index) ?? String(index) },
          props.renderItem?.({ item, index }) as never,
        ),
      );
    });
    if (data.length === 0 && props.ListEmptyComponent) {
      children.push(createElement('FlashListEmpty', { key: 'empty' }, props.ListEmptyComponent));
    }
    return createElement('FlashList', null, children as never);
  };
  return { FlashList, MasonryFlashList: FlashList };
});

// `expo-image` ships ESM that pulls native modules. The stub renders the
// same `ExpoImage` host element as the old string-stub (keeping snapshots
// and component trees parseable) while also exposing the static
// `Image.loadAsync` surface the detection screen's EXIF-safe decode uses.
vi.mock('expo-image', async () => {
  const { createElement } = await import('react');
  const Image = Object.assign(
    (props: Record<string, unknown>) => createElement('ExpoImage', props),
    {
      loadAsync: async () => ({
        width: 1280,
        height: 960,
        release: () => undefined,
      }),
    },
  );
  return { Image };
});

// `expo-image-manipulator` requires `expo-modules-core`'s native event
// emitter at module init. Stub the surface we use for test-time renders:
// the legacy `manipulateAsync` and the contextual
// `ImageManipulator.manipulate(...).resize(...).renderAsync()` chain.
vi.mock('expo-image-manipulator', () => {
  class MockManipulatorContext {
    resize() {
      return this;
    }
    crop() {
      return this;
    }
    async renderAsync() {
      return {
        width: 1280,
        height: 960,
        saveAsync: async () => ({ uri: 'file:///processed.jpg', width: 1280, height: 960 }),
        release: () => undefined,
      };
    }
  }
  return {
    manipulateAsync: async (uri: string) => ({ uri, width: 1280, height: 960 }),
    ImageManipulator: { manipulate: () => new MockManipulatorContext() },
    SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  };
});

// `expo-image-picker` reaches into `expo-modules-core` native bindings at
// import time. Stub the surface the screens touch; individual test files
// override with richer mocks where a flow depends on picker results.
vi.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: async () => ({ granted: false }),
  getCameraPermissionsAsync: async () => ({ granted: false }),
  requestMediaLibraryPermissionsAsync: async () => ({ granted: false }),
  launchCameraAsync: async () => ({ canceled: true, assets: [] }),
  launchImageLibraryAsync: async () => ({ canceled: true, assets: [] }),
}));

// `expo-camera` is a native module (viewfinder + takePictureAsync). The stub
// renders a host element and reports permission granted so the capture screen
// can be exercised without a camera.
vi.mock('expo-camera', async () => {
  const { createElement, forwardRef } = await import('react');
  const CameraView = forwardRef((props: Record<string, unknown>, _ref) =>
    createElement('CameraView', props),
  );
  return {
    CameraView,
    useCameraPermissions: () => [{ granted: true }, async () => ({ granted: true })],
  };
});

// `expo-sensors` reads the accelerometer for motion coaching. The stub never
// emits, so tests see the "no motion signal" path.
vi.mock('expo-sensors', () => ({
  Accelerometer: {
    setUpdateInterval: () => undefined,
    addListener: () => ({ remove: () => undefined }),
    removeAllListeners: () => undefined,
  },
}));

// `expo-file-system` needs native bindings. Nothing imports the modern `File`
// API statically any more (the byte-size quality heuristic that used it was
// replaced by real pixel analysis), but the mock stays because the module is
// still reachable and would pull native bindings if anything imports it.
// The `/legacy` subpath used for file writes/deletes is required lazily at
// call time, so it never loads under test.
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

// `expo-notifications` needs native bindings + the modules core event emitter.
// The stub grants nothing by default (ensurePermissions drives the request
// path); individual test files override with spies where behaviour matters.
vi.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => ({ granted: false, canAskAgain: true, status: 'undetermined' }),
  requestPermissionsAsync: async () => ({ granted: true, canAskAgain: true, status: 'granted' }),
  scheduleNotificationAsync: async () => 'notification-id',
  setNotificationHandler: () => undefined,
  addNotificationResponseReceivedListener: () => ({ remove: () => undefined }),
}));

// Background poll registration is a no-op in tests; behaviour tests mock the
// surface with spies (see services/background-poll.test.ts).
vi.mock('expo-background-fetch', () => ({
  registerTaskAsync: async () => undefined,
  unregisterTaskAsync: async () => undefined,
  getStatusAsync: async () => 3, // BackgroundFetchStatus.Available
  BackgroundFetchStatus: { Denied: 1, Restricted: 2, Available: 3 },
  BackgroundFetchResult: { NoData: 1, NewData: 2, Failed: 3 },
}));

vi.mock('expo-task-manager', () => ({
  defineTask: () => undefined,
  isTaskDefined: () => true,
  isTaskRegisteredAsync: async () => false,
  unregisterTaskAsync: async () => undefined,
}));

vi.mock('expo-router', () => ({
  router: {
    push: () => undefined,
    replace: () => undefined,
    back: () => undefined,
  },
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
