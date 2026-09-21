import { centerCross, thirdsLines } from '@/lib/grid-geometry';
import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

/**
 * Rule-of-thirds viewfinder grid: four third-lines plus a subtle center
 * cross. Purely decorative — pointerEvents are disabled so touches fall
 * through to the camera gestures underneath.
 */

interface GridOverlayProps {
  width: number;
  height: number;
}

const GRID_COLOR = 'rgba(255,255,255,0.22)';
const CROSS_COLOR = 'rgba(255,255,255,0.38)';

export function GridOverlay({ width, height }: GridOverlayProps) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap]} pointerEvents="none" testID="grid-overlay">
      <Svg width="100%" height="100%">
        {thirdsLines(width, height).map((l) => (
          <Line
            key={`third-${l.x1}-${l.y1}`}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke={GRID_COLOR}
            strokeWidth={1}
          />
        ))}
        {centerCross(width, height).map((l) => (
          <Line
            key={`cross-${l.x1}-${l.y1}`}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke={CROSS_COLOR}
            strokeWidth={1.5}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'stretch', justifyContent: 'center' },
});
