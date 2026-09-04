import { analyzeQuality } from '@/lib/image-quality';
import {
  type CoachHint,
  type CoachHintKind,
  currentHint,
  initialCoachState,
  isFrameReady,
  magnitudeOf,
  motionVerdict,
  pushObservation,
  pushServerAdvice,
  tiltFromGravity,
} from '@/lib/live-coaching';
import { prepareJpegBase64 } from '@/services/image-prep';
import { base64ToBytes, decodeToGrayscale } from '@/services/image-quality';
import { useFocusEffect } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Live capture coaching loop.
 *
 * expo-camera exposes no frame-processor or preview callback, so the only way
 * to sample the scene is a low-quality `takePictureAsync` on a self-scheduling
 * loop. Every rule here exists to keep that affordable:
 *  - scheduled from COMPLETION, never setInterval, so slow frames can never
 *    pile up behind each other;
 *  - one analysis in flight at a time, and never during a user capture;
 *  - each sampled temp file is deleted immediately — an unbounded stream of
 *    JPEGs in the cache directory would be a real leak;
 *  - hard stop when the screen blurs or the app backgrounds;
 *  - the cadence relaxes once the reading is stable, because a steady scene
 *    does not need re-checking twice a second.
 */

/** Settle time between analyses (~1.3Hz with decode included). */
export const SAMPLE_INTERVAL_MS = 600;
/** Relaxed cadence once the last few verdicts agree. */
export const IDLE_INTERVAL_MS = 2_000;
/** Verdicts that must agree before the loop relaxes. */
const STABLE_RUN = 3;
/** Quiet period after a real shutter press. */
export const POST_CAPTURE_PAUSE_MS = 2_000;
/** Width the sample is analysed at — matches the post-capture gate exactly. */
const ANALYSIS_WIDTH = 128;
/** Accelerometer cadence; motion needs to feel immediate, and it is cheap. */
const MOTION_INTERVAL_MS = 200;

export interface CameraSampler {
  takePictureAsync(options: {
    quality: number;
    skipProcessing: boolean;
    shutterSound: boolean;
    animateShutter: boolean;
    imageType?: 'jpg';
  }): Promise<{ uri: string } | undefined>;
}

interface UseLiveQualityOptions {
  /** Ref to the CameraView; null until it mounts. */
  camera: { current: CameraSampler | null };
  /** False while the camera is not ready or a capture is in progress. */
  enabled: boolean;
  /** Test seam. */
  intervalMs?: number;
}

export interface LiveQuality {
  hint: CoachHint | null;
  ready: boolean;
  /** Call immediately before a user capture, and again after it resolves. */
  suspendForCapture: () => void;
  resumeAfterCapture: () => void;
  /**
   * Feeds transient server guidance (density advice etc.) into the coach's
   * borrowed hint slot — arbitration lives in lib/live-coaching.
   */
  injectServerAdvice: (message: string) => void;
}

/** Deletes a sampled frame; failures are irrelevant to the user. */
async function discardSample(uri: string): Promise<void> {
  try {
    // biome-ignore lint/correctness/noNodejsModules: RN-only module, required lazily so tests need no native bindings
    // biome-ignore lint/suspicious/noExplicitAny: CJS interop for expo-file-system/legacy
    const FileSystem = (require as any)('expo-file-system/legacy') as {
      deleteAsync(uri: string, opts?: { idempotent?: boolean }): Promise<void>;
    };
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Best effort — the OS clears the cache directory anyway.
  }
}

