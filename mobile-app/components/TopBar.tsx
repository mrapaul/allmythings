import { useHomes } from '@/contexts/HomesContext';
import { useInventory } from '@/contexts/InventoryContext';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function TopBar({ onPickHome }: { onPickHome: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();
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
