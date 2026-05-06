import type { DetectStreamEvent, DetectedItem } from '@/api/types';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

export interface DetectionRow {
  id: string;
  item: DetectedItem;
  included: boolean;
  saving: boolean;
  saved: boolean;
}

type Phase = 'loading' | 'streaming' | 'review';

interface DetectionState {
  phase: Phase;
  runId: string | null;
  traceId: string | null;
  rows: DetectionRow[];
  errorCode: string | null;
  errorMessage: string | null;
  handleEvent: (e: DetectStreamEvent) => void;
  toggleInclude: (id: string) => void;
  patchRow: (id: string, patch: Partial<Omit<DetectionRow, 'id'>>) => void;
  beginSave: (ids: string[]) => void;
  endSave: (ids: string[]) => void;
  reset: () => void;
}

export function createDetectionStore() {
  return createStore<DetectionState>((set) => ({
    phase: 'loading',
    runId: null,
    traceId: null,
    rows: [],
    errorCode: null,
    errorMessage: null,
    handleEvent: (e) =>
      set((s) => {
        if (e.type === 'meta') return { runId: e.runId, traceId: e.traceId };
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
    reset: () =>
      set({
        phase: 'loading',
        runId: null,
        traceId: null,
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
