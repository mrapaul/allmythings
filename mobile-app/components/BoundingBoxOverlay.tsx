import { useColors } from '@/hooks/useColors';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedBox {
  id: string;
  label: string;
  box: BoundingBox;
  included: boolean;
  saved?: boolean;
}

interface BoundingBoxOverlayProps {
  imageWidth: number;
  imageHeight: number;
  viewWidth: number;
  viewHeight: number;
  boxes: DetectedBox[];
  isLoading: boolean;
  /**
   * The one item drawn in full (strong box + label). Every other box is a
   * faint outline so the photo itself stays readable: twenty labels drawn
   * at once on a phone-sized frame hide the very objects they name.
   */
  highlightedId?: string | null;
  /** Tap a box on the photo to make it the highlighted item. */
  onPressBox?: (id: string) => void;
}

export function BoundingBoxOverlay({
  viewWidth,
  viewHeight,
  boxes,
  isLoading,
  highlightedId = null,
  onPressBox,
}: BoundingBoxOverlayProps) {
  const colors = useColors();

  // Boxes carry normalized 0..1 coordinates. The caller is responsible for
  // passing the rendered view size (post-cover/contain layout) so the
  // overlay maps coordinates onto the same pixel grid as the photo.
  const scanLineY = useSharedValue(0);

  useEffect(() => {
    if (isLoading) {
      scanLineY.value = withRepeat(
        withSequence(
          withTiming(viewHeight, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
    }
  }, [isLoading, viewHeight, scanLineY]);

  const scanLineStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: scanLineY.value }],
      opacity: isLoading ? 1 : 0,
    };
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        {!isLoading &&
          boxes.map((box, index) => {
            if (!box.included) return null;
            const x = box.box.x * viewWidth;
            const y = box.box.y * viewHeight;
            const width = box.box.width * viewWidth;
            const height = box.box.height * viewHeight;
            const saved = !!box.saved;
            const stroke = saved ? colors.success : colors.primary;
            const highlighted = highlightedId === box.id;

            return (
              <AnimatedRect
                key={box.id}
                x={x}
                y={y}
                width={width}
                height={height}
                index={index}
                color={stroke}
                strong={highlighted}
                dimmed={highlightedId !== null && !highlighted}
              />
            );
          })}
      </Svg>

      {!isLoading &&
        onPressBox &&
        boxes.map((box) => {
          if (!box.included) return null;
          return (
            <Pressable
              key={`hit-${box.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Highlight ${box.label}`}
              testID={`box-hit-${box.id}`}
              onPress={() => onPressBox(box.id)}
              style={{
                position: 'absolute',
                left: box.box.x * viewWidth,
                top: box.box.y * viewHeight,
                width: box.box.width * viewWidth,
                height: box.box.height * viewHeight,
              }}
            />
          );
        })}

      {!isLoading &&
        boxes.map((box) => {
          if (!box.included || box.id !== highlightedId) return null;
          const x = box.box.x * viewWidth;
          const y = box.box.y * viewHeight;
          const saved = !!box.saved;
          const fill = saved ? colors.success : colors.primary;

          return (
            <AnimatedLabel
              key={`label-${box.id}`}
              x={x}
              y={y}
              label={saved ? `✓ ${box.label}` : box.label}
              index={0}
              color={fill}
              textColor={colors.primaryForeground}
            />
          );
        })}

      {isLoading && (
        <Animated.View
          style={[
            styles.scanLine,
            { backgroundColor: colors.primary, width: viewWidth },
            scanLineStyle,
          ]}
        />
      )}
    </View>
  );
}

const AnimatedRectComponent = Animated.createAnimatedComponent
  ? Animated.createAnimatedComponent(Rect)
  : Rect;

interface AnimatedRectProps {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  color: string;
  strong: boolean;
  /** Another box is highlighted: recede to a faint outline. */
  dimmed: boolean;
}

function AnimatedRect({ x, y, width, height, index, color, strong, dimmed }: AnimatedRectProps) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    const target = dimmed ? 0.35 : strong ? 1 : 0.75;
    opacity.value = withDelay(index * 60, withTiming(target, { duration: 300 }));
  }, [index, opacity, dimmed, strong]);

  const animatedProps = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <AnimatedRectComponent
      x={x}
      y={y}
      width={width}
      height={height}
      stroke={color}
      strokeWidth={strong ? 3 : 1.5}
      fill={color}
      fillOpacity={strong ? 0.18 : 0}
      rx={8}
      ry={8}
      animatedProps={animatedProps as unknown as Record<string, unknown>}
    />
  );
}

interface AnimatedLabelProps {
  x: number;
  y: number;
  label: string;
  index: number;
  color: string;
  textColor: string;
}

function AnimatedLabel({ x, y, label, index, color, textColor }: AnimatedLabelProps) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(index * 150 + 200, withTiming(1, { duration: 300 }));
  }, [index, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: opacity.value }, { translateY: (1 - opacity.value) * 10 }],
  }));

  return (
    <Animated.View
      style={[
        styles.labelContainer,
        {
          left: x + 8,
          top: Math.max(8, y + 8),
          backgroundColor: color,
        },
        style,
      ]}
    >
      <Text style={[styles.labelText, { color: textColor }]}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scanLine: {
    position: 'absolute',
    height: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  labelContainer: {
    position: 'absolute',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  labelText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
});
