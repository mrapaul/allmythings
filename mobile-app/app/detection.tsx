import { detectImageStream } from '@/api/detect';
import { getDetectStatus } from '@/api/detect-status';
import { DetectionRow } from '@/components/DetectionRow';
import { GlowBackdrop } from '@/components/GlowBackdrop';
import { useHomes } from '@/contexts/HomesContext';
import { useInventory } from '@/contexts/InventoryContext';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import {
  type DetectionRow as DetectionStoreRow,
  getDetectionStore,
  useDetectionStore,
} from '@/stores/detection-screen.store';
import { Prefs } from '@/stores/prefs';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DetectionScreen() {
  const params = useLocalSearchParams<{ imageUri?: string }>();
  const imageUri = typeof params.imageUri === 'string' ? params.imageUri : undefined;
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { gutter, contentMaxWidth, isCompact, width: screenW } = useResponsive();
  const { addItems } = useInventory();
  const { activeHomeId } = useHomes();

  const phase = useDetectionStore((s) => s.phase);
  const rows = useDetectionStore((s) => s.rows);
  const errorCode = useDetectionStore((s) => s.errorCode);
  const errorMessage = useDetectionStore((s) => s.errorMessage);

  const prefs = useMemo(() => {
    try {
      return Prefs.makeMmkv();
    } catch {
      return Prefs.makeInMemory();
    }
  }, []);

  const [processedUri, setProcessedUri] = useState<string | undefined>(undefined);
  const [imgWH, setImgWH] = useState<{ w: number; h: number }>({ w: screenW, h: screenW });
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [autoFocusByRow, setAutoFocusByRow] = useState<Record<string, boolean>>({});
  const [tagsByRow, setTagsByRow] = useState<Record<string, string[]>>({});
  const launchedRef = useRef(false);

  // ----- effects: reset + crash-resume + run detection ---------------------
  useEffect(() => {
    if (launchedRef.current) return;
    if (!imageUri) return;
    launchedRef.current = true;

    const store = getDetectionStore();
    store.getState().reset();

    const controller = new AbortController();

    void (async () => {
      // crash-resume: if a prior run is in prefs and is already completed,
      // synthesize events and skip launching a new run.
      const lastId = prefs.getLastDetectionRunId();
      if (lastId) {
        try {
          const st = await getDetectStatus(lastId);
          if (st.status === 'completed' && st.result) {
            const s = store.getState();
            s.handleEvent({ type: 'meta', runId: lastId, traceId: '' });
            for (const item of st.result.items) {
              s.handleEvent({ type: 'item', item });
            }
            s.handleEvent({ type: 'done', runId: lastId, totalItems: st.result.items.length });
            prefs.setLastDetectionRunId(null);
            return;
          }
        } catch {
          // fall through to launch a fresh run
        }
        prefs.setLastDetectionRunId(null);
      }

      // compress image (mirror design behavior, ~1280px wide JPEG).
      let uploadUri = imageUri;
      let w = screenW;
      let h = screenW;
      try {
        const manipulated = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ resize: { width: 1280 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
        );
        uploadUri = manipulated.uri;
        if (manipulated.width && manipulated.height) {
          w = manipulated.width;
          h = manipulated.height;
        }
      } catch {
        // fall back to original uri
      }
      setProcessedUri(uploadUri);
      setImgWH({ w, h });

      try {
        for await (const ev of detectImageStream(
          { fileUri: uploadUri, fileName: 'frame.jpg', mimeType: 'image/jpeg' },
          controller.signal,
        )) {
          if (controller.signal.aborted) break;
          if (ev.type === 'meta') prefs.setLastDetectionRunId(ev.runId);
          if (ev.type === 'done' || ev.type === 'error') prefs.setLastDetectionRunId(null);
          store.getState().handleEvent(ev);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          store.getState().handleEvent({
            type: 'error',
            code: 'detect_stream_failed',
            message: err instanceof Error ? err.message : String(err),
          });
        }
        prefs.setLastDetectionRunId(null);
      }
    })();

    return () => {
      controller.abort();
      // best-effort: clear pending pref so a new mount runs fresh
      prefs.setLastDetectionRunId(null);
    };
  }, [imageUri, prefs, screenW]);

  // ----- per-row tag editing local state ----------------------------------
  // The store keeps the canonical detection (item + box). Tag-string edits
  // live here so the user can tweak before save without thrashing the
  // streaming store.
  useEffect(() => {
    setTagsByRow((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (!next[r.id]) {
          next[r.id] = [r.item.label, ...r.item.tags].filter((t) => t.length > 0);
        }
      }
      return next;
    });
  }, [rows]);

  const onChangeTag = (rowId: string, tagIndex: number, value: string) => {
    setTagsByRow((prev) => {
      const tags = [...(prev[rowId] ?? [])];
      tags[tagIndex] = value;
      return { ...prev, [rowId]: tags };
    });
    setAutoFocusByRow((p) => ({ ...p, [rowId]: false }));
  };

  const onAddTag = (rowId: string) => {
    setTagsByRow((prev) => ({ ...prev, [rowId]: [...(prev[rowId] ?? []), ''] }));
    setAutoFocusByRow((p) => ({ ...p, [rowId]: true }));
  };

  const onRemoveTag = (rowId: string, tagIndex: number) => {
    setTagsByRow((prev) => {
      const before = prev[rowId] ?? [];
      const next = before.filter((_, i) => i !== tagIndex);
      return { ...prev, [rowId]: next.length ? next : [''] };
    });
  };

  const onDiscard = (rowId: string) => {
    getDetectionStore().getState().toggleInclude(rowId);
  };

  const onToggleSave = async (row: DetectionStoreRow) => {
    if (!activeHomeId || !processedUri) return;
    if (savingIds.has(row.id) || isBulkSaving) return;
    if (row.saved) return; // saved rows are frozen in this minimal port
    const tags = (tagsByRow[row.id] ?? [row.item.label, ...row.item.tags]).filter((t) => t.trim());
    const label = tags[0] ?? row.item.label;
    if (!label) return;
    setSavingIds((s) => new Set([...s, row.id]));
    try {
      getDetectionStore().getState().beginSave([row.id]);
      const ids = await addItems([
        {
          label,
          description: row.item.description ?? '',
          category: row.item.category ?? 'Other',
          tags,
          primaryPhotoUri: processedUri,
          additionalPhotoUris: [],
          notes: '',
          box: row.item.box,
        },
      ]);
      if (ids[0]) {
        getDetectionStore().getState().endSave([row.id]);
      }
    } finally {
      setSavingIds((s) => {
        const next = new Set(s);
        next.delete(row.id);
        return next;
      });
    }
  };

  const saveAllPending = async () => {
    if (!activeHomeId || !processedUri || isBulkSaving) return;
    const pending = rows.filter((r) => r.included && !r.saved && !savingIds.has(r.id));
    if (pending.length === 0) {
      router.replace('/');
      return;
    }
    setIsBulkSaving(true);
    try {
      const ids = pending.map((p) => p.id);
      getDetectionStore().getState().beginSave(ids);
      const payloads = pending.map((row) => {
        const tags = (tagsByRow[row.id] ?? [row.item.label, ...row.item.tags]).filter((t) =>
          t.trim(),
        );
        const label = tags[0] ?? row.item.label;
        return {
          label,
          description: row.item.description ?? '',
          category: row.item.category ?? 'Other',
          tags,
          primaryPhotoUri: processedUri,
          additionalPhotoUris: [],
          notes: '',
          box: row.item.box,
        };
      });
      await addItems(payloads);
      getDetectionStore().getState().endSave(ids);
      router.replace('/');
    } finally {
      setIsBulkSaving(false);
    }
  };

  const closeOut = () => {
    router.replace('/');
  };

  // ----- render -----------------------------------------------------------
  if (!imageUri) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlowBackdrop />
        <View style={[styles.centeredMsg, { paddingTop: insets.top + 80 }]}>
          <Feather name="image" size={42} color={colors.mutedForeground} />
          <Text style={[styles.title, { color: colors.foreground, marginTop: 16 }]}>
            No image selected
          </Text>
          <Text style={[styles.helper, { color: colors.mutedForeground, marginTop: 8 }]}>
            Pick or capture a photo before opening the detection screen.
          </Text>
          <Pressable
            onPress={() => router.replace('/')}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.primaryBtnLabel, { color: colors.primaryForeground }]}>
              Back to home
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const savedCount = rows.filter((r) => r.saved).length;
  const pendingValid = rows.filter((r) => !r.saved && r.included).length;
  const isLoading = phase === 'loading';
  const isStreaming = phase === 'streaming';

  const photoMax = Math.min(screenW - gutter * 2, isCompact ? 240 : 320);
  const photoH = Math.min((imgWH.h / imgWH.w) * photoMax, isCompact ? 180 : 240);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlowBackdrop />

      <View style={[styles.contentClamp, { maxWidth: contentMaxWidth }]}>
        <View
          style={[
            styles.topBar,
            {
              paddingHorizontal: gutter,
              paddingTop: Platform.OS === 'web' ? 16 : insets.top + 4,
            },
          ]}
        >
          <Pressable
            accessibilityLabel="Close"
            onPress={closeOut}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Feather name="x" size={18} color={colors.foreground} />
          </Pressable>

          <View style={styles.topBarCenter}>
            <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
              {isLoading ? 'scanning' : isStreaming ? 'discovering' : 'review'}
            </Text>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {isLoading
                ? 'Reading the room'
                : isStreaming
                  ? rows.length === 0
                    ? 'Scanning…'
                    : `${rows.length} found…`
                  : rows.length === 0
                    ? errorCode
                      ? 'Something went wrong'
                      : 'Nothing detected'
                    : `${rows.length} item${rows.length === 1 ? '' : 's'}`}
            </Text>
          </View>

          {savedCount > 0 ? (
            <View style={[styles.savedPill, { backgroundColor: colors.success }]}>
              <Feather name="check" size={12} color={colors.successForeground} />
              <Text style={[styles.savedPillText, { color: colors.successForeground }]}>
                {savedCount}
              </Text>
            </View>
          ) : (
            <View style={styles.iconBtnPlaceholder} />
          )}
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.photoWrap}>
            <View
              style={[
                styles.photoFrame,
                {
                  width: photoMax,
                  height: photoH,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Image
                source={processedUri ?? imageUri}
                style={styles.photo}
                contentFit="cover"
                transition={250}
              />
              {isLoading && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              )}
            </View>
          </View>

          <View style={[styles.rowsSection, { paddingHorizontal: gutter }]}>
            {isLoading ? (
              <View style={styles.helperWrap}>
                <Text style={[styles.helper, { color: colors.mutedForeground }]}>
                  Identifying every piece in this frame…
                </Text>
              </View>
            ) : !isStreaming && rows.length === 0 ? (
              <View style={styles.helperWrap}>
                <Text style={[styles.helper, { color: colors.mutedForeground }]}>
                  {errorCode
                    ? (errorMessage ?? 'Detection failed. Try again.')
                    : 'No objects detected. Try another angle or lighting.'}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.legendRow}>
                  <Text style={[styles.legend, { color: colors.mutedForeground }]}>
                    {isStreaming && rows.length === 0
                      ? 'AI is scanning your photo…'
                      : 'Tap a tag to rename · ✓ saves to inventory · swipe to discard'}
                  </Text>
                </View>

                {rows.map((row, idx) => (
                  <DetectionRow
                    key={row.id}
                    photoUri={processedUri ?? imageUri}
                    imageWidth={imgWH.w}
                    imageHeight={imgWH.h}
                    box={row.item.box}
                    tags={tagsByRow[row.id] ?? [row.item.label, ...row.item.tags]}
                    status={row.saved ? 'saved' : 'pending'}
                    isSaving={savingIds.has(row.id) || (isBulkSaving && !row.saved && row.included)}
                    index={idx}
                    autoFocusFirst={autoFocusByRow[row.id] ?? false}
                    onChangeTag={(i, v) => onChangeTag(row.id, i, v)}
                    onAddTag={() => onAddTag(row.id)}
                    onRemoveTag={(i) => onRemoveTag(row.id, i)}
                    onToggleSave={() => {
                      void onToggleSave(row);
                    }}
                    onDiscard={() => onDiscard(row.id)}
                  />
                ))}

                {isStreaming && (
                  <View style={styles.streamingHint}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[styles.streamingHintText, { color: colors.mutedForeground }]}>
                      Still scanning…
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        </ScrollView>

        {!isLoading && rows.length > 0 && (
          <View
            style={[
              styles.bottomBar,
              { paddingBottom: Math.max(insets.bottom, 16), paddingHorizontal: gutter },
            ]}
            pointerEvents="box-none"
          >
            <View
              style={[
                styles.bottomBarInner,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  maxWidth: isCompact ? '100%' : 420,
                },
              ]}
            >
              <Pressable
                accessibilityLabel="Close"
                onPress={closeOut}
                style={({ pressed }) => [styles.discardBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Feather name="x" size={22} color={colors.foreground} />
              </Pressable>
              <View style={[styles.bottomDivider, { backgroundColor: colors.border }]} />
              <Pressable
                accessibilityLabel={
                  pendingValid > 0 ? `Save remaining ${pendingValid} items and close` : 'Done'
                }
                onPress={() => {
                  void saveAllPending();
                }}
                disabled={isBulkSaving}
                style={({ pressed }) => [
                  styles.saveBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: isBulkSaving ? 0.7 : pressed ? 0.9 : 1,
                    shadowColor: colors.primary,
                  },
                ]}
              >
                {isBulkSaving ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Feather
                    name={pendingValid > 0 ? 'check-circle' : 'check'}
                    size={20}
                    color={colors.primaryForeground}
                  />
                )}
                <Text style={[styles.saveBtnLabel, { color: colors.primaryForeground }]}>
                  {isBulkSaving
                    ? 'Saving…'
                    : pendingValid > 0
                      ? `Save remaining ${pendingValid}`
                      : savedCount > 0
                        ? 'Done'
                        : 'Close'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  contentClamp: { flex: 1, width: '100%', alignSelf: 'center' },
  centeredMsg: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    gap: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPlaceholder: { width: 40, height: 40 },
  topBarCenter: { flex: 1, alignItems: 'center' },
  eyebrow: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    marginBottom: 2,
  },
  title: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 18,
    letterSpacing: -0.3,
  },
  savedPill: {
    minWidth: 40,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#3fa372',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  savedPillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  photoWrap: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 2,
    paddingBottom: 10,
  },
  photoFrame: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#1f1a14',
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
  photo: { width: '100%', height: '100%' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  rowsSection: { paddingTop: 2 },
  helperWrap: {
    paddingTop: 24,
    alignItems: 'center',
  },
  helper: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 280,
  },
  legendRow: { paddingBottom: 8 },
  legend: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    letterSpacing: 0.3,
    textAlign: 'center',
    opacity: 0.7,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingTop: 12,
  },
  bottomBarInner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    paddingHorizontal: 6,
    shadowColor: '#1c1b3f',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 10,
  },
  discardBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomDivider: {
    width: 1,
    height: 28,
    marginHorizontal: 4,
    opacity: 0.5,
  },
  saveBtn: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  streamingHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  streamingHintText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 0.2,
  },
  saveBtnLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  primaryBtn: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
  },
  primaryBtnLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    letterSpacing: 0.3,
  },
});
