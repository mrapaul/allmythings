import { useColors } from '@/hooks/useColors';
import { Image } from 'expo-image';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

type Props = {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  box: { x: number; y: number; width: number; height: number };
  size: number;
  borderColor?: string;
  dimmed?: boolean;
  style?: ViewStyle;
};

export function BoxThumbnail({
  uri,
  imageWidth,
  imageHeight,
  box,
  size,
  borderColor,
  dimmed = false,
  style,
}: Props) {
  const colors = useColors();

  const safeW = imageWidth > 0 ? imageWidth : 1;
  const safeH = imageHeight > 0 ? imageHeight : 1;
  const imgAspect = safeW / safeH;

  let renderW: number;
  let renderH: number;
  let offsetX: number;
  let offsetY: number;

  if (imgAspect > 1) {
    renderH = size;
    renderW = size * imgAspect;
    offsetX = (size - renderW) / 2;
    offsetY = 0;
  } else {
    renderW = size;
    renderH = size / imgAspect;
    offsetX = 0;
    offsetY = (size - renderH) / 2;
  }

  const bx = offsetX + box.x * renderW;
  const by = offsetY + box.y * renderH;
  const bw = box.width * renderW;
  const bh = box.height * renderH;

  const strokeColor = borderColor ?? colors.primary;

  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          backgroundColor: colors.muted,
          borderColor: borderColor ?? colors.border,
        },
        style,
      ]}
    >
      <Image
        source={uri}
        style={[
          {
            position: 'absolute',
            width: renderW,
            height: renderH,
            left: offsetX,
            top: offsetY,
            opacity: dimmed ? 0.55 : 1,
          },
        ]}
        contentFit="fill"
        transition={180}
        cachePolicy="memory-disk"
      />
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={StyleSheet.absoluteFill}
      >
        <Rect
          x={bx}
          y={by}
          width={bw}
          height={bh}
          stroke={strokeColor}
          strokeWidth={2}
          fill={`${strokeColor}18`}
          rx={3}
          ry={3}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
  },
});
