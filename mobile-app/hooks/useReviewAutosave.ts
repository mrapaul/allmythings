import type { DetectionRow } from '@/stores/detection-screen.store';
import { getDetectionStore } from '@/stores/detection-screen.store';
import type { Prefs, ReviewState } from '@/stores/prefs';
import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react';

type PrefsLike = Pick<Prefs, 'getReviewState' | 'setReviewState'>;

/**
 * Review autosave: leaving mid-review and returning restores exactly.
 *
 * The snapshot is captured ONCE per resumed run (before the persist effect
 * starts overwriting the slot) and applied to each row exactly once as it
 * streams back in — so later user changes are never fought. The working
 * state is then persisted on every meaningful change into a single slot,
 * overwritten by the next run.
 */
export function useReviewAutosave(
  runId: string | null | undefined,
  rows: DetectionRow[],
  tagsByRow: Record<string, string[]>,
  setTagsByRow: Dispatch<SetStateAction<Record<string, string[]>>>,
  prefs: PrefsLike,
): void {
  const restoredRunRef = useRef<string | null>(null);
  const restoredRowIdsRef = useRef<Set<string>>(new Set());
  const snapshotRef = useRef<ReviewState | null>(null);

  useEffect(() => {
    if (!runId || rows.length === 0) return;
    if (restoredRunRef.current !== runId) {
      restoredRunRef.current = runId;
      restoredRowIdsRef.current = new Set();
      const stored = prefs.getReviewState();
      snapshotRef.current = stored && stored.runId === runId ? stored : null;
      if (snapshotRef.current) {
        const savedTags = snapshotRef.current.tagsByRow;
        setTagsByRow((prev) => ({ ...prev, ...savedTags }));
      }
    }
    const snapshot = snapshotRef.current;
    if (!snapshot) return;
    const st = getDetectionStore().getState();
    for (const r of st.rows) {
      if (restoredRowIdsRef.current.has(r.id)) continue;
      restoredRowIdsRef.current.add(r.id);
      if (snapshot.excludedRowIds.includes(r.id) && r.included) st.toggleInclude(r.id);
      if (snapshot.savedRowIds.includes(r.id) && !r.saved) st.patchRow(r.id, { saved: true });
    }
  }, [runId, rows.length, prefs, setTagsByRow]);

  useEffect(() => {
    if (!runId || rows.length === 0) return;
    prefs.setReviewState({
      runId,
      tagsByRow,
      excludedRowIds: rows.filter((r) => !r.included).map((r) => r.id),
      savedRowIds: rows.filter((r) => r.saved).map((r) => r.id),
    });
  }, [runId, rows, tagsByRow, prefs]);
}
