import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  onCamera: () => void;
  onLibrary: () => void;
  onSearchToggle: () => void;
  searchActive?: boolean;
};

export function ActionCapsule({ onCamera, onLibrary, onSearchToggle, searchActive }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { capsuleMaxWidth, isCompact } = useResponsive();

  const bottom = Platform.OS === 'web' ? 28 : Math.max(insets.bottom, 16);

  const tap = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  };
  const heavy = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <View style={[styles.wrapper, { bottom }]} pointerEvents="box-none">
      <View
        style={[
          styles.capsule,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            width: capsuleMaxWidth,
            height: isCompact ? 70 : 76,
            borderRadius: isCompact ? 38 : 42,
          },
        ]}
      >
        <Pressable
          accessibilityLabel="Pick from library"
          onPress={() => {
            tap();
            onLibrary();
          }}
          style={({ pressed }) => [styles.sideBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="image" size={22} color={colors.foreground} />
        </Pressable>

        <Pressable
          accessibilityLabel="Take photo"
          onPress={() => {
            heavy();
            onCamera();
          }}
          style={({ pressed }) => [
            styles.captureWrap,
            { transform: [{ scale: pressed ? 0.94 : 1 }] },
          ]}
        >
          <View style={[styles.captureHalo, { backgroundColor: colors.glowPrimary }]} />
          <LinearGradient
            colors={[colors.primary, '#4a3a9c']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.captureBtn, { shadowColor: colors.primary }]}
          >
            <Feather name="camera" size={26} color={colors.primaryForeground} />
          </LinearGradient>
        </Pressable>

        <Pressable
          accessibilityLabel={searchActive ? 'Close search' : 'Search'}
          onPress={() => {
            tap();
            onSearchToggle();
          }}
          style={({ pressed }) => [styles.sideBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name={searchActive ? 'x' : 'search'} size={22} color={colors.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    paddingHorizontal: 14,
    shadowColor: '#1c1b3f',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 12,
  },
  sideBtn: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
  },
  captureWrap: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    marginTop: -22,
  },
  captureHalo: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    opacity: 0.55,
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 10,
  },
});

export default ActionCapsule;
