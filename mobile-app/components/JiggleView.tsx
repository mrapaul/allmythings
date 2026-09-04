import { useReduceMotion } from '@/hooks/useReduceMotion';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Rotation amplitude in degrees — enough to read as "loose", not seasick. */
const WOBBLE_DEGREES = 1.1;
/** One half-cycle. ~150ms gives the iPhone-ish nervous energy. */
const HALF_CYCLE_MS = 150;
/**
 * Per-tile phase offset so the grid doesn't wobble in lockstep. Prime-ish
 * spacing over a small ring keeps neighbouring tiles visibly out of sync.
 */
const PHASE_STEP_MS = 37;
const PHASE_RING = 8;

interface JiggleViewProps {
  /** Enables the wobble; when false the child renders untouched. */
  active: boolean;
  /** Tile position — decides this tile's phase offset. */
  index: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Arrange-mode tile wobble (iPhone home-screen idiom). Honours the OS
 * reduce-motion setting by rendering completely still — the × badges that
 * make the mode usable live outside this component, so nothing is lost.
 */
export function JiggleView({ active, index, children, style }: JiggleViewProps) {
  const rotation = useSharedValue(0);
  const reduceMotion = useReduceMotion();
  const animate = active && !reduceMotion;

  useEffect(() => {
    if (!animate) {
      rotation.value = withTiming(0, { duration: 120 });
      return;
    }
    const phase = (index % PHASE_RING) * PHASE_STEP_MS;
    rotation.value = withDelay(
      phase,
      withRepeat(
        withSequence(
          withTiming(WOBBLE_DEGREES, {
            duration: HALF_CYCLE_MS,
            easing: Easing.inOut(Easing.quad),
          }),
          withTiming(-WOBBLE_DEGREES, {
            duration: HALF_CYCLE_MS,
            easing: Easing.inOut(Easing.quad),
          }),
        ),
        -1,
        true,
      ),
    );
  }, [animate, index, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${rotation.value}deg` }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

export default JiggleView;
