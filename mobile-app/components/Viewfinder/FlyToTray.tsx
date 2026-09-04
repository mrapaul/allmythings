import { useReduceMotion } from '@/hooks/useReduceMotion';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/**
 * The shutter moment made visible: the captured frame shrinks and flies into
 * the capture tray, so the user SEES the photo go somewhere. With reduce
 * motion on, the thumbnail simply fades in at the tray instead of flying.
 */

const FLY_MS = 480;
const START_SIZE = 132;
const END_SIZE = 48;

interface FlyToTrayProps {
  uri: string;
  /** Top-left corner of the tray thumbnail, in screen coordinates. */
  targetX: number;
  targetY: number;
  onDone: () => void;
}

export function FlyToTray({ uri, targetX, targetY, onDone }: FlyToTrayProps) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(0);
  const { width, height } = useWindowDimensions();

  const startX = width / 2 - START_SIZE / 2;
  const startY = height / 2 - START_SIZE / 2;

  useEffect(() => {
    progress.value = withTiming(
      1,
      { duration: reduceMotion ? 260 : FLY_MS, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onDone)();
      },
    );
  }, [progress, reduceMotion, onDone]);

  const style = useAnimatedStyle(() => {
    if (reduceMotion) {
      // Fade fallback: appear at the tray, no travel.
      return {
        left: targetX,
        top: targetY,
        width: END_SIZE,
        height: END_SIZE,
        borderRadius: 12,
        opacity: interpolate(progress.value, [0, 0.6, 1], [0, 1, 0.9]),
      };
    }
    const p = progress.value;
    return {
      left: interpolate(p, [0, 1], [startX, targetX]),
      top: interpolate(p, [0, 1], [startY, targetY]),
      width: interpolate(p, [0, 1], [START_SIZE, END_SIZE]),
      height: interpolate(p, [0, 1], [START_SIZE, END_SIZE]),
      borderRadius: interpolate(p, [0, 1], [16, 12]),
      opacity: interpolate(p, [0, 0.85, 1], [1, 1, 0.85]),
    };
  });

  return (
    <Animated.View style={[styles.flying, style]} pointerEvents="none" testID="fly-to-tray">
      <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flying: {
    position: 'absolute',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    zIndex: 20,
  },
});

export default FlyToTray;
