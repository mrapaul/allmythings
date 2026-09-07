import { useReduceMotion } from '@/hooks/useReduceMotion';
import type { CoachHint } from '@/lib/live-coaching';
import { Feather } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/**
 * Capture coaching overlay.
 *
 * Two rules, and they are the whole design:
 *  1. At most ONE hint, never a list. A checklist of everything wrong with a
 *     frame is something to read, not something to act on.
 *  2. When the frame is good, show NOTHING. Positive state lives on the
 *     capture tray (the shot's journey); a free-floating tick here read as
 *     "something happened?" and confused more than it reassured.
 *
 * Raw measurements (focusScore, luma) are never surfaced: they are how the app
 * decides, not how a person frames a photograph.
 */

interface CoachOverlayProps {
  hint: CoachHint | null;
}

export function CoachOverlay({ hint }: CoachOverlayProps) {
  const reduceMotion = useReduceMotion();
  const hintOpacity = useSharedValue(0);

  useEffect(() => {
    const duration = reduceMotion ? 0 : 220;
    hintOpacity.value = withTiming(hint ? 1 : 0, {
      duration,
      easing: Easing.out(Easing.quad),
    });
  }, [hint, reduceMotion, hintOpacity]);

  const hintStyle = useAnimatedStyle(() => ({ opacity: hintOpacity.value }));

  return (
    <View style={styles.wrap} pointerEvents="none">
      {hint && (
        <Animated.View style={[styles.hintPill, hintStyle]} testID="coach-hint">
          <Feather name="info" size={13} color="#ffffff" />
          <Text style={styles.hintText}>{hint.message}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Normal flow, not absolute: the hint and the readiness strip live in the
    // same column and must STACK. Absolute positioning let the pill sit on
    // top of the strip, so the advice and the state were unreadable together.
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'flex-end',
  },
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(20,18,40,0.78)',
  },
  hintText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#ffffff',
    letterSpacing: 0.1,
  },
});

export default CoachOverlay;
