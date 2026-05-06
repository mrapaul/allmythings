import { vi } from 'vitest';

// React Native ships Flow-typed source that Vite cannot parse.
// Provide a minimal mock with the hooks/components our code touches.
vi.mock('react-native', () => {
  const View = 'View';
  const Text = 'Text';
  return {
    useColorScheme: () => 'light',
    useWindowDimensions: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
    StyleSheet: {
      absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
      create: <T extends Record<string, unknown>>(s: T): T => s,
      flatten: (s: unknown) => s,
      hairlineWidth: 1,
    },
    View,
    Text,
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    Image: 'Image',
    Platform: { OS: 'ios', select: <T,>(o: { ios?: T; default?: T }) => o.ios ?? o.default },
  };
});

vi.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

// Some libraries (e.g., react-native-gesture-handler) check for a global `jest`.
(globalThis as unknown as { jest: typeof vi }).jest = vi;
