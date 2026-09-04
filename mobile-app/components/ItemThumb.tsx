import { useColors } from '@/hooks/useColors';
import { bboxZoomLayout, isDetectedBox } from '@/lib/bbox-layout';
import type { BoundingBox } from '@/types/inventory';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

interface ItemThumbProps {
  uri: string;
  box: BoundingBox;
  /**
   * Pre-rendered per-item crop generated at save time. When present it is
   * rendered directly (sharp, no measurement/transform pass); the bbox-zoom
   * transform below remains the fallback for legacy items.
   */
  thumbnailUri?: string | null | undefined;
  style?: StyleProp<ViewStyle>;
}

interface Dims {
  width: number;
  height: number;
}

/**
 * Item thumbnail that zooms the source photo onto the item's detected
 * region (with context padding) so each tile shows its own item rather
 * than the shared source frame. Falls back to a plain cover fit until the
 * frame/natural dimensions are measured, or when the box carries no
 * localization signal.
 */
export function ItemThumb({ uri, box, thumbnailUri, style }: ItemThumbProps) {
  const colors = useColors();
  const [frame, setFrame] = useState<Dims | null>(null);
  const [natural, setNatural] = useState<Dims | null>(null);

  // Manually added items may have no photo at all — show a quiet placeholder
  // instead of an empty frame.
  if (!thumbnailUri && !uri) {
    return (
      <View style={[styles.frame, styles.placeholder, { backgroundColor: colors.muted }, style]}>
        <Feather name="box" size={22} color={colors.mutedForeground} />
      </View>
    );
  }

  if (thumbnailUri) {
    return (
      <View style={[styles.frame, style]}>
        <Image
          source={thumbnailUri}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={250}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  }

  const layout =
    frame && natural && isDetectedBox(box)
      ? bboxZoomLayout(frame.width, frame.height, natural.width, natural.height, box)
      : null;

  return (
    <View
      style={[styles.frame, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) {
          setFrame((prev) =>
            prev && prev.width === width && prev.height === height ? prev : { width, height },
          );
        }
      }}
    >
      <Image
        source={uri}
        contentFit={layout ? 'fill' : 'cover'}
        cachePolicy="memory-disk"
        transition={250}
        style={
          layout
            ? {
                position: 'absolute',
                left: layout.offsetX,
                top: layout.offsetY,
                width: layout.renderWidth,
                height: layout.renderHeight,
              }
            : StyleSheet.absoluteFill
        }
        onLoad={(e) => {
          if (e.source.width > 0 && e.source.height > 0) {
            setNatural({ width: e.source.width, height: e.source.height });
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
