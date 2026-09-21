import { useColors } from '@/hooks/useColors';
import type { ScoutState } from '@/lib/scout';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

/**
 * Live scout overlay: predicted item boxes + labels drawn over the viewfinder
 * while a fast single-pass detect runs, in BoundingBoxOverlay's visual
 * language (rounded rect, primary stroke). Fades nothing, intercepts nothing
 * — it is a read-only peek at what the shutter would find. A thin progress
 * bar rides the top edge while scanning; failures hide the whole overlay.
 */

interface ScoutOverlayProps {
  state: ScoutState;
  /** 0..1 while scanning when the scene estimate allows, else null. */
  progress: number | null;
  viewWidth: number;
  viewHeight: number;
}

export function ScoutOverlay({ state, progress, viewWidth, viewHeight }: ScoutOverlayProps) {
  const colors = useColors();
  if (state.status === 'idle' || state.failed) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="scout-overlay">
      <Svg width="100%" height="100%">
        {state.items.map((item) => (
          <Rect
            key={item.id}
            x={item.box.x * viewWidth}
            y={item.box.y * viewHeight}
            width={item.box.width * viewWidth}
            height={item.box.height * viewHeight}
            stroke={colors.primary}
            strokeWidth={1.5}
            fill={colors.primary}
            fillOpacity={0.08}
            rx={8}
            ry={8}
            opacity={0.85}
          />
        ))}
      </Svg>

      {state.items.map((item) => (
        <View
          key={`label-${item.id}`}
          style={[
            styles.label,
            {
              left: item.box.x * viewWidth + 6,
              top: Math.max(6, item.box.y * viewHeight + 6),
              backgroundColor: colors.primary,
            },
          ]}
        >
          <Text style={[styles.labelText, { color: colors.primaryForeground }]}>{item.label}</Text>
        </View>
      ))}

      {state.status === 'scanning' && (
        <View style={styles.progressTrack} testID="scout-progress">
          <View
            style={[
              styles.progressFill,
              // No estimate yet: a small moving-looking segment beats a lie of
              // a full bar.
              progress === null ? { width: '28%' } : { width: `${Math.round(progress * 100)}%` },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    position: 'absolute',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  labelText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  progressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  progressFill: {
    height: 2,
    backgroundColor: '#a78bfa',
  },
});
