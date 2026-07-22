import ActionCapsule from '@/components/ActionCapsule';
import CategoryStrip, {
  cycleSort as cycleSortMode,
  type SortMode,
} from '@/components/CategoryStrip';
import GlowBackdrop from '@/components/GlowBackdrop';
import HomePickerSheet from '@/components/HomePickerSheet';
import MasonryGrid from '@/components/MasonryGrid';
import QuickActionsSheet from '@/components/QuickActionsSheet';
import SearchHeader from '@/components/SearchHeader';
import TopBar from '@/components/TopBar';
import { useHomes } from '@/contexts/HomesContext';
import { useInventory } from '@/contexts/InventoryContext';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { useSearch } from '@/hooks/useSearch';
import { useHomeScreenStore } from '@/stores/home-screen.store';
import type { InventoryItem } from '@/types/inventory';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ALL = '__all__';

// The Zustand store uses 'newest' | 'oldest' | 'alpha'; CategoryStrip expects
// 'newest' | 'oldest' | 'az'. Map at the boundary so neither component
// has to know about the other's vocabulary.
function toCategorySort(s: 'newest' | 'oldest' | 'alpha'): SortMode {
  return s === 'alpha' ? 'az' : s;
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items, isLoading, deleteItem } = useInventory();
  const { activeHome, activeHomeId } = useHomes();
  const { columns, gutter, cardGap, contentMaxWidth, isCompact } = useResponsive();

  const query = useHomeScreenStore((s) => s.query);
  const setQuery = useHomeScreenStore((s) => s.setQuery);
  const category = useHomeScreenStore((s) => s.category);
  const setCategory = useHomeScreenStore((s) => s.setCategory);
  const sort = useHomeScreenStore((s) => s.sort);
  const cycleSort = useHomeScreenStore((s) => s.cycleSort);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [actionItem, setActionItem] = useState<InventoryItem | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const searchRef = useRef<TextInput>(null);

  // FTS-backed search via TanStack Query — only fires when there's a query.
  const searchResults = useSearch(activeHomeId, query);
  const baseItems = query.trim() ? (searchResults.data ?? items) : items;

  const activeCategory = category ?? ALL;

  // Categories with live counts (computed off the in-memory items so the
  // strip stays stable while typing).
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) {
      const k = it.category || 'Other';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const list = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => ({ key: k, label: k, count: n }));
    return [{ key: ALL, label: 'All', count: items.length }, ...list];
  }, [items]);

  // Filter (by category) + sort. Search is already applied by `baseItems`.
  const visible = useMemo(() => {
    let out = baseItems;
    if (activeCategory !== ALL) {
      out = out.filter((it) => (it.category || 'Other') === activeCategory);
    }
    out = [...out];
    if (sort === 'newest') out.sort((a, b) => b.createdAt - a.createdAt);
    else if (sort === 'oldest') out.sort((a, b) => a.createdAt - b.createdAt);
    else if (sort === 'alpha') out.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    return out;
  }, [baseItems, activeCategory, sort]);

  const goToDetection = (imageUri: string) => {
    router.push({ pathname: '/detection', params: { imageUri } });
  };

  const handleCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera access is required to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.8,
    });
    const uri = result.canceled ? undefined : result.assets?.[0]?.uri;
    if (uri) {
      goToDetection(uri);
    }
  };

  const handleLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Photo access is required to pick a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
    });
    const uri = result.canceled ? undefined : result.assets?.[0]?.uri;
    if (uri) {
      goToDetection(uri);
    }
  };

  const focusSearch = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setTimeout(() => searchRef.current?.focus(), 250);
  };

  const handleAction = async (a: 'edit' | 'move' | 'delete') => {
    const it = actionItem;
    setActionItem(null);
    if (!it) return;
    if (a === 'edit') {
      router.push(`/item/${it.id}`);
    } else if (a === 'delete') {
      Alert.alert('Delete item?', `Remove "${it.label}" from this home.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteItem(it.id);
          },
        },
      ]);
    }
  };

  const isFiltering = query.length > 0 || activeCategory !== ALL;

  const renderEmpty = () => (
    <View style={styles.empty}>
      <View style={[styles.emptyHalo, { backgroundColor: colors.glowPrimary }]} />
      <View
        style={[styles.emptyBadge, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <Text style={styles.emptyEmoji}>{isFiltering ? '🔎' : (activeHome?.icon ?? '✨')}</Text>
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        {isFiltering ? 'Nothing matches' : 'A blank canvas'}
      </Text>
      <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
        {isFiltering
          ? 'Try a different search or tap All to see everything.'
          : 'Tap the camera below to capture your first piece. Each photo is catalogued automatically.'}
      </Text>
      {isFiltering && (
        <Pressable
          onPress={() => {
            setQuery('');
            setCategory(null);
          }}
          style={({ pressed }) => [
            styles.emptyResetBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.emptyResetText, { color: colors.primaryForeground }]}>
            Clear filters
          </Text>
        </Pressable>
      )}
    </View>
  );

  const renderTile = ({ item }: { item: InventoryItem; index: number }) => {
    const ratio = (() => {
      if (item.box && item.box.width > 0 && item.box.height > 0) {
        const r = item.box.height / item.box.width;
        return Math.max(0.7, Math.min(1.55, r));
      }
      return 1;
    })();

    return (
      <View style={[styles.tileWrap, { aspectRatio: 1 / ratio, margin: cardGap / 2 }]}>
        <Pressable
          onPress={() => router.push(`/item/${item.id}`)}
          onLongPress={() => setActionItem(item)}
          delayLongPress={350}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          <Image
            source={item.primaryPhotoUri}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={250}
          />
          <View style={styles.cardScrim} pointerEvents="none" />
          <View style={styles.cardCaption}>
            <Text numberOfLines={1} style={styles.cardLabel}>
              {item.label || 'Untitled'}
            </Text>
            <Text numberOfLines={1} style={styles.cardCategory}>
              {item.category}
            </Text>
          </View>
        </Pressable>
      </View>
    );
  };

  const headerTitle = query
    ? `Results · ${visible.length}`
    : activeCategory !== ALL
      ? `${activeCategory} · ${visible.length}`
      : 'Collection';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlowBackdrop />

      <View style={[styles.contentClamp, { maxWidth: contentMaxWidth }]}>
        <TopBar onPickHome={() => setPickerVisible(true)} />

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{
            paddingHorizontal: gutter,
            paddingBottom: insets.bottom + 140,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <SearchHeader ref={searchRef} value={query} onChange={setQuery} />

          {items.length > 0 && (
            <View style={styles.categoryStripWrap}>
              <CategoryStrip
                categories={categories}
                active={activeCategory}
                onChange={(key) => setCategory(key === ALL ? null : key)}
                sort={toCategorySort(sort)}
                onSortCycle={cycleSort}
              />
            </View>
          )}

          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : visible.length === 0 ? (
            <View style={styles.emptyTopPad}>{renderEmpty()}</View>
          ) : (
            <>
              <Text
                style={[
                  styles.gridTitle,
                  { color: colors.foreground, fontSize: isCompact ? 22 : 28 },
                ]}
              >
                {headerTitle}
              </Text>

              <View style={styles.gridContainer}>
                <MasonryGrid<InventoryItem>
                  items={visible}
                  keyExtractor={(it) => it.id}
                  getAspectRatio={(it) => {
                    if (it.box && it.box.width > 0 && it.box.height > 0) {
                      const r = it.box.height / it.box.width;
                      return Math.max(0.7, Math.min(1.55, 1 / r));
                    }
                    return 1;
                  }}
                  renderItem={renderTile}
                  columns={columns}
                  gutter={cardGap / 2}
                />
              </View>
            </>
          )}
        </ScrollView>
      </View>

      <ActionCapsule
        onCamera={handleCamera}
        onLibrary={handleLibrary}
        onSearchToggle={focusSearch}
      />

      <HomePickerSheet visible={pickerVisible} onClose={() => setPickerVisible(false)} />

      <QuickActionsSheet
        visible={actionItem !== null}
        {...(actionItem ? { itemLabel: actionItem.label } : {})}
        onAction={handleAction}
        onClose={() => setActionItem(null)}
      />
    </View>
  );
}

// `cycleSortMode` is intentionally re-exported into local scope so that any
// future caller (or refactor toward a unified sort vocabulary) can leverage
// CategoryStrip's helper without pulling another import.
void cycleSortMode;

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  contentClamp: { flex: 1, width: '100%', alignSelf: 'center' },
  loading: { paddingTop: 80, alignItems: 'center', justifyContent: 'center' },
  categoryStripWrap: { marginTop: 14 },
  emptyTopPad: { paddingTop: 60 },
  gridContainer: { minHeight: 600 },
  gridTitle: {
    fontFamily: 'Fraunces_500Medium',
    marginTop: 22,
    marginBottom: 14,
    letterSpacing: -0.4,
  },
  tileWrap: {
    flex: 1,
  },
  card: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#1c1b3f',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 4,
  },
  cardScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
    backgroundColor: 'rgba(28,27,63,0.55)',
  },
  cardCaption: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
  },
  cardLabel: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 15,
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  cardCategory: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: 36,
  },
  emptyHalo: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.55,
    top: -10,
  },
  emptyBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  emptyEmoji: { fontSize: 30 },
  emptyTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 26,
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  emptyBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  emptyResetBtn: {
    marginTop: 22,
    paddingHorizontal: 22,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyResetText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.3,
  },
});
