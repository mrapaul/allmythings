import type { useColors } from '@/hooks/useColors';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { type DetectionJob, isAutoRetryable, queueProgress } from '@/lib/jobs';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { AnimatedStatusGlyph } from './AnimatedStatusGlyph';

interface QueueTileProps {
  job: DetectionJob;
  /** Position in the queue row; drives the testID. */
  index: number;
  colors: ReturnType<typeof useColors>;
  onPress: (job: DetectionJob) => void;
}

/**
 * First-class home-grid tile for an in-flight or failed capture job. Running
 * jobs wear a progress ring over the photo — a determinate arc once the
 * server has streamed counts, a smoothly rotating arc until then; failed
 * jobs are dimmed with a warning badge and a breathing retry countdown.
 * A just-ready job lingers as a ghost for one spring check-pop before the
 * grid hands it to the inbox. Tapping opens the job's detection screen,
 * which already owns retry/rerun handling.
 */

const RING_SIZE = 36;
const RING_R = 15;
/** Full circumference of the determinate ring. */
const RING_CIRC = 2 * Math.PI * RING_R;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Spinner replacement: a partial arc spinning at constant speed, no stutter. */
function IndeterminateArc({ color }: { color: string }) {
  const reduceMotion = useReduceMotion();
  const rotation = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    rotation.value = withRepeat(
      withTiming(360, { duration: 1_100, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(rotation);
  }, [reduceMotion, rotation]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotateZ: `${rotation.value}deg` }] }));
  return (
    <Animated.View style={spinStyle}>
      <View style={[styles.arc, { borderTopColor: color, borderRightColor: color }]} />
    </Animated.View>
  );
}

/** Determinate ring: fraction of the scene estimate, with the count inside. */
function DeterminateRing({
  progress,
  count,
  color,
}: {
  progress: number;
  count: number;
  color: string;
}) {
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(progress, { duration: 500, easing: Easing.out(Easing.quad) });
    return () => cancelAnimation(fill);
  }, [progress, fill]);
  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRC * (1 - fill.value),
  }));
  return (
    <>
      <Svg width={RING_SIZE - 4} height={RING_SIZE - 4}>
        <Circle
          cx={(RING_SIZE - 4) / 2}
          cy={(RING_SIZE - 4) / 2}
          r={RING_R}
          stroke={color}
          strokeOpacity={0.18}
          strokeWidth={3}
          fill="none"
        />
        <AnimatedCircle
          cx={(RING_SIZE - 4) / 2}
          cy={(RING_SIZE - 4) / 2}
          r={RING_R}
          stroke={color}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={RING_CIRC}
          animatedProps={arcProps}
          transform={`rotate(-90, ${(RING_SIZE - 4) / 2}, ${(RING_SIZE - 4) / 2})`}
        />
      </Svg>
      <Text style={styles.ringCount}>{count}</Text>
    </>
  );
}

