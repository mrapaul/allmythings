/**
 * On-device capture quality analysis — pure math, zero latency, no network.
 *
 * The server precheck (~15s round-trip) is the right place for SEMANTIC
 * judgement (is this a room? are there people? how dense?). Photometric
 * quality needs no model at all: luminance and high-frequency detail are
 * measurable from the pixels, so this runs on the shutter instead of after a
 * round-trip.
 *
 * Input is a small grayscale sample grid (see services/image-quality.ts for
 * the decode path), which keeps this module free of native modules and fully
 * unit-testable.
 */

export type QualityVerdict = 'ok' | 'too_dark' | 'too_bright' | 'too_blurry' | 'low_detail';

export interface GrayscaleSample {
  width: number;
  height: number;
  /** Row-major luma values, 0–255. */
  luma: ArrayLike<number>;
}

export interface QualityReport {
  verdict: QualityVerdict;
  /** Mean luma, 0–255. */
  meanLuma: number;
  /** Variance of the Laplacian — the standard sharpness proxy. */
  focusScore: number;
  /** Std-dev of luma; separates a blank wall from a busy but soft frame. */
  contrast: number;
  /** Warm, actionable copy. Null when the frame is fine. */
  advice: string | null;
}

// --- Calibration -----------------------------------------------------------
// These thresholds are deliberately PERMISSIVE: a false "too blurry" blocks a
// good capture, which is far worse for the walk-and-shoot loop than letting a
// mediocre frame through to the model (which has its own verdict). They flag
// only clearly-unusable frames.
//
// Scale notes: luma is 0–255. `focusScore` is the variance of a 4-neighbour
// Laplacian on the same scale, sampled at ~128px wide.
//
// MEASURED against real photos (16 eval fixtures + interior stress-test set,
// decoded through this exact path, 2026-07-30):
//   real interior photos     focusScore  748 – 30929  (softest: dining_room_01)
//   moderate blur (sim)      focusScore  396
//   heavy blur (sim)         focusScore  100
//   real photo mean luma      71 – 200   (dimmest: children_bedroom_toys 71)
// The simulations downscale a real fixture to 30px/60px and back up, which is
// a fair stand-in for motion blur. BLUR_FOCUS_SCORE sits between the moderate
// blur (396) and the softest genuine photo (748): it catches both simulated
// blurs while leaving ~1.5x headroom under real content. An earlier value of
// 22 came from synthetic grids whose Laplacian scale is nothing like a decoded
// JPEG's — it could never fire on a real capture.
//
// Bias note: a false "too blurry" is recoverable (the hint offers "Use
// anyway"), whereas a blurry frame that reaches the model costs 15–120s of
// inference and pollutes the inventory — so a slightly aggressive blur gate is
// the cheaper error. Retune only against real captures, never by feel.

/** Below this mean luma the scene is too dark for the model to identify. */
export const DARK_MEAN_LUMA = 38;
/** Above this the frame is blown out (lens into a lamp/window). */
export const BRIGHT_MEAN_LUMA = 228;
/** Below this Laplacian variance the frame reads as out of focus. */
export const BLUR_FOCUS_SCORE = 500;
/**
 * Near-zero detail AND near-flat luma ⇒ nothing to catalogue. Scaled from the
 * same measurements; the LOW_DETAIL_CONTRAST guard does the real work here
 * (every real photo measured 31–86 contrast, far above it), so this bound only
 * needs to sit well under genuine content.
 */
export const LOW_DETAIL_FOCUS_SCORE = 120;
export const LOW_DETAIL_CONTRAST = 12;
/** Below this many samples the statistics are meaningless — report ok. */
const MIN_SAMPLES = 9;

const ADVICE: Record<Exclude<QualityVerdict, 'ok'>, string> = {
  too_dark: 'Too dark — a little more light usually does it.',
  too_bright: "That's a bit blown out — try angling away from the light.",
  too_blurry: 'That came out blurry — hold still and try again.',
  low_detail:
    "Not much to catalogue in this one — point it at your things and we'll take it from there.",
};

export function adviceFor(verdict: QualityVerdict): string | null {
  return verdict === 'ok' ? null : ADVICE[verdict];
}

/**
 * Variance of the 4-neighbour Laplacian over interior pixels — high for
 * crisp edges, low for smeared or empty frames.
 */
function laplacianVariance(sample: GrayscaleSample): number {
  const { width, height, luma } = sample;
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const value =
        4 * Number(luma[i]) -
        Number(luma[i - 1]) -
        Number(luma[i + 1]) -
        Number(luma[i - width]) -
        Number(luma[i + width]);
      sum += value;
      sumSq += value * value;
      count++;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return Math.max(0, sumSq / count - mean * mean);
}

function meanAndStdDev(luma: ArrayLike<number>): { mean: number; stdDev: number } {
  const n = luma.length;
  if (n === 0) return { mean: 0, stdDev: 0 };
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Number(luma[i]);
  const mean = sum / n;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const d = Number(luma[i]) - mean;
    acc += d * d;
  }
  return { mean, stdDev: Math.sqrt(acc / n) };
}

/**
 * Classifies a frame. Exposure is checked before focus on purpose: a dark
 * frame also has low measurable detail, and "add light" is the useful advice
 * in that case — telling someone their photo is blurry when it is simply
 * dark sends them to the wrong fix.
 */
export function analyzeQuality(sample: GrayscaleSample): QualityReport {
  const { mean, stdDev } = meanAndStdDev(sample.luma);
  const focusScore = laplacianVariance(sample);
  const report = (verdict: QualityVerdict): QualityReport => ({
    verdict,
    meanLuma: mean,
    focusScore,
    contrast: stdDev,
    advice: adviceFor(verdict),
  });

  // Too little data to judge — never block the capture.
  if (sample.luma.length < MIN_SAMPLES) return report('ok');

  if (mean < DARK_MEAN_LUMA) return report('too_dark');
  if (mean > BRIGHT_MEAN_LUMA) return report('too_bright');
  if (focusScore < LOW_DETAIL_FOCUS_SCORE && stdDev < LOW_DETAIL_CONTRAST) {
    return report('low_detail');
  }
  if (focusScore < BLUR_FOCUS_SCORE) return report('too_blurry');
  return report('ok');
}

/** Convenience for callers that only branch on pass/fail. */
export function isProcessableQuality(report: QualityReport): boolean {
  return report.verdict === 'ok';
}
