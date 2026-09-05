import { CaptureReel } from '@/components/Viewfinder/CaptureReel';
import { CoachOverlay } from '@/components/Viewfinder/CoachOverlay';
import { FlyToTray } from '@/components/Viewfinder/FlyToTray';
import { ReadinessStrip } from '@/components/Viewfinder/ReadinessStrip';
import { useColors } from '@/hooks/useColors';
import { useLiveCount } from '@/hooks/useLiveCount';
import { useLiveQuality } from '@/hooks/useLiveQuality';
import { initialQueueState, queueNeedsClock, queueReduce } from '@/lib/capture-queue';
import { dispatchShot } from '@/services/walk-capture';
import { useJobsStore } from '@/stores/jobs.store';
import { Prefs } from '@/stores/prefs';
import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Custom viewfinder with live capture coaching and a NARRATED shot journey.
 *
 * Walk mode keeps the camera live, but every shot's path is visible: the
 * frame flies onto the capture reel — a floating vertical film strip where
 * EACH shot keeps its own frame and live status
 * ("Sending… → Reading the scene… → ✓ N items found") until it resolves.
 * Completed runs accumulate on the reel's ready chip; tapping the reel opens
 * the review inbox. Nothing about a shot is ever silent — including failure
 * ("Saved — will retry"). The Done pill by the shutter makes leaving
 * explicit: shots keep processing after the camera closes.
 */

/** Reel position (bottom-left, clear of the centered shutter). */
const REEL_LEFT = 20;
const REEL_BOTTOM_GAP = 24;
/** Matches the reel's thumbnail size (fly-in landing slot). */
const REEL_THUMB = 44;

