import { startDetection } from '@/api/detect';
import { pollDetectionEvents } from '@/api/detect-poll';
import { getDetectStatus } from '@/api/detect-status';
import { labelCrop } from '@/api/label';
import { BoundingBoxOverlay } from '@/components/BoundingBoxOverlay';
import { DetectionRow } from '@/components/DetectionRow';
import { DrawBoxOverlay, type NormBox } from '@/components/DrawBoxOverlay';
import { GlowBackdrop } from '@/components/GlowBackdrop';
import LocationField from '@/components/LocationField';
import { QualityCard } from '@/components/QualityCard';
import { Snackbar } from '@/components/Snackbar';
import { useHomes } from '@/contexts/HomesContext';
import { useInventory } from '@/contexts/InventoryContext';
import { useColors } from '@/hooks/useColors';
import { useResponsive } from '@/hooks/useResponsive';
import { useReviewAutosave } from '@/hooks/useReviewAutosave';
import { useStartFailedRetry } from '@/hooks/useStartFailedRetry';
import { pickPrimaryPhotoUri } from '@/lib/annotated-photo';
import { CorrectionsQueue, buildCorrectionEvents } from '@/lib/corrections';
import { stageSubline, stageTitle } from '@/lib/detect-stages';
import { isPossibleDuplicate } from '@/lib/duplicates';
import { RUN_LOST_ERROR_CODE } from '@/lib/jobs';
import { buildLabels, labelsForDisplay } from '@/lib/labels';
import { startsExcluded, visibilityNote, visibilityVerdict } from '@/lib/partial-visibility';
import { removePendingCapture, upsertPendingCapture } from '@/lib/pending-captures';
import { pushRecentLocation } from '@/lib/recent-locations';
import { buildItemPayload, effectiveTags } from '@/lib/review-payload';
import { groupRows } from '@/lib/row-groups';
import { withSpan } from '@/observability/otel';
import { fetchAnnotatedPhoto } from '@/services/annotated-photo';
import { inspectCaptureQuality } from '@/services/image-quality';
import { renderThumbnail } from '@/services/thumbnail';
import { dispatchShot } from '@/services/walk-capture';
import {
  type DetectionRow as DetectionStoreRow,
  getDetectionStore,
  useDetectionStore,
} from '@/stores/detection-screen.store';
import {
  getJobsStore,
  markJobReviewed,
  patchJob,
  removeJob,
  useJobsStore,
} from '@/stores/jobs.store';
import { Prefs } from '@/stores/prefs';
import { addServerSuggestions } from '@/stores/suggestions.store';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
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

/** How long the post-save Undo snackbar stays before the loop continues. */
const UNDO_WINDOW_MS = 5_000;

/** Human copy for a failed save; the raw error goes to the console for diagnosis. */
function saveFailureMessage(err: unknown): string {
  console.error('[detection] save failed', err instanceof Error ? err.message : err);
  return "Couldn't save those items — tap Retry, or check the photo is still available.";
}

