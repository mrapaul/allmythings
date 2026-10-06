import { useReduceMotion } from '@/hooks/useReduceMotion';
import { MAX_REEL_FRAMES, type QueueShot, shotStatusLine } from '@/lib/capture-queue';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOut, LinearTransition } from 'react-native-reanimated';
import { AnimatedStatusGlyph } from '../AnimatedStatusGlyph';

/**
 * The shot strip: a full-width row above the shutter, the way messaging
 * cameras show what you have taken. Every shot lands here as a thumbnail
 * with its own state (sending, processing, done with a count, saved for
 * retry), newest at the right. A leading chip sums it up and the whole strip
 * is one tap to the review inbox. Silent until the first shot: an empty
 * strip is a question, not an answer.
 */

interface CaptureReelProps {
  /** In-flight and lingering shots, oldest first (the lib's queue order). */
  shots: QueueShot[];
  /** Clock for the staged processing copy. */
  now: number;
  /** Completed-and-unreviewed runs waiting in the inbox. */
  readyCount: number;
  /** Shots taken this session, for the summary chip. */
  shotCount?: number;
  onPress: () => void;
}

export function CaptureReel({ shots, now, readyCount, shotCount = 0, onPress }: CaptureReelProps) {
  const reduceMotion = useReduceMotion();
  const visible = shots.slice(-MAX_REEL_FRAMES);
  const hiddenCount = shots.length - visible.length;
  const frameAnim = reduceMotion
    ? {}
    : {
        // New shots slide up into the strip, from where the shutter lives.
        entering: FadeInUp.duration(220),
        exiting: FadeOut.duration(180),
        layout: LinearTransition,
      };

  if (visible.length === 0 && readyCount === 0) return null;

  const summary =
    readyCount > 0
      ? `${readyCount} ready · tap to review`
      : `${shotCount || shots.length} shot${(shotCount || shots.length) === 1 ? '' : 's'} · cataloguing`;

  return (
    <Pressable
      testID="capture-reel"
      accessibilityLabel={
        readyCount > 0
          ? `Shot strip — ${readyCount} ready to review`
          : 'Shot strip — your shots are catalogued in the background'
      }
      onPress={onPress}
      style={({ pressed }) => [styles.strip, { opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={styles.summaryRow}>
        <View testID={readyCount > 0 ? 'reel-ready-chip' : 'reel-summary-chip'} style={styles.chip}>
          <Feather
            name={readyCount > 0 ? 'check' : 'loader'}
            size={12}
            color={readyCount > 0 ? '#8EF0C0' : 'rgba(255,255,255,0.85)'}
          />
          <Text style={styles.chipText}>{summary}</Text>
        </View>
        {hiddenCount > 0 && (
          <View style={styles.overflowChip} testID="reel-overflow">
            <Text style={styles.overflowText}>+{hiddenCount}</Text>
          </View>
        )}
      </View>

      <View style={styles.thumbRow}>
        {visible.map((shot) => (
          <Animated.View key={shot.key} testID="reel-frame" {...frameAnim} style={styles.frame}>
            <View style={styles.thumbFrame}>
              <Image source={shot.uri} style={styles.thumb} contentFit="cover" />
              {/* The glyph pops (scale 0.6→1 spring) whenever the phase
                  flips — spinner → ✓ / ⚠ reads as a moment, not a swap. */}
              <AnimatedStatusGlyph stateKey={shot.phase} style={styles.statusDotWrap}>
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
              </AnimatedStatusGlyph>
            </View>
            <Text style={[styles.statusLine, lineStyle(shot)]} numberOfLines={1}>
              {shotStatusLine(shot, now)}
            </Text>
          </Animated.View>
        ))}
      </View>
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

const THUMB = 52;

const styles = StyleSheet.create({
  strip: {
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(20,18,40,0.62)',
  },
  chipText: {
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
  thumbRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  frame: {
    width: THUMB + 16,
    alignItems: 'center',
    gap: 4,
  },
  thumbFrame: {
    width: THUMB,
    height: THUMB,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(20,18,40,0.5)',
    overflow: 'visible',
  },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: 10.5,
  },
  statusDotWrap: {
    position: 'absolute',
    right: -5,
    bottom: -5,
  },
  statusDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.35)',
  },
  dotBusy: { backgroundColor: 'rgba(20,18,40,0.85)' },
  dotDone: { backgroundColor: '#1FA46A' },
  dotFailed: { backgroundColor: '#C77D1E' },
  statusLine: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.2,
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  lineDone: { color: '#A9F2CF' },
  lineFailed: { color: '#F5C97B' },
});

export default CaptureReel;