export default function CaptureScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height: screenH } = useWindowDimensions();
  const cameraRef = useRef<CameraView | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [shotCount, setShotCount] = useState(0);

  const prefs = useMemo(() => {
    try {
      return Prefs.makeMmkv();
    } catch {
      return Prefs.makeInMemory();
    }
  }, []);

  // ----- the shot journey (reel narration) ---------------------------------
  const [reel, dispatchReel] = useReducer(queueReduce, undefined, initialQueueState);
  const shotKeyRef = useRef(0);
  const [flyingShot, setFlyingShot] = useState<{ uri: string; key: number } | null>(null);

  const jobs = useJobsStore((s) => s.jobs);
  const readyCount = jobs.filter((j) => j.status === 'ready' && !j.reviewed).length;

  // Every processing frame resolves through the central jobs store.
  useEffect(() => {
    for (const shot of reel) {
      if (shot.phase !== 'processing' || !shot.runId) continue;
      const job = jobs.find((j) => j.runId === shot.runId);
      if (!job) continue;
      if (job.status === 'ready') {
        dispatchReel({
          type: 'run_ready',
          runId: shot.runId,
          itemCount: job.itemCount,
          at: Date.now(),
        });
      } else if (job.status === 'failed') {
        dispatchReel({ type: 'run_failed', runId: shot.runId, at: Date.now() });
      }
    }
  }, [reel, jobs]);

  // One clock drives the staged copy AND sweeps lingering frames off the
  // reel once their done/failed moment has been seen.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const reelTicks = queueNeedsClock(reel);
  useEffect(() => {
    if (!reelTicks) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      dispatchReel({ type: 'prune', now });
    }, 1_000);
    return () => clearInterval(timer);
  }, [reelTicks]);

  // ----- first-run narrative ------------------------------------------------
  const [introVisible, setIntroVisible] = useState(() => !prefs.getCaptureIntroSeen());
  const dismissIntro = () => {
    if (!introVisible) return;
    setIntroVisible(false);
    prefs.setCaptureIntroSeen();
  };

  // ----- live coaching ------------------------------------------------------
  const {
    hint,
    ready,
    signals,
    suspendForCapture,
    resumeAfterCapture,
    injectServerAdvice,
    rememberShot,
  } = useLiveQuality({
    camera: cameraRef,
    enabled: cameraReady && !isCapturing,
  });

  const { count, uncertain, available } = useLiveCount({
    camera: cameraRef,
    active: cameraReady && !isCapturing && ready,
    onGuidance: injectServerAdvice,
  });

  const handleShutter = async () => {
    const view = cameraRef.current;
    if (!view || isCapturing) return;
    setIsCapturing(true);
    // Mutex: the sampling loop must not contend for the camera.
    suspendForCapture();
    try {
      const photo = await view.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) {
        dismissIntro();
        setShotCount((n) => n + 1);
        void rememberShot(photo.uri);
        // Narrate + show the frame flying onto the reel, then dispatch.
        shotKeyRef.current += 1;
        const key = `shot-${shotKeyRef.current}`;
        dispatchReel({ type: 'shutter', key, uri: photo.uri, at: Date.now() });
        setFlyingShot({ uri: photo.uri, key: shotKeyRef.current });
        void dispatchShot(prefs, photo.uri).then(
          (result) =>
            dispatchReel(
              result.ok && result.runId
                ? { type: 'dispatched', key, runId: result.runId }
                : { type: 'dispatch_failed', key, at: Date.now() },
            ),
          () => dispatchReel({ type: 'dispatch_failed', key, at: Date.now() }),
        );
      }
    } catch {
      // A failed frame is not worth a dialog mid-walk; the user can shoot again.
    } finally {
      setIsCapturing(false);
      resumeAfterCapture();
    }
  };

  // Leaving the camera: the very FIRST completed run ever lands the user on
  // its inbox card once, so the review step teaches itself.
  const handleClose = () => {
    if (!prefs.getFirstReviewDone() && jobs.some((j) => j.status === 'ready' && !j.reviewed)) {
      prefs.setFirstReviewDone();
      router.replace('/inbox');
      return;
    }
    router.back();
  };

  const paddingTop = Platform.OS === 'web' ? 16 : insets.top + 8;
  const shutterBottom = Math.max(insets.bottom, 20);
  // The reel is bottom-anchored and grows upward; new shots fly into the
  // bottom slot.
  const reelBottom = shutterBottom + REEL_BOTTOM_GAP;
  const flyTargetY = screenH - reelBottom - REEL_THUMB;

  if (!permission) {
    return <View style={[styles.container, { backgroundColor: colors.background }]} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <Feather name="camera-off" size={34} color={colors.mutedForeground} />
        <Text style={[styles.permissionTitle, { color: colors.foreground }]}>One quick step</Text>
        <Text style={[styles.permissionBody, { color: colors.mutedForeground }]}>
          Allow camera access and we can start photographing your things.
        </Text>
        <Pressable
          testID="capture-grant"
          onPress={() => void requestPermission()}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
            Allow camera
          </Text>
        </Pressable>
        <Pressable testID="capture-close" onPress={() => router.back()} style={styles.textBtn}>
          <Text style={[styles.textBtnLabel, { color: colors.mutedForeground }]}>Not now</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        onCameraReady={() => setCameraReady(true)}
      />

      <View style={[styles.topBar, { paddingTop }]} pointerEvents="box-none">
        <Pressable
          testID="capture-close"
          accessibilityLabel="Done"
          onPress={handleClose}
          style={({ pressed }) => [styles.roundBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="x" size={20} color="#ffffff" />
        </Pressable>

        {available ? (
          <View style={styles.countPill} testID="live-count-pill">
            <Text style={styles.countPillText}>
              {uncertain || count === null ? 'Looking…' : `~${count} item${count === 1 ? '' : 's'}`}
            </Text>
            {shotCount > 0 && <Text style={styles.countPillSub}>{shotCount} shot</Text>}
          </View>
        ) : (
          shotCount > 0 && (
            <View style={styles.shotCount}>
              <Text style={styles.shotCountText}>
                {shotCount} shot{shotCount === 1 ? '' : 's'}
              </Text>
            </View>
          )
        )}

        <Pressable
          testID="capture-torch"
          accessibilityLabel={torch ? 'Turn torch off' : 'Turn torch on'}
          onPress={() => setTorch((t) => !t)}
          style={({ pressed }) => [styles.roundBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name={torch ? 'zap-off' : 'zap'} size={19} color="#ffffff" />
        </Pressable>
      </View>

      {introVisible && (
        <Pressable
          testID="capture-intro"
          style={styles.introWrap}
          onPress={dismissIntro}
          accessibilityLabel="Dismiss introduction"
        >
          <View style={styles.introCard}>
            <Text style={styles.introLine}>
              Shoot each shelf or corner — I'll catalogue every item.
            </Text>
            <Text style={styles.introLineSecondary}>
              Your shots collect in the tray; review them whenever you like.
            </Text>
          </View>
        </Pressable>
      )}

      <View style={[styles.coachSlot, { bottom: insets.bottom + 132 }]} pointerEvents="none">
        <CoachOverlay hint={hint} />
        {cameraReady && (
          <View style={styles.readinessSlot}>
            <ReadinessStrip signals={signals} ready={ready} />
          </View>
        )}
      </View>

      {/* The reel: a floating film strip where every shot visibly lands and
          narrates its own journey. */}
      <View
        style={[styles.reelWrap, { left: REEL_LEFT, bottom: reelBottom }]}
        pointerEvents="box-none"
      >
        <CaptureReel
          shots={reel}
          now={nowTick}
          readyCount={readyCount}
          onPress={() => router.push('/inbox')}
        />
      </View>

      {flyingShot && (
        <FlyToTray
          key={flyingShot.key}
          uri={flyingShot.uri}
          targetX={REEL_LEFT}
          targetY={flyTargetY}
          onDone={() => setFlyingShot(null)}
        />
      )}

      <View style={[styles.shutterBar, { paddingBottom: shutterBottom }]}>
        <Pressable
          testID="capture-shutter"
          accessibilityLabel="Take photo"
          disabled={isCapturing}
          onPress={() => void handleShutter()}
          style={({ pressed }) => [
            styles.shutterOuter,
            {
              // Softened, never disabled, while the frame is unsettled — the
              // user always keeps the final say on when to shoot.
              opacity: isCapturing ? 0.5 : hint ? 0.72 : 1,
              // The ring turns green with the strip's verdict: one glance says shoot.
              borderColor: ready ? '#4ade80' : 'rgba(255,255,255,0.9)',
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
        >
          <View style={styles.shutterInner} />
        </Pressable>
      </View>

      {/* Leaving is always one obvious tap — shots keep processing after
          the camera closes (the home pill and inbox pick up the story). */}
      <Pressable
        testID="capture-done"
        accessibilityLabel="Done shooting"
        onPress={handleClose}
        style={({ pressed }) => [
          styles.donePill,
          { bottom: shutterBottom + 16, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <Text style={styles.donePillText}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  permissionTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 20,
  },
  permissionBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryBtn: {
    marginTop: 14,
    paddingHorizontal: 22,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  textBtn: { marginTop: 6, padding: 10 },
  textBtnLabel: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  roundBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,18,40,0.45)',
  },
  shotCount: {
    paddingHorizontal: 12,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    backgroundColor: 'rgba(20,18,40,0.45)',
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(20,18,40,0.55)',
  },
  countPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  countPillSub: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
  },
  shotCountText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#ffffff',
  },
  introWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '30%',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  introCard: {
    borderRadius: 18,
    backgroundColor: 'rgba(20,18,40,0.72)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
    maxWidth: 340,
  },
  introLine: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
    color: '#ffffff',
    textAlign: 'center',
  },
  introLineSecondary: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  coachSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  reelWrap: {
    position: 'absolute',
  },
  donePill: {
    position: 'absolute',
    right: 20,
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,18,40,0.55)',
  },
  donePillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    letterSpacing: 0.3,
    color: '#ffffff',
  },
  readinessSlot: { marginTop: 8 },
  shutterBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingTop: 16,
  },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ffffff',
  },
});
