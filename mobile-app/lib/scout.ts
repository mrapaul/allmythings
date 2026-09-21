import type { DetectStreamEvent, SceneInfo } from '@/api/types';
import type { BoundingBox } from '@/components/BoundingBoxOverlay';

/**
 * Scout overlay model: what the viewfinder draws while a fast single-pass
 * detect runs against a live framing sample. The wire events (SSE) fold into
 * this model through a plain reducer so the progressive-merge and cancel
 * semantics are unit-testable without a server, camera, or event source.
 */

export interface ScoutItem {
  /** Stable within one scout run: derived from the runId + arrival index. */
  id: string;
  label: string;
  box: BoundingBox;
}

export type ScoutStatus = 'idle' | 'scanning' | 'done';

export interface ScoutState {
  status: ScoutStatus;
  runId: string | null;
  scene: SceneInfo | null;
  /** Predictions so far, in arrival order (item bursts append progressively). */
  items: ScoutItem[];
  /** True when the stream ended in a server error event — the overlay hides. */
  failed: boolean;
}

export function initialScoutState(): ScoutState {
  return { status: 'idle', runId: null, scene: null, items: [], failed: false };
}

/** Starts (or restarts — a restart invalidates the previous run's boxes) a scout. */
export function beginScout(state: ScoutState): ScoutState {
  // Keep the previous scene estimate: a restart on a similar frame gives a
  // usable progress denominator before the fresh scene event lands.
  return { status: 'scanning', runId: state.runId, scene: state.scene, items: [], failed: false };
}

/** Hides the overlay and drops predictions (shutter, motion, unmount). */
export function cancelScout(state: ScoutState): ScoutState {
  return state.status === 'idle' ? state : initialScoutState();
}

export function applyScoutEvent(state: ScoutState, event: DetectStreamEvent): ScoutState {
  // Anything arriving outside a scan is stale (e.g. an in-flight stream that
  // lost the race to a cancel) and must not resurrect the overlay.
  if (state.status !== 'scanning') return state;

  switch (event.type) {
    case 'meta':
      return { ...state, runId: event.runId };
    case 'scene':
      return { ...state, scene: event.scene };
    case 'item': {
      const id = `${state.runId ?? 'scout'}-${state.items.length}`;
      // Progressive merge: append-only, deduped by id, so a retried burst can
      // never draw the same prediction twice.
      if (state.items.some((it) => it.id === id)) return state;
      return {
        ...state,
        items: [...state.items, { id, label: event.item.label, box: event.item.box }],
      };
    }
    case 'done':
      return { ...state, status: 'done' };
    case 'error':
      return { ...state, status: 'done', failed: true };
    case 'merge-suggestions':
      return state;
    default:
      return state;
  }
}

/**
 * Thin progress fraction for the scouting bar: items arrived over the
 * pass-1 scene estimate. Null when there is no estimate (indeterminate).
 */
export function scoutProgress(state: ScoutState): number | null {
  if (state.status !== 'scanning') return null;
  const total = state.scene?.estimatedTotalItems;
  if (!total || total <= 0) return null;
  return Math.min(1, state.items.length / total);
}