export function useLiveQuality({
  camera,
  enabled,
  intervalMs = SAMPLE_INTERVAL_MS,
}: UseLiveQualityOptions): LiveQuality {
  const [hint, setHint] = useState<CoachHint | null>(null);
  const [ready, setReady] = useState(false);

  const stateRef = useRef(initialCoachState());
  const busyRef = useRef(false);
  const stoppedRef = useRef(false);
  const capturingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionRef = useRef<CoachHintKind | null>(null);
  const focusedRef = useRef(true);

  const injectServerAdvice = useCallback((message: string) => {
    stateRef.current = pushServerAdvice(stateRef.current, message);
    setHint(currentHint(stateRef.current));
    setReady(isFrameReady(stateRef.current) && stateRef.current.serverAdvice === null);
  }, []);

  const suspendForCapture = useCallback(() => {
    capturingRef.current = true;
  }, []);
  const resumeAfterCapture = useCallback(() => {
    // Give the shutter and any animation time to clear before resuming.
    setTimeout(() => {
      capturingRef.current = false;
    }, POST_CAPTURE_PAUSE_MS);
  }, []);

  // --- motion: cheap, high-frequency, and the most preventable fault --------
  useEffect(() => {
    if (!enabled) return;
    let subscription: { remove: () => void } | null = null;
    try {
      Accelerometer.setUpdateInterval(MOTION_INTERVAL_MS);
      subscription = Accelerometer.addListener(({ x, y, z }) => {
        motionRef.current = motionVerdict({
          magnitude: magnitudeOf(x, y, z),
          tiltDegrees: tiltFromGravity(x, y),
        });
      });
    } catch {
      // No accelerometer (simulator): image coaching still works.
      motionRef.current = null;
    }
    return () => {
      subscription?.remove();
      motionRef.current = null;
    };
  }, [enabled]);

  // --- the sampling loop ----------------------------------------------------
  useEffect(() => {
    stoppedRef.current = !enabled;
    if (!enabled) return;

    const observe = (observation: CoachHintKind) => {
      stateRef.current = pushObservation(stateRef.current, observation);
      setHint(currentHint(stateRef.current));
      setReady(isFrameReady(stateRef.current));
    };

    const nextDelay = (): number => {
      const window = stateRef.current.window;
      if (window.length < STABLE_RUN) return intervalMs;
      const recent = window.slice(-STABLE_RUN);
      const stable = recent.every((v) => v === recent[0]);
      return stable ? Math.max(intervalMs, IDLE_INTERVAL_MS) : intervalMs;
    };

    const schedule = () => {
      if (stoppedRef.current) return;
      timerRef.current = setTimeout(() => {
        void tick();
      }, nextDelay());
    };

    const tick = async (): Promise<void> => {
      if (stoppedRef.current || busyRef.current) return;
      // Never contend with a user-initiated capture, and never sample a
      // backgrounded or blurred screen.
      if (capturingRef.current || !focusedRef.current || AppState.currentState !== 'active') {
        schedule();
        return;
      }
      const view = camera.current;
      if (!view) {
        schedule();
        return;
      }

      busyRef.current = true;
      let sampleUri: string | null = null;
      try {
        const shot = await view.takePictureAsync({
          quality: 0.3,
          skipProcessing: true,
          shutterSound: false,
          animateShutter: false,
          imageType: 'jpg',
        });
        if (!shot?.uri) {
          observe('ok');
          return;
        }
        sampleUri = shot.uri;
        const prepared = await prepareJpegBase64(shot.uri, ANALYSIS_WIDTH);
        const sample = prepared?.base64 ? decodeToGrayscale(base64ToBytes(prepared.base64)) : null;
        if (!sample) {
          observe('ok');
          return;
        }
        const report = analyzeQuality(sample);
        if (__DEV__) {
          // TEMPORARY, dev-only (compiled out of production builds).
          // Exists to gather real viewfinder focus/luma values on a device so
          // the live thresholds can be confirmed against actual captures —
          // the probe that justified reusing the still thresholds was a model
          // of this pipeline, not a real camera. Remove once we have numbers.
          console.log(
            `[live-quality] focus=${report.focusScore.toFixed(0)} luma=${report.meanLuma.toFixed(
              0,
            )} contrast=${report.contrast.toFixed(0)} -> ${report.verdict}`,
          );
        }
        // Motion outranks image faults; see PRIORITY in lib/live-coaching.
        observe(motionRef.current ?? report.verdict);
      } catch {
        // A dropped sample is not a signal about the scene — stay quiet.
      } finally {
        if (sampleUri) void discardSample(sampleUri);
        busyRef.current = false;
        schedule();
      }
    };

    void tick();

    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [camera, enabled, intervalMs]);

  // --- lifecycle: stop dead when the screen is not in front of the user -----
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      return () => {
        focusedRef.current = false;
      };
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        // Reset the window so returning to the app never shows a stale hint.
        stateRef.current = initialCoachState();
        setHint(null);
        setReady(false);
      }
    });
    return () => sub.remove();
  }, []);

  return { hint, ready, suspendForCapture, resumeAfterCapture, injectServerAdvice };
}