export default function DetectionScreen() {
  const params = useLocalSearchParams<{ imageUri?: string; runId?: string }>();
  const imageUri = typeof params.imageUri === 'string' ? params.imageUri : undefined;
  // Walk-mode/inbox resume: the run already exists server-side — skip
  // precheck/upload and follow it directly.
  const resumeRunId = typeof params.runId === 'string' && params.runId ? params.runId : undefined;
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { gutter, contentMaxWidth, isCompact, width: screenW, height: screenH } = useResponsive();
  const { items, addItems, deleteItems } = useInventory();
  const { activeHomeId } = useHomes();

  const phase = useDetectionStore((s) => s.phase);
  const runId = useDetectionStore((s) => s.runId);
  const rows = useDetectionStore((s) => s.rows);
  const scene = useDetectionStore((s) => s.scene);
  const errorCode = useDetectionStore((s) => s.errorCode);
  const photoSha256 = useDetectionStore((s) => s.photoSha256);

  const prefs = useMemo(() => {
    try {
      return Prefs.makeMmkv();
    } catch {
      return Prefs.makeInMemory();
    }
  }, []);

  const [processedUri, setProcessedUri] = useState<string | undefined>(undefined);
  /**
   * Server-rendered annotated photo (boxes burned in), downloaded to cache
   * once the run reaches review. Derived from photoSha256; null keeps the
   * existing raw-photo flow.
   */
  const [annotatedUri, setAnnotatedUri] = useState<string | null>(null);
  const annotatedAttemptRef = useRef<string | null>(null);
  const [imgWH, setImgWH] = useState<{ w: number; h: number }>({ w: screenW, h: screenW });
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [autoFocusByRow, setAutoFocusByRow] = useState<Record<string, boolean>>({});
  const [tagsByRow, setTagsByRow] = useState<Record<string, string[]>>({});
  // One location for the whole review: whatever the user picks lands on
  // every row saved from this screen ("everything on this shelf → garage").
  const [location, setLocation] = useState('');
  const [recentLocations, setRecentLocations] = useState<string[]>(() =>
    prefs.getRecentLocations(),
  );
  const [qaSuspect, setQaSuspect] = useState(false);
  /** Which fault the pre-upload gate found, in the user's words. */
  const [qaAdvice, setQaAdvice] = useState<string | null>(null);
  const [verdictDismissed, setVerdictDismissed] = useState(false);
  /** The one detection drawn in full on the photo (tap a box or a row thumbnail). */
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  /** Groups of identical detections the user has expanded into single rows. */
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  // Post-save undo window (2b/4): count + created item ids + review row ids.
  /** A save that threw (database/photo error): shown, never swallowed. */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<{
    count: number;
    itemIds: string[];
    rowIds: string[];
  } | null>(null);
  // Calm failure state: detection could not start (network error / 5xx).
  const startFailed =
    phase === 'review' && errorCode === 'detect_start_failed' && rows.length === 0;
  // The resumed run no longer exists server-side (restart / result TTL):
  // terminal, and re-runnable from the photo we still hold locally.
  const runLost = phase === 'review' && errorCode === 'run_not_found' && rows.length === 0;
  // Bumping the nonce relaunches detection (manual Retry / auto-retry).
  const { retryNonce, retryNow, resetAttempts } = useStartFailedRetry(startFailed);
  // Self-diagnosing failure detail captured at dispatch time (network reason
  // + the server URL it hit) — shown on the calm failure card so a retry
  // loop is explainable without a tethered console.
  const dispatchErrorDetail = useJobsStore((s) => {
    if (!startFailed || !resumeRunId) return undefined;
    return s.jobs.find((j) => j.runId === resumeRunId)?.lastError ?? undefined;
  });
  // Honest staged wait display (elapsed-keyed copy, no fake percentages).
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef(Date.now());
  const proceedRef = useRef<(() => void) | null>(null);
  const launchedRef = useRef<string | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const correctionsSentRef = useRef(false);
  const correctionsQueue = useMemo(() => new CorrectionsQueue(prefs), [prefs]);

  // Deliver any corrections a previous session failed to send.
  useEffect(() => {
    void correctionsQueue.flush();
  }, [correctionsQueue]);

  // Post the user's verdicts (accept/discard/relabel/drawn boxes) to the
  // training-data flywheel exactly once, when they leave the review screen.
  const submitCorrections = () => {
    if (correctionsSentRef.current) return;
    const st = getDetectionStore().getState();
    if (!st.photoSha256) return;
    const events = buildCorrectionEvents(st.rows, tagsByRow, st.scene, verdictDismissed);
    if (events.length === 0) return;
    correctionsSentRef.current = true;
    void correctionsQueue.submit({
      photoSha256: st.photoSha256,
      model: 'unknown',
      capturedAt: new Date().toISOString(),
      scene: st.scene,
      events,
    });
  };

  // ----- effects: reset + crash-resume + run detection ---------------------
  useEffect(() => {
    if (!imageUri) return;
    const runKey = `${imageUri}:${resumeRunId ?? ''}:${retryNonce}`;
    if (launchedRef.current === runKey) return;
    launchedRef.current = runKey;

    // Fresh capture or retry: clear per-photo local state so a relaunched
    // detection (camera-first loop, auto-retry) starts from a clean slate.
    setProcessedUri(undefined);
    setAnnotatedUri(null);
    annotatedAttemptRef.current = null;
    setTagsByRow({});
    setLocation('');
    setAutoFocusByRow({});
    setQaSuspect(false);
    setQaAdvice(null);
    setVerdictDismissed(false);
    setHighlightedId(null);
    setExpandedGroups(new Set());
    setSaveToast(null);
    correctionsSentRef.current = false;
    startedAtRef.current = Date.now();
    setElapsedMs(0);

    const store = getDetectionStore();
    store.getState().reset();

    const controller = new AbortController();

    // Consume a run's poll events into the store; shared by fresh + resumed runs.
    const followRun = async (runId: string): Promise<void> => {
      prefs.setLastDetectionRunId(runId);
      for await (const ev of pollDetectionEvents(runId, { signal: controller.signal })) {
        if (controller.signal.aborted) break;
        // Server duplicate hints go to the quiet tidy-up queue, never to a
        // blocking prompt in the middle of review.
        if (ev.type === 'merge-suggestions') {
          addServerSuggestions(ev.suggestions);
          continue;
        }
        if (ev.type === 'done' || ev.type === 'error') prefs.setLastDetectionRunId(null);
        store.getState().handleEvent(ev);
      }
    };

    void (async () => {
      // Inbox/walk-mode resume: display the original capture and replay the
      // existing run's events — no upload, no QA gate.
      if (resumeRunId) {
        setProcessedUri(imageUri);
        try {
          const src = await Image.loadAsync(imageUri);
          if (src.width > 0 && src.height > 0) setImgWH({ w: src.width, h: src.height });
          src.release();
        } catch {
          // screen-size default keeps boxes roughly placed
        }
        try {
          await followRun(resumeRunId);
        } catch {
          store.getState().handleEvent({ type: 'error', code: 'detect_run_failed' });
        }
        return;
      }

      // crash-resume: a prior run (completed OR still running server-side)
      // resumes by polling the same runId — no re-upload, no lost work.
      const lastId = prefs.getLastDetectionRunId();
      if (lastId) {
        try {
          const st = await getDetectStatus(lastId);
          if (st.status === 'completed' || st.status === 'running') {
            await followRun(lastId);
            return;
          }
        } catch {
          // fall through to launch a fresh run
        }
        prefs.setLastDetectionRunId(null);
      }

      // compress image (mirror design behavior, ~1280px wide JPEG).
      //
      // Decode through expo-image's loader and hand the native ref to the
      // manipulator instead of calling the legacy `manipulateAsync(uri)`.
      // The legacy path decodes via the RN bridge image loader, which drops
      // the EXIF orientation of camera-roll JPEGs: the manipulator's
      // fix-orientation pass then no-ops and the saved output is baked 90°
      // rotated with no orientation metadata. expo-image's decoder applies
      // EXIF (it's what renders photos upright on screen), so rendering from
      // its ref bakes upright pixels into the processed JPEG.
      let uploadUri = imageUri;
      let w = screenW;
      let h = screenW;
      try {
        const source = await Image.loadAsync(imageUri);
        try {
          const rendered = await ImageManipulator.ImageManipulator.manipulate(source)
            .resize({ width: 1280 })
            .renderAsync();
          const saved = await rendered.saveAsync({
            compress: 0.7,
            format: ImageManipulator.SaveFormat.JPEG,
          });
          rendered.release();
          uploadUri = saved.uri;
          if (saved.width && saved.height) {
            w = saved.width;
            h = saved.height;
          }
        } finally {
          source.release();
        }
      } catch {
        // fall back to original uri
      }
      setProcessedUri(uploadUri);
      setImgWH({ w, h });

      const stream = async (): Promise<void> => {
        try {
          await withSpan('detect.run', async () => {
            const handle = await startDetection({
              fileUri: uploadUri,
              fileName: 'frame.jpg',
              mimeType: 'image/jpeg',
            });
            // The capture reached the server — it is no longer at risk.
            prefs.setPendingCaptures(removePendingCapture(prefs.getPendingCaptures(), imageUri));
            resetAttempts();
            await followRun(handle.runId);
          });
        } catch (err) {
          if (!controller.signal.aborted) {
            // Never lose a capture: queue the photo and surface the calm
            // "saved for later" state instead of a raw error.
            prefs.setPendingCaptures(upsertPendingCapture(prefs.getPendingCaptures(), imageUri));
            store.getState().handleEvent({
              type: 'error',
              code: 'detect_start_failed',
              message: err instanceof Error ? err.message : String(err),
            });
          }
          prefs.setLastDetectionRunId(null);
        }
      };

      // Pre-upload quality gate. This is the SAME on-device pixel analysis
      // the live viewfinder coaches with (mean luma + Laplacian focus), so
      // the two can never disagree about a frame, and the copy is identical.
      // Fails open: a null report means "no opinion", never a block.
      // Advisory only — the server's model verdict remains authoritative.
      const quality = await inspectCaptureQuality(uploadUri);
      if (quality?.advice) {
        proceedRef.current = () => {
          setQaSuspect(false);
          void stream();
        };
        setQaAdvice(quality.advice);
        setQaSuspect(true);
        return;
      }
      await stream();
    })();

    return () => {
      controller.abort();
      // best-effort: clear pending pref so a new mount runs fresh
      prefs.setLastDetectionRunId(null);
    };
  }, [imageUri, prefs, screenW, retryNonce, resumeRunId, resetAttempts]);

  // Annotated primary photo: once the run reaches review, try the server's
  // annotated render of the run's photo. One attempt per run — a 404 (no
  // render for this photo) or a failed download simply keeps the raw-photo
  // flow. Never blocks saving; the effect only sets state when it wins.
  useEffect(() => {
    if (!photoSha256 || phase !== 'review') return;
    if (annotatedAttemptRef.current === photoSha256) return;
    annotatedAttemptRef.current = photoSha256;
    let alive = true;
    void fetchAnnotatedPhoto(photoSha256).then((uri) => {
      if (alive && uri) setAnnotatedUri(uri);
    });
    return () => {
      alive = false;
    };
  }, [photoSha256, phase]);

  // Possible-duplicate flags (suggest-never-auto): once per run, compare each
  // row's type+color labels against the existing inventory; flagged rows
  // start EXCLUDED from save-all and carry a subtle marker.
  const [dupRowIds, setDupRowIds] = useState<Set<string>>(() => new Set());
  const dupCheckedRef = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== 'review' || rows.length === 0) return;
    const key = runId ?? resumeRunId ?? imageUri ?? 'run';
    if (dupCheckedRef.current === key) return;
    dupCheckedRef.current = key;
    const inventorySets = items.map((it) => labelsForDisplay(it));
    const flagged = new Set<string>();
    const st = getDetectionStore().getState();
    for (const r of st.rows) {
      const rowLabels = buildLabels({
        label: r.item.label,
        description: r.item.description ?? '',
        category: r.item.category ?? 'Other',
        tags: r.item.tags,
      });
      const isDupe = isPossibleDuplicate(rowLabels, inventorySets);
      if (isDupe) flagged.add(r.id);
      // A sliver is a truncation artifact rather than a possession you can
      // inventory, so it starts unchecked — same one-tap flip as duplicates.
      // 'clipped' rows stay checked: they are real things, just not fully
      // pictured.
      const excludeForVisibility = startsExcluded(visibilityVerdict(r.item.box));
      if ((isDupe || excludeForVisibility) && r.included) st.toggleInclude(r.id);
    }
    setDupRowIds(flagged);
  }, [phase, rows.length, runId, resumeRunId, imageUri, items]);

  // Reflect the loss on the job itself, so the inbox card shows the same
  // state even if the user backs out without re-running.
  const lostMarkedRef = useRef<string | null>(null);
  useEffect(() => {
    const deadRunId = resumeRunId ?? runId;
    if (!runLost || !deadRunId || lostMarkedRef.current === deadRunId) return;
    lostMarkedRef.current = deadRunId;
    patchJob(deadRunId, { status: 'failed', errorCode: RUN_LOST_ERROR_CODE });
  }, [runLost, resumeRunId, runId]);

  // One tap re-runs the lost job: fresh runId, same photo, same session.
  const rerunLostJob = () => {
    const deadRunId = resumeRunId ?? runId;
    const job = deadRunId
      ? getJobsStore()
          .getState()
          .jobs.find((j) => j.runId === deadRunId)
      : undefined;
    if (deadRunId) removeJob(deadRunId);
    const photoUri = job?.photoUri ?? imageUri;
    if (photoUri) {
      void dispatchShot(prefs, photoUri, job ? { roomSessionId: job.roomSessionId } : {});
    }
    router.replace('/');
  };

  // The undo window must not fire callbacks after the screen unmounts.
  useEffect(
    () => () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    },
    [],
  );

  // Tick the staged-wait display once a second while detection runs.
  useEffect(() => {
    const waiting = (phase === 'loading' && !qaSuspect) || phase === 'streaming';
    if (!waiting) return;
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1_000);
    return () => clearInterval(timer);
  }, [phase, qaSuspect]);

  useReviewAutosave(runId, rows, tagsByRow, setTagsByRow, prefs);

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

  /** Chosen location for this review ('' → none); recorded on save. */
  const chosenLocation = location.trim();

  /** A saved location joins the recents list — one-tap next time. */
  const recordLocation = () => {
    if (!chosenLocation) return;
    const next = pushRecentLocation(prefs.getRecentLocations(), chosenLocation);
    prefs.setRecentLocations(next);
    setRecentLocations(next);
  };

  const makeThumbnail = (box: DetectionStoreRow['item']['box']) =>
    imageUri ? renderThumbnail(imageUri, box) : Promise.resolve(null);

  const onToggleSave = async (row: DetectionStoreRow) => {
    if (!activeHomeId || !processedUri) return;
    if (savingIds.has(row.id) || isBulkSaving) return;
    if (row.saved) return; // saved rows are frozen in this minimal port
    const tags = effectiveTags(row, tagsByRow[row.id]);
    if (!(tags[0] ?? row.item.label)) return;
    const primaryPhotoUri = pickPrimaryPhotoUri(annotatedUri, processedUri);
    if (!primaryPhotoUri) return;
    setSavingIds((s) => new Set([...s, row.id]));
    try {
      getDetectionStore().getState().beginSave([row.id]);
      const ids = await addItems([
        buildItemPayload(
          row,
          tags,
          primaryPhotoUri,
          await makeThumbnail(row.item.box),
          chosenLocation || null,
        ),
      ]);
      if (ids[0]) {
        getDetectionStore().getState().endSave([row.id]);
        recordLocation();
      }
    } catch (err) {
      getDetectionStore().getState().failSave([row.id]);
      setSaveError(saveFailureMessage(err));
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
    const primaryPhotoUri = pickPrimaryPhotoUri(annotatedUri, processedUri);
    if (!primaryPhotoUri) return;
    setIsBulkSaving(true);
    try {
      const ids = pending.map((p) => p.id);
      getDetectionStore().getState().beginSave(ids);
      // Sequential (not Promise.all): each thumbnail render holds decoded
      // bitmap memory; large scenes can carry dozens of rows.
      const payloads = [];
      for (const row of pending) {
        const tags = effectiveTags(row, tagsByRow[row.id]);
        payloads.push(
          buildItemPayload(
            row,
            tags,
            primaryPhotoUri,
            await makeThumbnail(row.item.box),
            chosenLocation || null,
          ),
        );
      }
      const itemIds = await addItems(payloads);
      getDetectionStore().getState().endSave(ids);
      recordLocation();
      submitCorrections();
      // Walk mode: reviewing + saving clears this job from the inbox.
      const reviewedRunId = runId ?? resumeRunId;
      if (reviewedRunId) markJobReviewed(reviewedRunId);
      // Non-blocking undo window instead of navigating away; when it
      // expires, chain straight into the next capture (camera-first loop).
      setSaveToast({ count: payloads.length, itemIds, rowIds: ids });
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => {
        setSaveToast(null);
        void continueCapture();
      }, UNDO_WINDOW_MS);
    } catch (err) {
      // ponytail: addItems is not transactional, so a mid-batch failure can
      // leave earlier rows persisted while the store still shows them
      // pending; a retry re-saves only what the DB rejected once the cause
      // (e.g. a duplicate tag) is fixed. Wrap addItems in a transaction if
      // partial saves ever show up in practice.
      getDetectionStore()
        .getState()
        .failSave(pending.map((p) => p.id));
      setSaveError(saveFailureMessage(err));
    } finally {
      setIsBulkSaving(false);
    }
  };

  // ----- post-save loop: undo · view collection · shoot next ---------------
  const dismissToast = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    setSaveToast(null);
  };

  const undoLastSave = async () => {
    const toast = saveToast;
    if (!toast) return;
    dismissToast();
    await deleteItems(toast.itemIds);
    const store = getDetectionStore().getState();
    for (const rowId of toast.rowIds) {
      store.patchRow(rowId, { saved: false });
    }
  };

  const goToCollection = () => {
    dismissToast();
    router.replace('/');
  };

  // Camera-first loop: chain shoot → review → save → shoot. Falls back to
  // the collection when the camera is unavailable (simulator) or denied.
  const continueCapture = async () => {
    try {
      const perm = await ImagePicker.getCameraPermissionsAsync();
      if (!perm.granted) {
        router.replace('/');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8 });
      const uri = result.canceled ? undefined : result.assets?.[0]?.uri;
      if (uri) {
        // Walk mode: dispatch in the background and land home — the shot
        // shows up as a processing pill, then in the review inbox.
        void dispatchShot(prefs, uri);
      }
      router.replace('/');
    } catch {
      router.replace('/');
    }
  };

  const closeOut = () => {
    submitCorrections();
    router.replace('/');
  };

  // ----- draw-to-teach ------------------------------------------------------
  const [isLabelingCrop, setIsLabelingCrop] = useState(false);
  const onBoxDrawn = async (box: NormBox) => {
    if (!processedUri || isLabelingCrop) return;
    setIsLabelingCrop(true);
    const store = getDetectionStore();
    try {
      const crop = await ImageManipulator.manipulateAsync(
        processedUri,
        [
          {
            crop: {
              originX: Math.round(box.x * imgWH.w),
              originY: Math.round(box.y * imgWH.h),
              width: Math.max(1, Math.round(box.width * imgWH.w)),
              height: Math.max(1, Math.round(box.height * imgWH.h)),
            },
          },
        ],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );
      const suggestion = await labelCrop(crop.uri);
      store.getState().addManualRow({
        label: suggestion.label,
        description: suggestion.description,
        category: suggestion.category,
        tags: suggestion.tags,
        box,
      });
    } catch {
      // The gesture never dead-ends: fall back to a blank row the user names.
      store.getState().addManualRow({
        label: 'new item',
        description: '',
        category: 'Other',
        tags: [],
        box,
      });
    } finally {
      setIsLabelingCrop(false);
    }
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
  /**
   * One entry per rendered row. Identical detections collapse into a single
   * entry carrying the whole group, so a stack of nine identical books is one
   * row and one tap — expandable when the user wants each one.
   */
  const displayRows = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const out: Array<{ row: DetectionStoreRow; group: DetectionStoreRow[] }> = [];
    for (const g of groupRows(rows.map((r) => ({ id: r.id, label: r.item.label })))) {
      const members = g.rowIds
        .map((id) => byId.get(id))
        .filter((r): r is DetectionStoreRow => r !== undefined);
      const lead = members[0];
      if (!lead) continue;
      if (members.length === 1 || expandedGroups.has(lead.id)) {
        for (const m of members) out.push({ row: m, group: [m] });
        continue;
      }
      out.push({ row: lead, group: members });
    }
    return out;
  }, [rows, expandedGroups]);

  /** Saving a collapsed row saves every detection it stands for. */
  const onToggleSaveGroup = async (group: DetectionStoreRow[]) => {
    for (const row of group) await onToggleSave(row);
  };

  const pendingValid = rows.filter((r) => !r.saved && r.included).length;
  const isLoading = phase === 'loading' && !qaSuspect;
  const isStreaming = phase === 'streaming';
  const serverRejected = scene !== null && scene.verdict !== 'ok' && !verdictDismissed;
  const rejectionCopy = serverRejected ? VERDICT_COPY[scene.verdict] : null;

  // Size the frame to the photo's real aspect ratio (contain, not cover) so
  // normalized detection boxes map 1:1 onto the rendered pixels. The photo
  // takes the full width and up to ~55% of the screen: on a phone this is the
  // difference between a thumbnail and a picture you can actually inspect.
  const frameMaxW = Math.min(screenW - gutter * 2, isCompact ? 420 : 520);
  const frameMaxH = Math.round(screenH * (isCompact ? 0.55 : 0.6));
  const frameScale = Math.min(frameMaxW / imgWH.w, frameMaxH / imgWH.h);
  const photoMax = Math.max(1, Math.round(imgWH.w * frameScale));
  const photoH = Math.max(1, Math.round(imgWH.h * frameScale));

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
              {isLoading || isStreaming
                ? stageTitle({
                    elapsedMs,
                    itemCount: rows.length,
                    expectedTotal: scene?.estimatedTotalItems ?? null,
                  })
                : rows.length === 0
                  ? runLost
                    ? 'Still yours to run'
                    : startFailed
                      ? 'Photo saved'
                      : errorCode
                        ? 'We hit a snag'
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
                contentFit="contain"
                transition={250}
              />
              <BoundingBoxOverlay
                imageWidth={imgWH.w}
                imageHeight={imgWH.h}
                viewWidth={photoMax}
                viewHeight={photoH}
                isLoading={isLoading || (isStreaming && rows.length === 0)}
                highlightedId={highlightedId}
                onPressBox={(id) => setHighlightedId((cur) => (cur === id ? null : id))}
                boxes={rows.map((r) => ({
                  id: r.id,
                  label: r.item.label,
                  box: r.item.box,
                  included: r.included,
                  saved: r.saved,
                }))}
              />
              <DrawBoxOverlay
                viewWidth={photoMax}
                viewHeight={photoH}
                enabled={!isLoading && !qaSuspect && !serverRejected}
                onBoxDrawn={(box) => {
                  void onBoxDrawn(box);
                }}
              />
              {(isLoading || isLabelingCrop) && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              )}
            </View>
          </View>

          {qaSuspect && (
            <QualityCard
              icon="camera-off"
              // Names the actual fault using the same wording the live
              // viewfinder used; falls back to the original copy if the
              // report arrived without advice.
              title={qaAdvice ?? 'This photo looks too dark or blurry'}
              body="Detection works best on a sharp, well-lit frame. Retake it, or send this one anyway."
              primaryLabel="Retake"
              onPrimary={closeOut}
              secondaryLabel="Use anyway"
              onSecondary={() => proceedRef.current?.()}
              colors={colors}
              actions={[
                {
                  icon: 'camera',
                  label: 'Retake',
                  hint: 'Discard this photo and capture a new one',
                  onPress: closeOut,
                  variant: 'primary',
                },
                {
                  icon: 'check',
                  label: 'Use anyway',
                  hint: 'Send this photo to detection as it is',
                  onPress: () => proceedRef.current?.(),
                },
              ]}
            />
          )}

          {serverRejected && rejectionCopy && (
            <QualityCard
              icon="alert-triangle"
              title={rejectionCopy.title}
              body={scene?.verdictReason ?? rejectionCopy.body}
              primaryLabel="Retake"
              onPrimary={closeOut}
              secondaryLabel={rows.length > 0 ? 'Keep results anyway' : 'Dismiss'}
              onSecondary={() => setVerdictDismissed(true)}
              colors={colors}
              actions={[
                {
                  icon: 'camera',
                  label: 'Retake',
                  hint: 'Discard this photo and capture a new one',
                  onPress: closeOut,
                  variant: 'primary',
                },
                rows.length > 0
                  ? {
                      icon: 'check',
                      label: 'Keep results anyway',
                      hint: 'Ignore the verdict and review the detected items',
                      onPress: () => setVerdictDismissed(true),
                    }
                  : {
                      icon: 'x',
                      label: 'Dismiss',
                      hint: 'Dismiss the verdict',
                      onPress: () => setVerdictDismissed(true),
                    },
              ]}
            />
          )}

          <View style={[styles.rowsSection, { paddingHorizontal: gutter }]}>
            {qaSuspect || serverRejected ? null : isLoading ? (
              <View style={styles.helperWrap}>
                <Text style={[styles.helper, { color: colors.mutedForeground }]}>
                  {stageSubline(elapsedMs)}
                </Text>
              </View>
            ) : !isStreaming && rows.length === 0 ? (
              runLost ? (
                <QualityCard
                  icon="rotate-ccw"
                  iconColor={colors.mutedForeground}
                  title="The server lost track of this one"
                  body="Nothing is gone — your photo is still right here. Run it again and the results land back in your inbox."
                  primaryLabel="Run it again"
                  onPrimary={rerunLostJob}
                  secondaryLabel="View collection"
                  onSecondary={closeOut}
                  colors={colors}
                  actions={[
                    {
                      icon: 'rotate-cw',
                      label: 'Run it again',
                      hint: 'Re-run detection on this photo',
                      onPress: rerunLostJob,
                      variant: 'primary',
                    },
                    {
                      icon: 'grid',
                      label: 'View collection',
                      hint: 'Go back to your collection',
                      onPress: closeOut,
                    },
                  ]}
                />
              ) : startFailed ? (
                <QualityCard
                  icon="wifi-off"
                  iconColor={colors.mutedForeground}
                  title="Saved — will catalog when the server is reachable"
                  body={
                    dispatchErrorDetail
                      ? `${dispatchErrorDetail}\n\nYour photo is kept safe and will be retried automatically.`
                      : 'Your photo is kept safe and will be retried automatically. You can also retry now.'
                  }
                  primaryLabel="Retry now"
                  onPrimary={retryNow}
                  secondaryLabel="View collection"
                  onSecondary={closeOut}
                  colors={colors}
                  actions={[
                    {
                      icon: 'rotate-cw',
                      label: 'Retry now',
                      hint: 'Retry detection on this saved photo',
                      onPress: retryNow,
                      variant: 'primary',
                    },
                    {
                      icon: 'grid',
                      label: 'View collection',
                      hint: 'Go back to your collection',
                      onPress: closeOut,
                    },
                  ]}
                />
              ) : (
                <View style={styles.helperWrap}>
                  <Text style={[styles.helper, { color: colors.mutedForeground }]}>
                    {errorCode
                      ? "We couldn't finish reading this photo — mind trying again in a moment?"
                      : "We couldn't make out any items here. A little more light or a closer angle usually does it."}
                  </Text>
                </View>
              )
            ) : (
              <>
                <View style={styles.legendRow}>
                  <Text style={[styles.legend, { color: colors.mutedForeground }]}>
                    {isStreaming && rows.length === 0
                      ? 'AI is scanning your photo…'
                      : 'Tap a label to edit · + adds a label · drag on the photo to box a missed item'}
                  </Text>
                </View>

                <View style={styles.locationSection} testID="review-location">
                  <Text style={[styles.locationLabel, { color: colors.mutedForeground }]}>
                    Location for these items
                  </Text>
                  <LocationField
                    value={location}
                    onChange={setLocation}
                    recents={recentLocations}
                  />
                </View>

                {displayRows.map(({ row, group }, idx) => (
                  <View key={row.id}>
                    {dupRowIds.has(row.id) && (
                      <View style={styles.dupFlag} testID="dup-flag">
                        <Feather name="copy" size={11} color={colors.mutedForeground} />
                        <Text style={[styles.dupFlagText, { color: colors.mutedForeground }]}>
                          Similar item already in your collection — tap to include anyway
                        </Text>
                      </View>
                    )}
                    {visibilityNote(visibilityVerdict(row.item.box)) && (
                      <View style={styles.dupFlag} testID="partial-flag">
                        <Feather name="maximize" size={11} color={colors.mutedForeground} />
                        <Text style={[styles.dupFlagText, { color: colors.mutedForeground }]}>
                          {visibilityNote(visibilityVerdict(row.item.box))}
                        </Text>
                      </View>
                    )}
                    <DetectionRow
                      photoUri={processedUri ?? imageUri}
                      imageWidth={imgWH.w}
                      imageHeight={imgWH.h}
                      box={row.item.box}
                      tags={tagsByRow[row.id] ?? [row.item.label, ...row.item.tags]}
                      status={row.saved ? 'saved' : 'pending'}
                      isSaving={
                        savingIds.has(row.id) || (isBulkSaving && !row.saved && row.included)
                      }
                      index={idx}
                      autoFocusFirst={autoFocusByRow[row.id] ?? false}
                      groupCount={group.length}
                      onExpandGroup={() => setExpandedGroups((prev) => new Set([...prev, row.id]))}
                      isHighlighted={highlightedId === row.id}
                      onPressThumb={() =>
                        setHighlightedId((cur) => (cur === row.id ? null : row.id))
                      }
                      onChangeTag={(i, v) => onChangeTag(row.id, i, v)}
                      onAddTag={() => onAddTag(row.id)}
                      onRemoveTag={(i) => onRemoveTag(row.id, i)}
                      onToggleSave={() => {
                        void onToggleSaveGroup(group);
                      }}
                      onDiscard={() => {
                        for (const r of group) onDiscard(r.id);
                      }}
                    />
                  </View>
                ))}

                {isStreaming && (
                  <View style={styles.streamingHint}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[styles.streamingHintText, { color: colors.mutedForeground }]}>
                      {stageSubline(elapsedMs)}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        </ScrollView>

        {!isLoading && rows.length > 0 && !qaSuspect && !serverRejected && (
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
                testID="save-all"
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
                  <>
                    <Feather
                      name={pendingValid > 0 ? 'check-circle' : 'check'}
                      size={18}
                      color={colors.primaryForeground}
                    />
                    <Text style={[styles.saveBtnLabel, { color: colors.primaryForeground }]}>
                      {pendingValid > 0
                        ? `Save ${pendingValid} item${pendingValid === 1 ? '' : 's'}`
                        : 'Done'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}

        <Snackbar
          visible={saveError !== null}
          testID="save-error-snackbar"
          message={saveError ?? ''}
          actionLabel="Retry"
          onAction={() => {
            setSaveError(null);
            void saveAllPending();
          }}
          secondaryLabel="Dismiss"
          onSecondary={() => setSaveError(null)}
        />
        <Snackbar
          visible={saveToast !== null}
          testID="save-undo-snackbar"
          message={
            saveToast
              ? `${saveToast.count} item${saveToast.count === 1 ? '' : 's'} saved · ${items.length} in your home`
              : ''
          }
          actionLabel="Undo"
          onAction={() => {
            void undoLastSave();
          }}
          secondaryLabel="View collection"
          onSecondary={goToCollection}
        />
      </View>
    </View>
  );
}

const VERDICT_COPY: Record<string, { title: string; body: string }> = {
  too_dark: {
    title: 'Photo rejected: too dark',
    body: 'The scene is too dark to identify objects reliably. Turn on a light and retake.',
  },
  too_blurry: {
    title: 'Photo rejected: too blurry',
    body: 'The frame is blurred. Hold the phone steady and retake.',
  },
  too_far: {
    title: 'Photo rejected: too far away',
    body: 'Objects are too small to identify. Step closer and retake.',
  },
  not_a_scene: {
    title: 'Photo rejected',
    body: 'This does not look like a shelf, drawer, or room to inventory.',
  },
};

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
  locationSection: {
    paddingBottom: 10,
  },
  locationLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    opacity: 0.7,
  },
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
  dupFlag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingTop: 10,
    paddingBottom: 2,
  },
  dupFlagText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 0.1,
    flex: 1,
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
