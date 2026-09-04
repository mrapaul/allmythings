// Test-only stub for `react-native`. Vite cannot parse RN's Flow-typed source,
// so we alias it to this minimal CommonJS-compatible module for vitest only.

const View = 'View';
const Text = 'Text';
const Pressable = 'Pressable';
const ScrollView = 'ScrollView';
const Image = 'Image';
const TextInput = 'TextInput';
const TouchableOpacity = 'TouchableOpacity';
const Modal = 'Modal';
const ActivityIndicator = 'ActivityIndicator';
const Alert = { alert: (..._args: unknown[]) => undefined };

// Minimal `Animated` stand-in for tests. Spring/timing/parallel calls just
// invoke the start callback synchronously; values never actually animate.
type AnimStart = { start: (cb?: (r?: { finished: boolean }) => void) => void };
const noopAnim = (): AnimStart => ({
  start: (cb) => cb?.({ finished: true }),
});
// `new Animated.Value(initial)` — initial is accepted but ignored.
class AnimatedValue {
  constructor(...args: unknown[]) {
    void args;
  }
  setValue() {
    /* noop */
  }
}
const Animated = {
  View: 'AnimatedView',
  Text: 'AnimatedText',
  Image: 'AnimatedImage',
  ScrollView: 'AnimatedScrollView',
  Value: AnimatedValue,
  spring: (_v: unknown, _cfg: unknown): AnimStart => noopAnim(),
  timing: (_v: unknown, _cfg: unknown): AnimStart => noopAnim(),
  parallel: (anims: AnimStart[]): AnimStart => ({
    start: (cb) => {
      for (const a of anims) a.start();
      cb?.({ finished: true });
    },
  }),
  sequence: (anims: AnimStart[]): AnimStart => ({
    start: (cb) => {
      for (const a of anims) a.start();
      cb?.({ finished: true });
    },
  }),
};

const StyleSheet = {
  absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  create: <T extends Record<string, unknown>>(s: T): T => s,
  flatten: (s: unknown) => s,
  hairlineWidth: 1,
  compose: (a: unknown, b: unknown) => [a, b],
};

const Platform = {
  OS: 'ios' as const,
  select: <T>(o: { ios?: T; android?: T; default?: T }) => o.ios ?? o.default,
  Version: 14,
};

const Dimensions = {
  get: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
  addEventListener: () => ({ remove: () => undefined }),
};

// Draw-to-teach uses PanResponder; tests only need the handlers object shape.
const PanResponder = {
  create: (config: Record<string, unknown>) => ({ panHandlers: config }),
};

// Detection auto-retry listens for foreground transitions.
const AppState = {
  currentState: 'active' as const,
  addEventListener: (_type: string, _cb: (state: string) => void) => ({
    remove: () => undefined,
  }),
};

// Arrange mode reads the reduce-motion setting before animating tiles.
// Default false so tests exercise the animated path; individual tests can
// override this mock when they need the reduced-motion branch.
const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(false),
  addEventListener: (_type: string, _cb: (value: boolean) => void) => ({
    remove: () => undefined,
  }),
};

// Arrange mode exits on the Android system back gesture.
const BackHandler = {
  addEventListener: (_type: string, _cb: () => boolean) => ({ remove: () => undefined }),
};

const useColorScheme = () => 'light';
const useWindowDimensions = () => ({ width: 375, height: 812, scale: 2, fontScale: 1 });

export {
  View,
  Text,
  Pressable,
  ScrollView,
  Image,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  Animated,
  AppState,
  BackHandler,
  PanResponder,
  StyleSheet,
  Platform,
  Dimensions,
  useColorScheme,
  useWindowDimensions,
};

// Type re-exports to keep TS-using tests happy (we don't want to actually be
// imported by app code; tsconfig will resolve `react-native` from node_modules).
export type ViewStyle = Record<string, unknown>;
export type TextStyle = Record<string, unknown>;
export type StyleProp<_T> = unknown;
