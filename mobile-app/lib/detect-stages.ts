/**
 * Honest staged progress for the detection wait, built ONLY from what the
 * client already knows: elapsed time, streamed item count, and the scene's
 * estimated total (all from the existing /v1/detect/status payload). No
 * fake percentages — copy that levels with the user beats a lying bar.
 */

const STAGE_READING_MS = 8_000;
const STAGE_CATALOGUING_MS = 45_000;
const STAGE_REFINING_MS = 100_000;

export interface StageProgressInput {
  elapsedMs: number;
  itemCount: number;
  /** scene.estimatedTotalItems when the server has assessed the photo. */
  expectedTotal: number | null;
}

/** Headline for the wait, keyed to elapsed time and streamed progress. */
export function stageTitle({ elapsedMs, itemCount, expectedTotal }: StageProgressInput): string {
  if (itemCount > 0) {
    return expectedTotal && expectedTotal > itemCount
      ? `Found ${itemCount} of ~${expectedTotal}…`
      : `${itemCount} found…`;
  }
  if (elapsedMs < STAGE_READING_MS) return 'Reading the scene…';
  if (elapsedMs < STAGE_CATALOGUING_MS) return 'Cataloguing items…';
  if (elapsedMs < STAGE_REFINING_MS) return 'Almost there — refining names…';
  return 'Still working — dense scenes take a little longer…';
}

/** Quiet sub-line: elapsed time as reassurance that nothing is stuck. */
export function stageSubline(elapsedMs: number): string {
  const s = Math.max(0, Math.floor(elapsedMs / 1000));
  if (s < 60) return `${s}s — we're on it`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s — still with you`;
}

/** Compact clock for inline pill copy: 65s → "1:05". */
export function formatElapsedClock(elapsedMs: number): string {
  const s = Math.max(0, Math.floor(elapsedMs / 1_000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
