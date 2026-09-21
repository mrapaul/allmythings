import { streamScoutEvents } from '@/api/scout';
import {
  type ScoutState,
  applyScoutEvent,
  beginScout,
  cancelScout,
  initialScoutState,
  scoutProgress,
} from '@/lib/scout';
import { prepareJpeg } from '@/services/image-prep';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraSampler } from './useLiveQuality';

/**
 * Live scout: a fast single-pass detect against a small framing sample,
 * drawn over the viewfinder as boxes arrive. Strictly advisory — the shutter
 * never waits on it and every failure is silent (logged, overlay hidden).
 *
 * Loop discipline mirrors useLiveQuality/useLiveCount: one run at a time,
 * scheduled from completion; a concurrent trigger cancels the previous run
 * (a `runRef` token invalidates its late events); the sampled temp frame is
 * deleted in a finally.
 */

/** Framing sample width — matches the precheck's scale, plenty for scouting. */
const SCOUT_FRAME_WIDTH = 640;

interface UseScoutOptions {
  /** Ref to the CameraView; null until it mounts. */
  camera: { current: CameraSampler | null };
  /** False while the camera is not ready or a capture is in progress. */
  enabled: boolean;
  /** Readiness strip fully ok: auto-arm one scout per ready transition. */
  autoArm: boolean;
  /** Latest instantaneous motion verdict — strong motion invalidates boxes. */
  motion: 'unsteady' | 'tilted' | null;
}

export interface UseScoutResult {
  state: ScoutState;
  /** 0..1 while scanning when the scene estimate allows, else null. */
  progress: number | null;
  /** True between the first event of a run and its done/error/hide. */
  scanning: boolean;
  /** Starts a scout run (cancels any in-flight one). No-op while disabled. */
  begin: () => void;
  /** Hides the overlay and invalidates any in-flight run. */
  cancel: () => void;
}

/** Deletes the sampled frame; failures are irrelevant to the user. */
async function discardScoutFrame(uri: string): Promise<void> {
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

export function useScout({ camera, enabled, autoArm, motion }: UseScoutOptions): UseScoutResult {
  const [state, setState] = useState<ScoutState>(initialScoutState);
  /** Bumped per run/cancel; a stale run bails the moment its token mismatches. */
  const runRef = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const cancel = useCallback(() => {
    runRef.current += 1;
    setState((s) => cancelScout(s));
  }, []);

  const begin = useCallback(() => {
    if (!enabledRef.current) return;
    // Invalidate any in-flight run FIRST: the previous stream's late events
    // must not merge into the fresh overlay.
    runRef.current += 1;
    const run = runRef.current;
    setState((s) => beginScout(s));

    void (async () => {
      let sampleUri: string | null = null;
      try {
        const view = camera.current;
        if (!view) {
          setState((s) => cancelScout(s));
          return;
        }
        const shot = await view.takePictureAsync({
          quality: 0.3,
          skipProcessing: true,
          shutterSound: false,
          animateShutter: false,
          imageType: 'jpg',
        });
        if (run !== runRef.current) return;
        if (!shot?.uri) {
          setState((s) => cancelScout(s));
          return;
        }
        sampleUri = shot.uri;
        const prepared = await prepareJpeg(sampleUri, SCOUT_FRAME_WIDTH);
        if (run !== runRef.current) return;

        await streamScoutEvents(
          { fileUri: prepared.uri, fileName: 'scout.jpg', mimeType: 'image/jpeg' },
          {
            onEvent: (event) => {
              if (run !== runRef.current) return;
              setState((s) => applyScoutEvent(s, event));
            },
          },
        );
        // The transport ended without a terminal event (server closed the
        // socket early): predictions from a dead stream are worse than none.
        if (run === runRef.current) {
          setState((s) => (s.status === 'scanning' ? cancelScout(s) : s));
        }
      } catch (err) {
        // Silent by contract — log for diagnosis, hide the overlay.
        console.warn('[scout] failed:', err instanceof Error ? err.message : err);
        if (run === runRef.current) setState((s) => cancelScout(s));
      } finally {
        if (sampleUri) void discardScoutFrame(sampleUri);
      }
    })();
  }, [camera]);

  // Auto-arm: one scout per ready transition. Latched so a long steady hold
  // doesn't re-scan continuously; reframing (ready dips) re-arms it.
  const autoArmedRef = useRef(false);
  useEffect(() => {
    if (!autoArm) {
      autoArmedRef.current = false;
      return;
    }
    if (autoArmedRef.current || !enabled) return;
    autoArmedRef.current = true;
    begin();
  }, [autoArm, enabled, begin]);

  // Strong motion invalidates the framing the predictions were drawn on.
  useEffect(() => {
    if (motion === 'unsteady') cancel();
  }, [motion, cancel]);

  // A capture starting (enabled flipping false, e.g. the shutter) cancels.
  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled, cancel]);

  // Unmount: invalidate the in-flight run; its callbacks no-op on the token.
  useEffect(
    () => () => {
      runRef.current += 1;
    },
    [],
  );

  return {
    state,
    progress: scoutProgress(state),
    scanning: state.status === 'scanning',
    begin,
    cancel,
  };
}
