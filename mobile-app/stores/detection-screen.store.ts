import type { DetectStreamEvent, DetectedItem, SceneInfo } from '@/api/types';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

export interface DetectionRow {
  id: string;
  item: DetectedItem;
  included: boolean;
  saving: boolean;
  saved: boolean;
  /** True when the user drew this box (draw-to-teach) rather than the model. */
  manual?: boolean;
}

type Phase = 'loading' | 'streaming' | 'review';

interface DetectionState {
  phase: Phase;
  runId: string | null;
  traceId: string | null;
  photoSha256: string | null;
  scene: SceneInfo | null;
  rows: DetectionRow[];
  errorCode: string | null;
  errorMessage: string | null;
  handleEvent: (e: DetectStreamEvent) => void;
  addManualRow: (item: DetectedItem) => string;
  toggleInclude: (id: string) => void;
  patchRow: (id: string, patch: Partial<Omit<DetectionRow, 'id'>>) => void;
  beginSave: (ids: string[]) => void;
  endSave: (ids: string[]) => void;
  /** A save that threw: rows go back to pending so the user can retry. */
  failSave: (ids: string[]) => void;
  reset: () => void;
}

let manualCounter = 0;

export function createDetectionStore() {
  return createStore<DetectionState>((set) => ({
    phase: 'loading',
    runId: null,
    traceId: null,
    photoSha256: null,
    scene: null,
    rows: [],
    errorCode: null,
    errorMessage: null,
    handleEvent: (e) =>
      set((s) => {
        if (e.type === 'meta')
          return { runId: e.runId, traceId: e.traceId, photoSha256: e.photoSha256 ?? null };
        if (e.type === 'scene') return { scene: e.scene };
        if (e.type === 'item') {
          const id = `${s.rows.length}-${e.item.label}`;
          return {
            phase: 'streaming',
            rows: [...s.rows, { id, item: e.item, included: true, saving: false, saved: false }],
          };
        }
        if (e.type === 'done') return { phase: 'review' };
        if (e.type === 'error') {
          return {
            phase: 'review',
            errorCode: e.code,
            errorMessage: e.message ?? null,
          };
        }
        return s;
      }),
    addManualRow: (item) => {
      const id = `manual-${manualCounter++}`;
      set((s) => ({
        phase: s.phase === 'loading' ? 'review' : s.phase,
        rows: [{ id, item, included: true, saving: false, saved: false, manual: true }, ...s.rows],
      }));
      return id;
    },
    toggleInclude: (id) =>
      set((s) => ({
        rows: s.rows.map((r) => (r.id === id ? { ...r, included: !r.included } : r)),
      })),
    patchRow: (id, patch) =>
      set((s) => ({ rows: s.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
    beginSave: (ids) =>
      set((s) => ({
        rows: s.rows.map((r) => (ids.includes(r.id) ? { ...r, saving: true } : r)),
      })),
    endSave: (ids) =>
      set((s) => ({
        rows: s.rows.map((r) => (ids.includes(r.id) ? { ...r, saving: false, saved: true } : r)),
      })),
    failSave: (ids) =>
      set((s) => ({
        rows: s.rows.map((r) => (ids.includes(r.id) ? { ...r, saving: false } : r)),
      })),
    reset: () =>
      set({
        phase: 'loading',
        runId: null,
        traceId: null,
        photoSha256: null,
        scene: null,
        rows: [],
        errorCode: null,
        errorMessage: null,
      }),
  }));
}

const detectionStore = createDetectionStore();

export function useDetectionStore<T>(selector: (s: DetectionState) => T): T {
  return useStore(detectionStore, selector);
}

export function getDetectionStore() {
  return detectionStore;
}

export type { DetectionState, Phase };