export function QueueTile({ job, index, colors, onPress }: QueueTileProps) {
  const reduceMotion = useReduceMotion();
  const failed = job.status === 'failed';
  const ready = job.status === 'ready';
  const progress = !failed && !ready ? queueProgress(job) : null;
  const retryAt =
    failed && isAutoRetryable(job) && job.nextRetryAt != null ? job.nextRetryAt : null;

  // Failed tiles nudge for attention once, then rest. The sequence is
  // cancelled on unmount so a removed tile can't keep wobbling.
  const shakeX = useSharedValue(0);
  useEffect(() => {
    if (!failed || reduceMotion) return;
    shakeX.value = withSequence(
      withTiming(-4, { duration: 70, easing: Easing.out(Easing.quad) }),
      withTiming(4, { duration: 130, easing: Easing.inOut(Easing.quad) }),
      withTiming(-3, { duration: 130, easing: Easing.inOut(Easing.quad) }),
      withTiming(3, { duration: 110, easing: Easing.inOut(Easing.quad) }),
      withTiming(-2, { duration: 100, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 90, easing: Easing.out(Easing.quad) }),
    );
    return () => cancelAnimation(shakeX);
  }, [failed, reduceMotion, shakeX]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  // Retry countdown clock: only failed jobs on the auto-retry ladder carry
  // a nextRetryAt, so the timer exists solely for them. One shot at the
  // deadline — the ladder re-dispatch removes the tile; no interval needed.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (retryAt == null) return;
    const delay = retryAt - Date.now();
    if (delay <= 0) return; // due now — the re-dispatch tick is imminent
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [retryAt]);
  const retrySeconds = retryAt == null ? 0 : Math.max(1, Math.ceil((retryAt - now) / 1_000));

  // The countdown breathes so the tile reads as "working on it", not stuck.
  const breath = useSharedValue(1);
  useEffect(() => {
    if (retryAt == null || reduceMotion) return;
    breath.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
    return () => cancelAnimation(breath);
  }, [retryAt, reduceMotion, breath]);
  const breathStyle = useAnimatedStyle(() => ({ opacity: breath.value }));

  // The ready ghost gets one soft success glow behind the check as it pops.
  const glow = useSharedValue(0);
  useEffect(() => {
    if (!ready || reduceMotion) return;
    glow.value = withSequence(
      withTiming(0.6, { duration: 220, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 650, easing: Easing.inOut(Easing.quad) }),
    );
    return () => cancelAnimation(glow);
  }, [ready, reduceMotion, glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  const accessibilityLabel = failed
    ? 'Photo failed — open to retry'
    : ready
      ? 'Scan ready — open to review'
      : 'Photo being cataloged';

  return (
    <Animated.View style={[styles.tileWrap, shakeStyle]}>
      <Pressable
        testID={`queue-tile-${index}`}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={
          failed
            ? 'Opens this photo with retry options'
            : 'Opens this photo’s live detection progress'
        }
        {...(progress != null
          ? { accessibilityValue: { min: 0, max: 100, now: Math.round(progress * 100) } }
          : {})}
        onPress={() => onPress(job)}
        style={({ pressed }) => [
          styles.card,
          {
            borderColor: failed ? colors.destructive : colors.border,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Image source={job.photoUri} style={StyleSheet.absoluteFill} contentFit="cover" />
        {failed ? (
          <>
            <View style={styles.dim} pointerEvents="none" />
            <View
              testID={`queue-tile-warning-${index}`}
              style={[styles.warningBadge, { backgroundColor: colors.destructive }]}
            >
              <Feather name="alert-triangle" size={13} color={colors.destructiveForeground} />
            </View>
            {retryAt != null && (
              <Animated.View style={[styles.retryPill, breathStyle]} pointerEvents="none">
                <Text style={styles.retryPillText}>{`Retry in ${retrySeconds}s`}</Text>
              </Animated.View>
            )}
          </>
        ) : ready ? (
          <View style={styles.ringOverlay} pointerEvents="none">
            <Animated.View
              style={[styles.readyGlow, { backgroundColor: colors.success }, glowStyle]}
            />
            <AnimatedStatusGlyph
              popOnMount
              stateKey="ready"
              style={[styles.spinnerRing, { borderColor: colors.success }]}
            >
              <Feather name="check" size={16} color={colors.success} />
            </AnimatedStatusGlyph>
          </View>
        ) : (
          <View style={styles.ringOverlay} pointerEvents="none">
            {progress != null ? (
              <View
                testID={`queue-tile-progress-${index}`}
                style={[styles.spinnerRing, styles.progressRing]}
              >
                <DeterminateRing
                  progress={progress}
                  count={job.progressItems ?? 0}
                  color={colors.primary}
                />
              </View>
            ) : (
              <View
                testID={`queue-tile-spinner-${index}`}
                style={[styles.spinnerRing, { borderColor: colors.primary }]}
              >
                <IndeterminateArc color={colors.primary} />
              </View>
            )}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tileWrap: { flex: 1 },
  card: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 27, 63, 0.45)',
  },
  warningBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  retryPill: {
    position: 'absolute',
    bottom: 6,
    alignSelf: 'center',
    paddingHorizontal: 7,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 18, 40, 0.6)',
  },
  retryPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    letterSpacing: 0.3,
    color: '#ffffff',
  },
  ringOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  spinnerRing: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  // The determinate ring draws its own track; the container border would
  // double it, so it stays bare.
  progressRing: {
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  arc: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.5,
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  ringCount: {
    position: 'absolute',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: '#1c1b3f',
  },
  readyGlow: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
  },
});

export default QueueTile;
