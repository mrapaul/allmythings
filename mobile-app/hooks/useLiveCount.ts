import { precheckFrame } from '@/api/precheck';
import {
  type CountState,
  initialCountState,
  parseVisibleCount,
  pushCountSample,
  serverGuidance,
} from '@/lib/live-coaching';
import { prepareJpeg } from '@/services/image-prep';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { CameraSampler } from './useLiveQuality';

/**
 * Live object-count sampling for the viewfinder pill.
 *
 * The server precheck is slow (~seconds), so this runs at a gentle cadence
 * and ONLY while the frame is worth asking about: quality-ok and steady
 * (`active`), screen focused, app foregrounded, no capture in flight. Same
 * loop discipline as useLiveQuality: scheduled from completion, one request
 * in flight, temp frames deleted, silently off when the server doesn't send
 * `visibleObjectCount`.
 *
 * Known contention: this takes its own low-quality frame, which can queue
 * behind the quality loop's sample inside expo-camera. At 0.18Hz against a
 * ~1.4Hz loop the occasional stall is accepted (documented trade-off).
 */

export const COUNT_INTERVAL_MS = 5_500;
const PRECHECK_WIDTH = 512;

interface UseLiveCountOptions {
  camera: { current: CameraSampler | null };
  /** True only when the frame is good AND stable AND no capture is running. */
  active: boolean;
  /** Called with density/scene guidance for the coach's borrowed slot. */
  onGuidance: (message: string) => void;
  /** Test seam. */
  intervalMs?: number;
}

export interface LiveCount {
  /** Stable count for the pill, or null before one exists. */
  count: number | null;
  /** True while readings disagree — render "Looking…". */
  uncertain: boolean;
  /** True once any numeric count has arrived (feature detected on server). */
  available: boolean;
}

async function discard(uri: string): Promise<void> {
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

export function useLiveCount({
  camera,
  active,
  onGuidance,
  intervalMs = COUNT_INTERVAL_MS,
}: UseLiveCountOptions): LiveCount {
  const [state, setState] = useState<CountState>(initialCountState());
  const [available, setAvailable] = useState(false);

  const busyRef = useRef(false);
  const stoppedRef = useRef(false);
  const focusedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest gate value, readable from inside the loop without re-subscribing.
  const activeRef = useRef(active);
  activeRef.current = active;
  const guidanceRef = useRef(onGuidance);
  guidanceRef.current = onGuidance;

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      return () => {
        focusedRef.current = false;
      };
    }, []),
  );

  useEffect(() => {
    stoppedRef.current = false;

    const schedule = () => {
      if (stoppedRef.current) return;
      timerRef.current = setTimeout(() => {
        void tick();
      }, intervalMs);
    };

    const tick = async (): Promise<void> => {
      if (stoppedRef.current || busyRef.current) return;
      if (!activeRef.current || !focusedRef.current || AppState.currentState !== 'active') {
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
        if (!shot?.uri) return;
        sampleUri = shot.uri;
        const preview = await prepareJpeg(shot.uri, PRECHECK_WIDTH);
        const result = await precheckFrame({ fileUri: preview.uri });

        const count = parseVisibleCount(result);
        if (count !== null) {
          setAvailable(true);
          setState((prev) => pushCountSample(prev, count));
        }
        const guidance = serverGuidance(result);
        if (guidance) guidanceRef.current(guidance);
      } catch {
        // Offline / endpoint absent: the pill simply doesn't update.
      } finally {
        if (sampleUri) void discard(sampleUri);
        busyRef.current = false;
        schedule();
      }
    };

    void tick();

    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [camera, intervalMs]);

  return { count: state.display, uncertain: state.uncertain, available };
}
