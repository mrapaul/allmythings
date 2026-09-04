import { useReduceMotion } from '@/hooks/useReduceMotion';
import { MAX_REEL_FRAMES, type QueueShot, shotStatusLine } from '@/lib/capture-queue';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

/**
 * The capture reel: a floating vertical film strip where shots visibly land.
 * Each frame is one shot with its own live status beside it — the whole
 * queue narrated at a glance, newest at the bottom (where the fly-in
 * animation delivers the frame), growing upward as the user keeps walking.
 * Resolved frames fade off the reel; the ready chip on top accumulates
 * what's waiting in the inbox. Tapping anywhere on the reel opens it.
 */

interface CaptureReelProps {
  /** In-flight and lingering shots, oldest first (the lib's queue order). */
  shots: QueueShot[];
  /** Clock for the staged processing copy. */
  now: number;
  /** Completed-and-unreviewed runs waiting in the inbox. */
  readyCount: number;
  onPress: () => void;
}

export function CaptureReel({ shots, now, readyCount, onPress }: CaptureReelProps) {
  const reduceMotion = useReduceMotion();
  const visible = shots.slice(-MAX_REEL_FRAMES);
  const hiddenCount = shots.length - visible.length;
  // exactOptionalPropertyTypes: animation props are spread in, never
  // passed as explicit undefined.
  const frameAnim = reduceMotion
    ? {}
    : {
        entering: FadeInDown.duration(220),
        exiting: FadeOut.duration(180),
        layout: LinearTransition,
      };
  const chipAnim = reduceMotion ? {} : { layout: LinearTransition };

  if (visible.length === 0 && readyCount === 0) return null;

  return (
    <Pressable
      testID="capture-reel"
      accessibilityLabel={
        readyCount > 0
          ? `Shot queue — ${readyCount} ready to review`
          : 'Shot queue — your shots process here'
      }
      onPress={onPress}
      style={({ pressed }) => [styles.reel, { opacity: pressed ? 0.85 : 1 }]}
    >
      {readyCount > 0 && (
        <Animated.View testID="reel-ready-chip" {...chipAnim} style={styles.readyChip}>
          <Feather name="check" size={12} color="#8EF0C0" />
          <Text style={styles.readyChipText}>{readyCount} ready · review</Text>
        </Animated.View>
      )}

      {hiddenCount > 0 && (
        <View style={styles.overflowChip} testID="reel-overflow">
          <Text style={styles.overflowText}>+{hiddenCount}</Text>
        </View>
      )}

      {visible.map((shot) => (
        <Animated.View key={shot.key} testID="reel-frame" {...frameAnim} style={styles.frameRow}>
          <View style={styles.thumbFrame}>
            <Image source={shot.uri} style={styles.thumb} contentFit="cover" />
            <View style={[styles.statusDot, dotStyle(shot)]}>
              {shot.phase === 'sending' || shot.phase === 'processing' ? (
                <ActivityIndicator size={9} color="#ffffff" />
              ) : (
                <Feather
                  name={shot.phase === 'done' ? 'check' : 'alert-circle'}
                  size={10}
                  color="#ffffff"
                />
              )}
            </View>
          </View>
          <Text style={[styles.statusLine, lineStyle(shot)]} numberOfLines={1}>
            {shotStatusLine(shot, now)}
          </Text>
        </Animated.View>
      ))}
    </Pressable>
  );
}

function dotStyle(shot: QueueShot) {
  if (shot.phase === 'done') return styles.dotDone;
  if (shot.phase === 'failed') return styles.dotFailed;
  return styles.dotBusy;
}

function lineStyle(shot: QueueShot) {
  if (shot.phase === 'done') return styles.lineDone;
  if (shot.phase === 'failed') return styles.lineFailed;
  return null;
}

const THUMB = 44;

const styles = StyleSheet.create({
  reel: {
    alignItems: 'flex-start',
    gap: 8,
    maxWidth: 210,
  },
  readyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(20,18,40,0.62)',
    marginBottom: 2,
  },
  readyChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.2,
    color: 'rgba(255,255,255,0.95)',
  },
  overflowChip: {
    paddingHorizontal: 8,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    backgroundColor: 'rgba(20,18,40,0.55)',
  },
  overflowText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: 'rgba(255,255,255,0.8)',
  },
  frameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  thumbFrame: {
    width: THUMB,
    height: THUMB,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(20,18,40,0.5)',
    overflow: 'visible',
  },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: 9.5,
  },
  statusDot: {
    position: 'absolute',
    right: -5,
    bottom: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.35)',
  },
  dotBusy: {
    backgroundColor: 'rgba(20,18,40,0.85)',
  },
  dotDone: {
    backgroundColor: '#1FA46A',
  },
  dotFailed: {
    backgroundColor: '#C77D1E',
  },
  statusLine: {
    flexShrink: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.2,
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  lineDone: {
    color: '#A9F2CF',
  },
  lineFailed: {
    color: '#F5C97B',
  },
});

export default CaptureReel;
