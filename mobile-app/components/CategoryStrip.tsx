import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export type SortMode = 'newest' | 'oldest' | 'az';

const SORT_LABELS: Record<SortMode, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  az: 'A–Z',
};

const SORT_ICONS: Record<SortMode, 'arrow-down' | 'arrow-up' | 'type'> = {
  newest: 'arrow-down',
  oldest: 'arrow-up',
  az: 'type',
};

const SORT_ORDER: readonly SortMode[] = ['newest', 'oldest', 'az'];

type Cat = { key: string; label: string; count: number };

type Props = {
  categories: Cat[];
  active: string;
  onChange: (key: string) => void;
  sort: SortMode;
  onSortCycle: () => void;
};

/**
 * Horizontal category pills + a smart sort cycle button.
 * Each pill shows a live count. Active pill fills with the primary tone.
 */
export function CategoryStrip({ categories, active, onChange, sort, onSortCycle }: Props) {
  const colors = useColors();

  const tap = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {categories.map((c) => {
          const isActive = c.key === active;
          return (
            <Pressable
              key={c.key}
              accessibilityLabel={`Filter by ${c.label}`}
              onPress={() => {
                tap();
                onChange(c.key);
              }}
              style={({ pressed }) => [
                styles.pill,
                {
                  backgroundColor: isActive ? colors.primary : colors.card,
                  borderColor: isActive ? colors.primary : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.pillLabel,
                  { color: isActive ? colors.primaryForeground : colors.foreground },
                ]}
              >
                {c.label}
              </Text>
              <View
                style={[
                  styles.countBadge,
                  {
                    backgroundColor: isActive ? `${colors.primaryForeground}33` : colors.muted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.countText,
                    {
                      color: isActive ? colors.primaryForeground : colors.mutedForeground,
                    },
                  ]}
                >
                  {c.count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        accessibilityLabel={`Sort by ${SORT_LABELS[sort]}`}
        onPress={() => {
          tap();
          onSortCycle();
        }}
        style={({ pressed }) => [
          styles.sortBtn,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Feather name={SORT_ICONS[sort]} size={14} color={colors.foreground} />
        <Text style={[styles.sortText, { color: colors.foreground }]}>{SORT_LABELS[sort]}</Text>
      </Pressable>
    </View>
  );
}

export function cycleSort(current: SortMode): SortMode {
  const i = SORT_ORDER.indexOf(current);
  return SORT_ORDER[(i + 1) % SORT_ORDER.length] ?? 'newest';
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
  },
  pillLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    letterSpacing: 0.1,
  },
  countBadge: {
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.2,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
  },
  sortText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 0.2,
  },
});

export default CategoryStrip;
