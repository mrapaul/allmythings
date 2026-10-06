import ActionCapsule from '@/components/ActionCapsule';
import CategoryStrip, {
  cycleSort as cycleSortMode,
  type SortMode,
} from '@/components/CategoryStrip';
import GlowBackdrop from '@/components/GlowBackdrop';
import HomePickerSheet from '@/components/HomePickerSheet';
import { ItemThumb } from '@/components/ItemThumb';
import { JiggleView } from '@/components/JiggleView';
import MasonryGrid from '@/components/MasonryGrid';
import QueueTile from '@/components/QueueTile';
import SearchHeader from '@/components/SearchHeader';
import { Snackbar } from '@/components/Snackbar';
import TopBar from '@/components/TopBar';
import { useHomes } from '@/contexts/HomesContext';
import { useInventory } from '@/contexts/InventoryContext';
import { useArrangeMode } from '@/hooks/useArrangeMode';
import { useColors } from '@/hooks/useColors';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useResponsive } from '@/hooks/useResponsive';
import { useSearch } from '@/hooks/useSearch';
import { useServerHealth } from '@/hooks/useServerHealth';
import { useWalkCapture } from '@/hooks/useWalkCapture';
import { isDetectedBox } from '@/lib/bbox-layout';
import { categoryIcon } from '@/lib/category-icons';
import { formatElapsedClock, stageTitle } from '@/lib/detect-stages';
import { buildInventoryCsv, buildInventoryJson } from '@/lib/export';
import { buildViewCsv, buildViewJson } from '@/lib/export-view';
import { type DetectionJob, autoRetryableJobs, inboxCount, queueJobs } from '@/lib/jobs';
import { labelsForDisplay, primaryChips, typeHandle } from '@/lib/labels';
import { groupByCategory, toggleCollapsed } from '@/lib/overview';
import { visibilityVerdict } from '@/lib/partial-visibility';
import { pushRecentSearch } from '@/lib/search-query';
import { shareExportFile } from '@/services/export-share';
import { dispatchShot } from '@/services/walk-capture';
import { useHomeScreenStore } from '@/stores/home-screen.store';
import { removeJob, useJobsStore } from '@/stores/jobs.store';
import { type CollectionViewMode, Prefs } from '@/stores/prefs';
import { refreshLocalSuggestions, useSuggestionsStore } from '@/stores/suggestions.store';
import type { InventoryItem } from '@/types/inventory';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  FadeInUp,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ALL = '__all__';

// The symmetric grid keeps a fixed three-column layout of square tiles so
// every row lines up regardless of each item's crop aspect ratio — compact
// enough to scan a full collection at a glance without zooming.
const GRID_COLUMNS = 3;
// Total gap between adjacent tiles (each tile carries half on every side).
// Gallery-grade: tight seams so the imagery reads as one continuous surface.
const GRID_GUTTER = 3;
/** How long a just-ready queue tile lingers for its check-pop. */
const QUEUE_GHOST_MS = 900;

/** overview → grid → list → overview. */
function nextViewMode(mode: CollectionViewMode): CollectionViewMode {
  if (mode === 'overview') return 'grid';
  if (mode === 'grid') return 'list';
  return 'overview';
}

// The Zustand store uses 'newest' | 'oldest' | 'alpha'; CategoryStrip expects
// 'newest' | 'oldest' | 'az'. Map at the boundary so neither component
// has to know about the other's vocabulary.
function toCategorySort(s: 'newest' | 'oldest' | 'alpha'): SortMode {
  return s === 'alpha' ? 'az' : s;
}

/**
 * The processing pill's status dot: one shared value drives both scale and
 * opacity through a ~1.6s breath (single worklet style — no per-frame JS),
 * cancelled on unmount and stilled entirely under reduce-motion.
 */
