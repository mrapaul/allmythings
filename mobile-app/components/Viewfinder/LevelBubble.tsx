import { bubbleOffset, isLevel } from '@/lib/level';
import { StyleSheet, View } from 'react-native';

/**
 * Circular camera level: a bubble that rolls with roll/pitch and turns green
 * when both tilts sit inside the tolerance window. Decorative — the shutter
 * stays fully interactive underneath.
 */

const OK = '#4ade80';

interface LevelBubbleProps {
  /** In-plane rotation from gravity, radians. */
  roll: number;
  /** Forward/backward tilt from gravity, radians. */
  pitch: number;
  /** Outer diameter in px. */
  size?: number;
}

export function LevelBubble({ roll, pitch, size = 44 }: LevelBubbleProps) {
  const track = size / 2 - 7;
  const { dx, dy } = bubbleOffset(roll, pitch, track);
  const level = isLevel(roll, pitch);

  return (
    <View
      style={[styles.track, { width: size, height: size, borderRadius: size / 2 }]}
      pointerEvents="none"
      testID="level-bubble"
    >
      {/* Center reference dot */}
      <View style={styles.centerMark} />
      <View
        style={[
          styles.bubble,
          {
            transform: [{ translateX: dx }, { translateY: dy }],
            backgroundColor: level ? OK : 'rgba(255,255,255,0.85)',
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: 'rgba(20,18,40,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerMark: {
    position: 'absolute',
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  bubble: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
});
