import { useReduceMotion } from '@/hooks/useReduceMotion';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

/**
 * Spring that settles in ~400ms with one quiet overshoot — the "state
 * changed" pop shared by the queue tile's ready check and the capture
 * reel's status glyphs.
 */
const POP_SPRING = { damping: 13, stiffness: 210, mass: 0.7 };
const POP_FROM = 0.6;

interface AnimatedStatusGlyphProps {
  /**
   * Identity of the state the glyph currently shows. A change replays the
   * pop (spinner → ✓, spinner → ⚠); pass something stable per state.
   */
  stateKey: string | number;
  /** Also pop on first mount — for glyphs that appear in response to an event. */
  popOnMount?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * Wraps a status glyph so its arrival reads as a moment, not a swap: the
 * container springs from 0.6 to 1 whenever the state changes (or on mount
 * with popOnMount). Purely decorative — honours reduce-motion by staying
 * at rest. Loops nothing; the spring is one-shot and cancelled on unmount.
 */
export function AnimatedStatusGlyph({
  stateKey,
  popOnMount = false,
  style,
  children,
}: AnimatedStatusGlyphProps) {
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(popOnMount ? POP_FROM : 1);
  const prevKey = useRef<string | number | null>(null);

  useEffect(() => {
    if (reduceMotion) {
      prevKey.current = stateKey;
      scale.value = 1;
      return;
    }
    const isFirstRun = prevKey.current === null;
    const changed = prevKey.current !== stateKey;
    prevKey.current = stateKey;
    if (!changed && !(isFirstRun && popOnMount)) return;
    scale.value = POP_FROM;
    scale.value = withSpring(1, POP_SPRING);
    return () => cancelAnimation(scale);
  }, [stateKey, popOnMount, reduceMotion, scale]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View testID="animated-status-glyph" style={[style, popStyle]}>
      {children}
    </Animated.View>
  );
}

export default AnimatedStatusGlyph;
