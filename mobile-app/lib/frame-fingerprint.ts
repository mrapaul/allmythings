import type { GrayscaleSample } from './image-quality';

/**
 * Overlap memory: "you already shot this area".
 *
 * A 64-bit difference hash of the viewfinder sample (9×8 area-averaged cells,
 * each bit = left cell brighter than its right neighbour) is cheap to compute
 * on the 128px grayscale frame the quality loop already decodes, and stable
 * under exposure drift and small hand motion. Two frames of the same shelf
 * land within a few bits; a different shelf or a re-framed wide shot lands
 * far away.
 */

export const HASH_COLS = 9;
export const HASH_ROWS = 8;
/** Hamming distance at or below which two frames count as the same area. */
export const SAME_AREA_MAX_DISTANCE = 10;
/** Distance the live frame must exceed before a return can count as overlap. */
export const AWAY_MIN_DISTANCE = 18;
/** How many recent shots are remembered. */
export const REMEMBERED_SHOTS = 8;

export type FrameHash = Uint8Array; // 8 bytes, 64 bits

export function dHash(sample: GrayscaleSample): FrameHash {
  const cells = new Float64Array(HASH_COLS * HASH_ROWS);
  const counts = new Uint32Array(HASH_COLS * HASH_ROWS);
  for (let y = 0; y < sample.height; y++) {
    const cy = Math.min(HASH_ROWS - 1, Math.floor((y * HASH_ROWS) / sample.height));
    for (let x = 0; x < sample.width; x++) {
      const cx = Math.min(HASH_COLS - 1, Math.floor((x * HASH_COLS) / sample.width));
      const i = cy * HASH_COLS + cx;
      cells[i] = (cells[i] ?? 0) + (sample.luma[y * sample.width + x] ?? 0);
      counts[i] = (counts[i] ?? 0) + 1;
    }
  }
  const out = new Uint8Array(8);
  let bit = 0;
  for (let r = 0; r < HASH_ROWS; r++) {
    for (let c = 0; c < HASH_COLS - 1; c++) {
      const li = r * HASH_COLS + c;
      const left = (cells[li] ?? 0) / Math.max(1, counts[li] ?? 0);
      const right = (cells[li + 1] ?? 0) / Math.max(1, counts[li + 1] ?? 0);
      if (left > right) out[bit >> 3] = (out[bit >> 3] ?? 0) | (1 << (bit & 7));
      bit += 1;
    }
  }
  return out;
}

export function hammingDistance(a: FrameHash, b: FrameHash): number {
  let d = 0;
  for (let i = 0; i < 8; i++) {
    let v = (a[i] ?? 0) ^ (b[i] ?? 0);
    while (v) {
      d += v & 1;
      v >>= 1;
    }
  }
  return d;
}

export interface OverlapState {
  /** Newest-last hashes of recent shots. */
  shots: FrameHash[];
  /**
   * Whether the viewfinder has left the most recent shot's area since it was
   * taken. Right after the shutter the user is still pointing at the same
   * spot — that is not a repeat, so overlap only counts on a RETURN.
   */
  awayFromLast: boolean;
}

export function initialOverlapState(): OverlapState {
  return { shots: [], awayFromLast: false };
}

/** A shot was taken: remember it; the viewfinder is, by definition, on it. */
export function rememberShot(state: OverlapState, hash: FrameHash): OverlapState {
  return { shots: [...state.shots, hash].slice(-REMEMBERED_SHOTS), awayFromLast: false };
}

/**
 * Folds one live frame in. Returns the new state and whether the frame
 * re-covers an earlier shot's area after having moved away from the last one.
 */
export function pushLiveFrame(
  state: OverlapState,
  hash: FrameHash,
): { state: OverlapState; overlap: boolean } {
  if (state.shots.length === 0) return { state, overlap: false };
  const last = state.shots[state.shots.length - 1] as FrameHash;
  const distToLast = hammingDistance(hash, last);
  const awayFromLast = state.awayFromLast || distToLast >= AWAY_MIN_DISTANCE;
  const next = awayFromLast === state.awayFromLast ? state : { ...state, awayFromLast };
  if (!awayFromLast) return { state: next, overlap: false };
  const overlap = state.shots.some((s) => hammingDistance(hash, s) <= SAME_AREA_MAX_DISTANCE);
  return { state: next, overlap };
}
