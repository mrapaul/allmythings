import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type ViewStyle } from 'react-native';

/**
 * Pixie-dust backdrop. Soft multi-hue blobs (lavender / rose / sky / mint /
 * pixie-gold) diffused under a top-down gradient veil for an enchanted feel.
 * Adapts blob count and scale to screen size.
 */
export function GlowBackdrop({ style }: { style?: ViewStyle }) {
  const colors = useColors();
  const { width, height, isWide } = useResponsive();

  const scale = isWide ? 1.35 : 1;
  const blobs: {
    tone: string;
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    size: number;
  }[] = [
    { tone: colors.glowPrimary, top: -120, right: -120, size: 460 * scale },
    { tone: colors.glowSky, top: 200, left: -160, size: 360 * scale },
    { tone: colors.glowAccent, bottom: -120, right: -80, size: 380 * scale },
    { tone: colors.glowMint, bottom: 240, left: 60, size: 220 * scale },
    { tone: colors.glowButter, top: height * 0.45, right: width * 0.35, size: 180 * scale },
  ];

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      {blobs.map((b) => (
        <View
          key={`blob-${b.tone}-${b.size}`}
          style={[
            styles.blob,
            {
              top: b.top,
              bottom: b.bottom,
              left: b.left,
              right: b.right,
              width: b.size,
              height: b.size,
              backgroundColor: b.tone,
            },
          ]}
        />
      ))}
      <LinearGradient
        colors={[`${colors.background}11`, `${colors.background}99`, colors.background]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: 'absolute',
    borderRadius: 9999,
    opacity: 0.5,
  },
});

export default GlowBackdrop;