function BreathingStatusDot({ color }: { color: string }) {
  const reduceMotion = useReduceMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [reduceMotion, pulse]);
  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: interpolate(pulse.value, [1, 1.4], [0.55, 1]),
  }));
  return <Animated.View style={[styles.pillDot, { backgroundColor: color }, dotStyle]} />;
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items, isLoading, softDelete, undoDelete, pendingDelete, repo } = useInventory();
  const { homes, activeHome, activeHomeId } = useHomes();
  const { gutter, contentMaxWidth, isCompact } = useResponsive();
  const { health: serverHealth } = useServerHealth();

  const query = useHomeScreenStore((s) => s.query);
  const setQuery = useHomeScreenStore((s) => s.setQuery);
  const category = useHomeScreenStore((s) => s.category);
  const setCategory = useHomeScreenStore((s) => s.setCategory);
  const sort = useHomeScreenStore((s) => s.sort);
  const cycleSort = useHomeScreenStore((s) => s.cycleSort);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const { isArranging, enterArrangeMode, exitArrangeMode } = useArrangeMode();
  const jobs = useJobsStore((s) => s.jobs);
  const runningJob = jobs.find((j) => j.status === 'running');
  const inboxBadgeCount = inboxCount(jobs);
  // In-flight + failed jobs become first-class tiles at the front of the
  // collection, and the header queue button badges the same set.
  const queue = queueJobs(jobs);
  // A tile whose job just turned ready drops out of `queue` instantly; keep
  // it on screen briefly so the running → ready moment plays its check-pop
  // before the grid hands the job to the inbox.
  const [departedReady, setDepartedReady] = useState<DetectionJob[]>([]);
  const queueRunIdsRef = useRef<Set<string>>(new Set());
  const departTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const current = new Set(queue.map((j) => j.runId));
    const fresh = jobs.filter(
      (j) =>
        j.status === 'ready' &&
        queueRunIdsRef.current.has(j.runId) &&
        !departedReady.some((d) => d.runId === j.runId),
    );
    queueRunIdsRef.current = current;
    if (fresh.length === 0) return;
    setDepartedReady((prev) => [...prev, ...fresh]);
    for (const job of fresh) {
      departTimersRef.current.push(
        setTimeout(() => {
          setDepartedReady((prev) => prev.filter((d) => d.runId !== job.runId));
        }, QUEUE_GHOST_MS),
      );
    }
  }, [jobs, queue, departedReady]);
  useEffect(
    () => () => {
      for (const t of departTimersRef.current) clearTimeout(t);
    },
    [],
  );
  // The home pill speaks the same staged vocabulary as the capture tray —
  // one mental model wherever the user meets a processing shot. The clock
  // ticks once a second while a job runs so the mm:ss readout counts up.
  const [pillTick, setPillTick] = useState(() => Date.now());
  useEffect(() => {
    if (!runningJob) return;
    const timer = setInterval(() => setPillTick(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [runningJob]);

  const pillElapsedMs = runningJob ? Math.max(0, pillTick - runningJob.startedAt) : 0;
  // The staged copy now includes the streamed counts: "Found 3 of ~8…" the
  // moment the server says it, not at completion.
  const pillStage = runningJob
    ? stageTitle({
        elapsedMs: pillElapsedMs,
        itemCount: runningJob.progressItems ?? 0,
        expectedTotal: runningJob.sceneEstimate ?? null,
      })
    : null;
  // One light haptic per stage change. The copy changing is an event worth
  // a tap; the per-second clock re-render is not — track the stage, and
  // never fire for the pill's first appearance.
  const lastPillStageRef = useRef<string | null>(null);
  useEffect(() => {
    if (pillStage == null) {
      lastPillStageRef.current = null;
      return;
    }
    if (lastPillStageRef.current === pillStage) return;
    const isFirstAppearance = lastPillStageRef.current === null;
    lastPillStageRef.current = pillStage;
    if (isFirstAppearance || Platform.OS === 'web') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [pillStage]);

  // First ready-scan arrival of the session slides the inbox badge in;
  // later count changes leave it be — a badge that re-announces itself is
  // noise.
  const [inboxBadgeGreeted, setInboxBadgeGreeted] = useState(false);
  useEffect(() => {
    if (inboxBadgeCount > 0 && !inboxBadgeGreeted) setInboxBadgeGreeted(true);
  }, [inboxBadgeCount, inboxBadgeGreeted]);

  // Quiet duplicate scan across the WHOLE inventory — recomputed in the
  // background whenever the collection changes; never interrupts anything.
  const suggestions = useSuggestionsStore((s) => s.suggestions);
  // The scan is idempotent and the store only publishes on a real change
  // (see suggestions.store commit), so re-running it is cheap and safe.
  useEffect(() => {
    refreshLocalSuggestions(items);
  }, [items]);
  const tidyCount = suggestions.filter(
    (s) => items.some((i) => i.id === s.keepId) && items.some((i) => i.id === s.mergeId),
  ).length;

  const prefs = useMemo(() => {
    try {
      return Prefs.makeMmkv();
    } catch {
      return Prefs.makeInMemory();
    }
  }, []);
  const [viewMode, setViewMode] = useState<CollectionViewMode>(() => prefs.getCollectionViewMode());

  // The offline banner's promise made good: shots whose dispatch never
  // reached the server re-dispatch themselves the moment it comes back.
  // Transition-gated (offline → online) so a flaky link can't storm retries.
  const prevHealthRef = useRef(serverHealth);
  useEffect(() => {
    const cameOnline = serverHealth === 'online' && prevHealthRef.current === 'offline';
    prevHealthRef.current = serverHealth;
    if (!cameOnline) return;
    for (const job of autoRetryableJobs(jobs)) {
      removeJob(job.runId);
      void dispatchShot(prefs, job.photoUri, {
        roomSessionId: job.roomSessionId,
        attempts: job.attempts,
      });
    }
  }, [serverHealth, jobs, prefs]);
  const toggleViewMode = () => {
    const next = nextViewMode(viewMode);
    setViewMode(next);
    prefs.setCollectionViewMode(next);
  };
  // Overview sections the user has folded away; per-session by design — a
  // fresh open should always show the whole organized collection.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());

  const scrollRef = useRef<ScrollView>(null);
  const searchRef = useRef<TextInput>(null);

  // Recent searches (last 8, MMKV-backed) shown while the empty field has
  // focus. Committing = keyboard search action or opening a result.
  const [recentSearches, setRecentSearches] = useState<string[]>(() => prefs.getRecentSearches());
  const recordSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const next = pushRecentSearch(prefs.getRecentSearches(), trimmed);
    prefs.setRecentSearches(next);
    setRecentSearches(next);
  };

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

  // Label-first: tiles carry chips, not titles. Precompute per-item chips.
  const chipsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof primaryChips>>();
    for (const it of visible) map.set(it.id, primaryChips(labelsForDisplay(it)));
    return map;
  }, [visible]);

  const openLiveReview = (job: DetectionJob) => {
    router.push({ pathname: '/detection', params: { imageUri: job.photoUri, runId: job.runId } });
  };

  const { shotAdvice, sendingCount, handleCamera, handleLibrary, sendAnyway, retake } =
    useWalkCapture(prefs);

  const focusSearch = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setTimeout(() => searchRef.current?.focus(), 250);
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
      {isFiltering ? (
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
      ) : (
        <Pressable
          testID="manual-add-empty"
          onPress={() => router.push('/add-item')}
          style={({ pressed }) => [
            styles.emptyResetBtn,
            styles.manualAddBtn,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.emptyResetText, { color: colors.foreground }]}>
            Or add one by hand
          </Text>
        </Pressable>
      )}
    </View>
  );

  const renderTile = ({ item, index }: { item: InventoryItem; index: number }) => {
    const partial = visibilityVerdict(item.box) !== 'full';
    return (
      <View style={[styles.tileWrap, { margin: GRID_GUTTER / 2 }]}>
        <JiggleView active={isArranging} index={index} style={styles.tileFill}>
          <Pressable
            testID={`collection-tile-${index}`}
            onPress={() => {
              // In arrange mode a tap must not open the item — the only tap
              // targets are the × badges and Done.
              if (isArranging) return;
              recordSearch();
              router.push(`/item/${item.id}`);
            }}
            onLongPress={() => enterArrangeMode()}
            delayLongPress={350}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: colors.card,
                transform: [{ scale: pressed && !isArranging ? 0.97 : 1 }],
              },
            ]}
          >
            <ItemThumb
              uri={item.primaryPhotoUri}
              box={item.box}
              thumbnailUri={item.thumbnailUri}
              style={StyleSheet.absoluteFill}
            />
            {/* Pure imagery: no scrim, no text. Status glyphs are tiny and
                faint — visible on inspection, invisible at a glance. */}
            <View style={styles.badgeRow} pointerEvents="none">
              {isDetectedBox(item.box) && (
                <Feather name="crop" size={9} color="#ffffff" style={styles.quietGlyph} />
              )}
              {partial && (
                <View testID={`partial-badge-${index}`}>
                  <Feather name="maximize" size={9} color="#ffffff" style={styles.quietGlyph} />
                </View>
              )}
            </View>
            {/* Identity without text: the category's glyph, one corner,
                consistent everywhere. */}
            <View style={styles.categoryGlyph} pointerEvents="none">
              <Feather name={categoryIcon(item.category)} size={12} color="#ffffff" />
            </View>
          </Pressable>

          {isArranging && (
            <Pressable
              testID={`tile-delete-${index}`}
              accessibilityLabel={`Remove ${typeHandle(labelsForDisplay(item))}`}
              hitSlop={8}
              onPress={() => softDelete([item.id], typeHandle(labelsForDisplay(item)))}
              style={[styles.deleteBadge, { backgroundColor: colors.foreground }]}
            >
              <Feather name="x" size={13} color={colors.background} />
            </Pressable>
          )}
        </JiggleView>
      </View>
    );
  };

  const renderListRow = (item: InventoryItem, index: number) => (
    <Pressable
      key={item.id}
      onPress={() => {
        if (isArranging) return;
        recordSearch();
        router.push(`/item/${item.id}`);
      }}
      onLongPress={() => enterArrangeMode()}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.listRow,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <ItemThumb
        uri={item.primaryPhotoUri}
        box={item.box}
        thumbnailUri={item.thumbnailUri}
        style={styles.listThumb}
      />
      <View style={styles.listRowBody}>
        {/* List IS the text view; the restraint is typographic, not absence.
            One name line, one quiet meta line — no bordered chips. */}
        <Text numberOfLines={1} style={[styles.listName, { color: colors.foreground }]}>
          {typeHandle(labelsForDisplay(item))}
        </Text>
        {item.location ? (
          <View style={styles.listLocationRow}>
            <Feather name="map-pin" size={11} color={colors.mutedForeground} />
            <Text
              numberOfLines={1}
              testID={`list-location-${index}`}
              style={[styles.listMeta, styles.listLocationText, { color: colors.mutedForeground }]}
            >
              {item.location}
            </Text>
          </View>
        ) : null}
        <Text numberOfLines={1} style={[styles.listMeta, { color: colors.mutedForeground }]}>
          {[
            ...(chipsById.get(item.id) ?? []).filter((c) => c.key !== 'type').map((c) => c.value),
            new Date(item.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            }),
          ].join(' · ')}
        </Text>
      </View>
      {visibilityVerdict(item.box) !== 'full' && (
        <Feather name="maximize" size={13} color={colors.mutedForeground} />
      )}
      {isDetectedBox(item.box) && <Feather name="crop" size={13} color={colors.mutedForeground} />}
      {isArranging ? (
        <Pressable
          testID={`list-delete-${index}`}
          accessibilityLabel={`Remove ${typeHandle(labelsForDisplay(item))}`}
          hitSlop={8}
          onPress={() => softDelete([item.id], typeHandle(labelsForDisplay(item)))}
          style={[styles.listDeleteBadge, { backgroundColor: colors.foreground }]}
        >
          <Feather name="x" size={13} color={colors.background} />
        </Pressable>
      ) : (
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      )}
    </Pressable>
  );

  const headerTitle = query
    ? `Results · ${visible.length}`
    : activeCategory !== ALL
      ? `${activeCategory} · ${visible.length}`
      : 'Collection';

  // Export in context: the sheet's "current view" builders take `visible` —
  // the exact hook result on screen after search/category/sort — while the
  // "everything" variants reuse the Settings flow (lib/export builders +
  // shareExportFile staging) unchanged.
  const [isExporting, setIsExporting] = useState(false);

  const handleExportView = async (format: 'json' | 'csv') => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const result = await shareExportFile(
        `view-${stamp}.${format}`,
        format === 'json'
          ? buildViewJson(visible, headerTitle, activeHome?.name)
          : buildViewCsv(visible, headerTitle, activeHome?.name),
        format === 'json' ? 'application/json' : 'text/csv',
      );
      if (result === 'unavailable') {
        Alert.alert(
          'Almost there',
          'Sharing needs the newest app build. Update the app and your export will be one tap away.',
        );
      }
    } catch {
      Alert.alert('Export hiccup', "That export didn't go through — mind trying once more?");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAll = async (format: 'json' | 'csv') => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const itemsByHome: Record<string, InventoryItem[]> = {};
      for (const home of homes) {
        itemsByHome[home.id] = await repo.getItemsByHome(home.id);
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const result = await shareExportFile(
        `inventory-${stamp}.${format}`,
        format === 'json'
          ? buildInventoryJson(homes, itemsByHome)
          : buildInventoryCsv(homes, itemsByHome),
        format === 'json' ? 'application/json' : 'text/csv',
      );
      if (result === 'unavailable') {
        Alert.alert(
          'Almost there',
          'Sharing needs the newest app build. Update the app and your export will be one tap away.',
        );
      }
    } catch {
      Alert.alert('Export hiccup', "That export didn't go through — mind trying once more?");
    } finally {
      setIsExporting(false);
    }
  };

  const openExportSheet = () => {
    Alert.alert('Export', `${visible.length} item${visible.length === 1 ? '' : 's'} in view`, [
      { text: 'Export current view (CSV)', onPress: () => void handleExportView('csv') },
      { text: 'Export current view (JSON)', onPress: () => void handleExportView('json') },
      { text: 'Export everything (CSV)', onPress: () => void handleExportAll('csv') },
      { text: 'Export everything (JSON)', onPress: () => void handleExportAll('json') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlowBackdrop />

      <View style={[styles.contentClamp, { maxWidth: contentMaxWidth }]}>
        <TopBar onPickHome={() => setPickerVisible(true)} queueCount={queue.length} />

        {/* An unreachable server is a visible, actionable state — never a
            silent one. Shots taken while offline queue and retry. */}
        {serverHealth === 'offline' && (
          <Pressable
            testID="server-offline-banner"
            accessibilityLabel="Server unreachable — open settings"
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [
              styles.offlineBanner,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View style={styles.offlineDot} />
            <Text style={[styles.offlineText, { color: colors.foreground }]} numberOfLines={1}>
              Server unreachable — new shots will wait
            </Text>
            <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
          </Pressable>
        )}

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{
            paddingHorizontal: gutter,
            paddingBottom: insets.bottom + 140,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // Tapping empty space leaves arrange mode, like the home screen.
          onStartShouldSetResponder={() => isArranging}
          onResponderRelease={exitArrangeMode}
        >
          <SearchHeader
            ref={searchRef}
            value={query}
            onChange={setQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => {
              // Delay so a tap on a recent-search chip lands before the row hides.
              setTimeout(() => setSearchFocused(false), 150);
            }}
            onSubmit={recordSearch}
          />

          {searchFocused && query.trim().length === 0 && recentSearches.length > 0 && (
            <View style={styles.recentRow} testID="recent-searches">
              <Feather name="clock" size={13} color={colors.mutedForeground} />
              {recentSearches.map((term) => (
                <Pressable
                  key={term}
                  accessibilityLabel={`Search again: ${term}`}
                  onPress={() => setQuery(term)}
                  style={({ pressed }) => [
                    styles.recentChip,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.recentChipText, { color: colors.foreground }]}>{term}</Text>
                </Pressable>
              ))}
            </View>
          )}

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

          {/* In-flight and failed captures lead the grid: the photo itself is
              the tile — a progress ring while it catalogs, a dimmed warning
              badge when it needs a retry. Just-ready jobs linger one beat
              for the check-pop. Tapping opens its detection screen. */}
          {(queue.length > 0 || departedReady.length > 0) && (
            <View testID="queue-section">
              <View style={styles.sectionHeader}>
                <Feather name="layers" size={14} color={colors.primary} />
                <Text style={[styles.sectionCount, { color: colors.foreground }]}>
                  {queue.length + departedReady.length}
                </Text>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                  Cataloging
                </Text>
                <View style={styles.sectionRule} />
              </View>
              <View style={styles.sectionTiles}>
                {queue.map((job, i) => (
                  <View key={job.runId} style={styles.overviewTileSlot}>
                    <QueueTile job={job} index={i} colors={colors} onPress={openLiveReview} />
                  </View>
                ))}
                {departedReady.map((job, i) => (
                  <View key={job.runId} style={styles.overviewTileSlot} pointerEvents="none">
                    <QueueTile
                      job={job}
                      index={queue.length + i}
                      colors={colors}
                      onPress={openLiveReview}
                    />
                  </View>
                ))}
              </View>
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
              <View style={styles.gridHeaderRow}>
                <Text
                  style={[
                    styles.gridTitle,
                    { color: colors.foreground, fontSize: isCompact ? 22 : 28 },
                  ]}
                >
                  {headerTitle}
                </Text>
                <View style={styles.gridHeaderActions}>
                  {tidyCount > 0 && (
                    <Pressable
                      testID="tidy-badge"
                      accessibilityLabel={`Tidy up, ${tidyCount} possible duplicates`}
                      onPress={() => router.push('/tidy')}
                      style={({ pressed }) => [
                        styles.tidyBadge,
                        {
                          backgroundColor: colors.muted,
                          borderColor: colors.border,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}
                    >
                      <Feather name="layers" size={15} color={colors.mutedForeground} />
                      <View style={[styles.countDot, { backgroundColor: colors.primary }]}>
                        <Text style={[styles.countDotText, { color: colors.primaryForeground }]}>
                          {tidyCount}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                  <Pressable
                    testID="manual-add"
                    accessibilityLabel="Add an item by hand"
                    onPress={() => router.push('/add-item')}
                    style={({ pressed }) => [
                      styles.viewToggle,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Feather name="plus" size={16} color={colors.foreground} />
                  </Pressable>
                  <Pressable
                    testID="export-view-button"
                    accessibilityLabel="Export or share this view"
                    onPress={openExportSheet}
                    style={({ pressed }) => [
                      styles.viewToggle,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Feather name="share-2" size={16} color={colors.foreground} />
                  </Pressable>
                  <Pressable
                    testID="view-toggle"
                    accessibilityLabel={`Switch to ${nextViewMode(viewMode)} view`}
                    onPress={toggleViewMode}
                    style={({ pressed }) => [
                      styles.viewToggle,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Feather
                      name={
                        nextViewMode(viewMode) === 'grid'
                          ? 'grid'
                          : nextViewMode(viewMode) === 'list'
                            ? 'list'
                            : 'layers'
                      }
                      size={16}
                      color={colors.foreground}
                    />
                  </Pressable>
                </View>
              </View>

              {viewMode === 'overview' ? (
                <View style={styles.gridContainer} testID="collection-overview">
                  {groupByCategory(visible).map((section) => (
                    <View key={section.category}>
                      <Pressable
                        testID={`overview-section-${section.category}`}
                        accessibilityLabel={`${section.category}, ${section.count} items, ${
                          collapsedSections.has(section.category) ? 'collapsed' : 'expanded'
                        }`}
                        onPress={() =>
                          setCollapsedSections((prev) => toggleCollapsed(prev, section.category))
                        }
                        style={({ pressed }) => [
                          styles.sectionHeader,
                          { opacity: pressed ? 0.7 : 1 },
                        ]}
                      >
                        <Feather
                          name={categoryIcon(section.category)}
                          size={14}
                          color={colors.foreground}
                        />
                        <Text style={[styles.sectionCount, { color: colors.foreground }]}>
                          {section.count}
                        </Text>
                        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                          {section.category}
                        </Text>
                        <View style={styles.sectionRule} />
                        <Feather
                          name={
                            collapsedSections.has(section.category) ? 'chevron-down' : 'chevron-up'
                          }
                          size={13}
                          color={colors.mutedForeground}
                        />
                      </Pressable>
                      {!collapsedSections.has(section.category) && (
                        <View style={styles.sectionTiles}>
                          {section.items.map((it, i) => (
                            <View key={it.id} style={styles.overviewTileSlot}>
                              {renderTile({ item: it, index: section.startIndex + i })}
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              ) : viewMode === 'grid' ? (
                <View style={styles.gridContainer} testID="collection-grid">
                  <MasonryGrid<InventoryItem>
                    items={visible}
                    keyExtractor={(it) => it.id}
                    getAspectRatio={() => 1}
                    renderItem={renderTile}
                    columns={GRID_COLUMNS}
                    gutter={GRID_GUTTER / 2}
                  />
                </View>
              ) : (
                <View style={styles.listContainer} testID="collection-list">
                  {visible.map((it, i) => renderListRow(it, i))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>

      <View style={styles.walkRow} pointerEvents="box-none">
        {sendingCount > 0 && !runningJob && (
          <View
            testID="sending-pill"
            style={[styles.walkPill, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.walkPillText, { color: colors.foreground }]}>Sending…</Text>
          </View>
        )}
        {runningJob && (
          <Pressable
            testID="processing-toast"
            accessibilityLabel="Processing — open live review"
            onPress={() => openLiveReview(runningJob)}
            style={({ pressed }) => [
              styles.walkPill,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <BreathingStatusDot color={colors.primary} />
            {pillStage != null && (
              <Animated.Text
                key={pillStage}
                entering={FadeIn.duration(180)}
                exiting={FadeOut.duration(180)}
                numberOfLines={1}
                style={[styles.walkPillText, { color: colors.foreground }]}
              >
                {pillStage}
              </Animated.Text>
            )}
            <Text style={[styles.walkPillClock, { color: colors.mutedForeground }]}>
              {formatElapsedClock(pillElapsedMs)}
            </Text>
          </Pressable>
        )}
        {inboxBadgeCount > 0 && (
          <Animated.View {...(inboxBadgeGreeted ? {} : { entering: FadeInUp.duration(240) })}>
            <Pressable
              testID="inbox-badge"
              accessibilityLabel={`Review inbox, ${inboxBadgeCount} waiting`}
              onPress={() => router.push('/inbox')}
              style={({ pressed }) => [
                styles.glyphButton,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Feather name="inbox" size={16} color={colors.foreground} />
              <View
                style={[
                  styles.countDot,
                  styles.countDotFloating,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Text style={[styles.countDotText, { color: colors.primaryForeground }]}>
                  {inboxBadgeCount}
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        )}
      </View>

      <ActionCapsule
        onCamera={handleCamera}
        onLibrary={handleLibrary}
        onSearchToggle={focusSearch}
      />

      <Snackbar
        visible={shotAdvice !== null}
        testID="quality-advice"
        message={shotAdvice?.advice ?? ''}
        actionLabel="Use anyway"
        onAction={sendAnyway}
        secondaryLabel="Retake"
        onSecondary={retake}
      />

      <HomePickerSheet visible={pickerVisible} onClose={() => setPickerVisible(false)} />

      {isArranging && (
        <View style={styles.arrangeBar} pointerEvents="box-none">
          <Pressable
            testID="arrange-done"
            accessibilityLabel="Done arranging"
            onPress={exitArrangeMode}
            style={({ pressed }) => [
              styles.arrangeDone,
              { backgroundColor: colors.foreground, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Feather name="check" size={15} color={colors.background} />
            <Text style={[styles.arrangeDoneText, { color: colors.background }]}>Done</Text>
          </Pressable>
        </View>
      )}

      <Snackbar
        visible={pendingDelete !== null}
        testID="delete-undo-snackbar"
        message={
          pendingDelete
            ? pendingDelete.ids.length === 1
              ? `Removed ${pendingDelete.label}`
              : `Removed ${pendingDelete.ids.length} items`
            : ''
        }
        actionLabel="Undo"
        actionTestID="delete-undo-action"
        onAction={undoDelete}
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
  recentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  recentChip: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 0.1,
  },
  emptyTopPad: { paddingTop: 60 },
  gridContainer: { minHeight: 600 },
  gridHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 14,
  },
  gridTitle: {
    fontFamily: 'Fraunces_500Medium',
    letterSpacing: -0.4,
  },
  viewToggle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridHeaderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  glyphButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countDot: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  countDotFloating: {
    position: 'absolute',
    top: -4,
    right: -4,
    marginLeft: 0,
  },
  countDotText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  sectionCount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  sectionLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  sectionRule: {
    flex: 1,
  },
  sectionTiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  overviewTileSlot: {
    width: '33.333%',
    aspectRatio: 1,
  },
  listName: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 15,
    letterSpacing: -0.2,
  },
  listMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 3,
    letterSpacing: 0.2,
  },
  listLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  listLocationText: {
    marginTop: 0,
    flexShrink: 1,
  },
  tidyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
  },
  walkRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 118,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    zIndex: 5,
  },
  walkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  walkPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.2,
  },
  walkPillClock: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 0.2,
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  manualAddBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  tileWrap: {
    flex: 1,
    aspectRatio: 1,
  },
  tileFill: {
    flex: 1,
  },
  quietGlyph: {
    opacity: 0.35,
  },
  categoryGlyph: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    opacity: 0.4,
  },
  badgeRow: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    gap: 4,
  },
  deleteBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  listDeleteBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
  },
  offlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#C77D1E',
  },
  offlineText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 0.1,
  },
  arrangeBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 118,
    alignItems: 'center',
    zIndex: 6,
  },
  arrangeDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 20,
    height: 40,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  arrangeDoneText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  listContainer: {
    gap: 10,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 18,
    borderWidth: 1,
  },
  listThumb: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  listRowBody: {
    flex: 1,
  },
  card: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
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
