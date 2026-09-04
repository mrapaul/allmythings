import GlowBackdrop from '@/components/GlowBackdrop';
import { ItemThumb } from '@/components/ItemThumb';
import { Snackbar } from '@/components/Snackbar';
import { useInventory } from '@/contexts/InventoryContext';
import { useColors } from '@/hooks/useColors';
import { labelsForDisplay, typeHandle } from '@/lib/labels';
import type { MergeSuggestion } from '@/lib/suggestions';
import {
  dismissSuggestion,
  resolveSuggestion,
  useSuggestionsStore,
} from '@/stores/suggestions.store';
import type { InventoryItem } from '@/types/inventory';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Tidy up: one duplicate suggestion at a time, never modal, never blocking.
 * Merge folds the pair together (undoable), "Not the same" is remembered
 * permanently, Skip leaves it for later.
 */
export default function TidyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items, mergeItems } = useInventory();
  const suggestions = useSuggestionsStore((s) => s.suggestions);

  const [skipped, setSkipped] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);
  const [mergedToast, setMergedToast] = useState<string | null>(null);

  const byId = new Map(items.map((it) => [it.id, it]));
  // Only pairs whose items both still exist are actionable.
  const queue = suggestions.filter(
    (s) => !skipped.includes(s.id) && byId.has(s.keepId) && byId.has(s.mergeId),
  );
  const current = queue[0];
  const keep = current ? byId.get(current.keepId) : undefined;
  const dupe = current ? byId.get(current.mergeId) : undefined;

  const paddingTop = Platform.OS === 'web' ? 16 : insets.top + 4;

  const handleMerge = async (suggestion: MergeSuggestion) => {
    if (merging) return;
    setMerging(true);
    try {
      await mergeItems(suggestion.keepId, [suggestion.mergeId]);
      resolveSuggestion(suggestion.id);
      setMergedToast('Merged into one item');
      setTimeout(() => setMergedToast(null), 4_000);
    } finally {
      setMerging(false);
    }
  };

  const renderSide = (item: InventoryItem, caption: string) => {
    const labels = labelsForDisplay(item);
    return (
      <View style={styles.side}>
        <Text style={[styles.sideCaption, { color: colors.mutedForeground }]}>{caption}</Text>
        <ItemThumb
          uri={item.primaryPhotoUri}
          box={item.box}
          thumbnailUri={item.thumbnailUri}
          style={[styles.thumb, { borderColor: colors.border }]}
        />
        <Text style={[styles.sideTitle, { color: colors.foreground }]} numberOfLines={1}>
          {typeHandle(labels)}
        </Text>
        <View style={styles.chipWrap}>
          {labels.slice(0, 4).map((chip) => (
            <View
              key={`${chip.key}-${chip.value}`}
              style={[styles.chip, { backgroundColor: colors.muted, borderColor: colors.border }]}
            >
              <Text style={[styles.chipText, { color: colors.foreground }]} numberOfLines={1}>
                {chip.value}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlowBackdrop />

      <View style={[styles.header, { paddingTop }]}>
        <Pressable
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Feather name="chevron-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Tidy up</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
        {!current || !keep || !dupe ? (
          <View style={styles.empty} testID="tidy-empty">
            <Feather name="check-circle" size={38} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing to tidy</Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              Your collection looks clean. We'll quietly flag anything that looks like a double.
            </Text>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                Back to collection
              </Text>
            </Pressable>
          </View>
        ) : (
          <View testID="tidy-card">
            <Text style={[styles.lede, { color: colors.mutedForeground }]}>
              {queue.length} to look at · these two look like the same thing
            </Text>

            <View
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.sides}>
                {renderSide(keep, 'KEEPING')}
                <Feather name="plus" size={16} color={colors.mutedForeground} />
                {renderSide(dupe, 'FOLDING IN')}
              </View>
            </View>

            <Pressable
              testID="tidy-merge"
              accessibilityLabel="Merge these items"
              disabled={merging}
              onPress={() => void handleMerge(current)}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: colors.primary, opacity: merging ? 0.6 : pressed ? 0.85 : 1 },
              ]}
            >
              <Feather name="git-merge" size={16} color={colors.primaryForeground} />
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                Merge
              </Text>
            </Pressable>

            <Pressable
              testID="tidy-not-same"
              accessibilityLabel="Not the same item"
              onPress={() => dismissSuggestion(current.id)}
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
                Not the same
              </Text>
            </Pressable>

            <Pressable
              testID="tidy-skip"
              accessibilityLabel="Skip for now"
              onPress={() => setSkipped((prev) => [...prev, current.id])}
              style={({ pressed }) => [styles.skipBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip for now</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <Snackbar visible={mergedToast !== null} testID="tidy-merged" message={mergedToast ?? ''} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  headerSpacer: { width: 44 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 22,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  lede: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: 0.2,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
  },
  sides: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  side: { flex: 1, alignItems: 'center', gap: 6 },
  sideCaption: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    letterSpacing: 0.7,
  },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
  },
  sideTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 14,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
  },
  chip: {
    paddingHorizontal: 8,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 100,
  },
  chipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  primaryBtn: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 26,
  },
  primaryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  secondaryBtn: {
    marginTop: 10,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  skipBtn: {
    marginTop: 14,
    alignItems: 'center',
  },
  skipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 70,
    gap: 10,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 20,
  },
  emptyBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
});
