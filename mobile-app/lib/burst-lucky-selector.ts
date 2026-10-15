export interface FrameAccuracyInput {
  sharpness: number;
  luminance: number;
  glareRatio: number;
  borderClipMax: number;
}

export interface BurstCandidate extends Omit<FrameAccuracyInput, 'luminance'> {
  uri: string;
  luminance?: number;
}

export function computeCompositeFrameAccuracy(input: FrameAccuracyInput): {
  compositeScore: number;
  isOptimal: boolean;
} {
  const normSharpness = Math.min(1.0, input.sharpness / 260.0);
  const glarePenalty = Math.min(1.0, input.glareRatio * 10.0);
  const exposureScore = 1.0 - Math.min(1.0, Math.abs(input.luminance - 135.0) / 110.0);
  const clipPenalty = Math.min(1.0, Math.max(0.0, input.borderClipMax));

  const compositeScore =
    0.4 * normSharpness +
    0.3 * (1.0 - clipPenalty) +
    0.2 * (1.0 - glarePenalty) +
    0.1 * exposureScore;

  const isOptimal =
    compositeScore >= 0.76 &&
    normSharpness >= 0.55 &&
    glarePenalty < 0.25 &&
    clipPenalty < 0.38;

  return { compositeScore, isOptimal };
}

export function selectBestBurstCandidate(candidates: BurstCandidate[]): {
  selectedUri: string;
  compositeScore: number;
  discardedUris: string[];
} {
  if (candidates.length === 0) {
    throw new Error('Burst candidates array cannot be empty');
  }

  let best = candidates[0];
  let bestScore = -Infinity;

  for (const c of candidates) {
    const { compositeScore } = computeCompositeFrameAccuracy({
      sharpness: c.sharpness,
      luminance: c.luminance ?? 135,
      glareRatio: c.glareRatio,
      borderClipMax: c.borderClipMax,
    });
    if (compositeScore > bestScore) {
      bestScore = compositeScore;
      best = c;
    }
  }

  return {
    selectedUri: best.uri,
    compositeScore: bestScore,
    discardedUris: candidates.filter((c) => c.uri !== best.uri).map((c) => c.uri),
  };
}
