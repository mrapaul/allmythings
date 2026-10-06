import { useHomes } from '@/contexts/HomesContext';
import { useInventory } from '@/contexts/InventoryContext';
import { useColors } from '@/hooks/useColors';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useResponsive } from '@/hooks/useResponsive';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function TopBar({
  onPickHome,
  queueCount = 0,
}: { onPickHome: () => void; queueCount?: number }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const { activeHome, profile } = useHomes();
  const { items } = useInventory();
  const { gutter, isCompact } = useResponsive();

  const paddingTop = Platform.OS === 'web' ? 16 : insets.top + 4;

  const tap = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  };

  return (
    <View style={[styles.wrapper, { paddingTop, paddingHorizontal: gutter }]}>
      <Pressable
        accessibilityLabel="Profile"
        onPress={() => {
          tap();
          router.push('/profile');
        }}
        style={({ pressed }) => [
          styles.iconBtn,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text style={[styles.avatarText, { color: colors.foreground }]}>
          {profile.initials.slice(0, 2).toUpperCase() || 'Y'}
        </Text>
      </Pressable>

      <Pressable
        testID="top-bar-home-pill"
        accessibilityLabel={`Switch home, currently ${activeHome?.name ?? 'My Home'} with ${items.length} items`}
        onPress={() => {
          tap();
          onPickHome();
        }}
        style={({ pressed }) => [
          styles.homePill,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={[styles.homeIcon, { fontSize: isCompact ? 22 : 24 }]}>
          {activeHome?.icon ?? '🏡'}
        </Text>
        <View style={[styles.countPill, { backgroundColor: colors.primary }]}>
          <Text style={[styles.countText, { color: colors.primaryForeground }]}>
            {items.length}
          </Text>
        </View>
        <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
      </Pressable>

      <Pressable
        testID="top-bar-queue"
        accessibilityLabel={
          queueCount > 0
            ? `Review queue, ${queueCount} photo${queueCount === 1 ? '' : 's'} waiting`
            : 'Review queue'
        }
        accessibilityHint="Opens the review inbox"
        onPress={() => {
          tap();
          router.push('/inbox');
        }}
        style={({ pressed }) => [
          styles.iconBtn,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Feather name="inbox" size={18} color={colors.foreground} />
        {queueCount > 0 && (
          // Keyed by the count: a change (or first appearance) remounts the
          // dot and it springs from 0; hiding is a plain unmount — instant,
          // no exit animation. Purely decorative, so reduce-motion skips it.
          <Animated.View
            key={queueCount}
            {...(reduceMotion ? {} : { entering: ZoomIn.springify() })}
            style={[styles.queueCountDot, { backgroundColor: colors.primary }]}
            pointerEvents="none"
          >
            <Text style={[styles.queueCountText, { color: colors.primaryForeground }]}>
              {queueCount}
            </Text>
          </Animated.View>
        )}
      </Pressable>

      <Pressable
        testID="top-bar-settings"
        accessibilityLabel="Settings"
        onPress={() => {
          tap();
          router.push('/settings');
        }}
        style={({ pressed }) => [
          styles.iconBtn,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Feather name="settings" size={18} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  queueCountDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueCountText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
  },
  homePill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingRight: 14,
    gap: 8,
  },
  homeIcon: {
    lineHeight: 28,
  },
  countPill: {
    minWidth: 26,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.2,
  },
});

export default TopBar;
