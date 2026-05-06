// Test-only stub for `react-native`. Vite cannot parse RN's Flow-typed source,
// so we alias it to this minimal CommonJS-compatible module for vitest only.

const View = 'View';
const Text = 'Text';
const Pressable = 'Pressable';
const ScrollView = 'ScrollView';
const Image = 'Image';
const TextInput = 'TextInput';

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

const useColorScheme = () => 'light';
const useWindowDimensions = () => ({ width: 375, height: 812, scale: 2, fontScale: 1 });

export {
  View,
  Text,
  Pressable,
  ScrollView,
  Image,
  TextInput,
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
