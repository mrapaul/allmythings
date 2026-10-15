import { describe, it, expect } from 'vitest';
import { computeCompositeFrameAccuracy, selectBestBurstCandidate } from './burst-lucky-selector';

describe('On-Device Neural Viewfinder & Burst Lucky-Imaging Selector', () => {
  it('penalizes frames with border-clipped objects or specular glare', () => {
    const cleanFrame = computeCompositeFrameAccuracy({
      sharpness: 240,
      luminance: 135,
      glareRatio: 0.01,
      borderClipMax: 0.10,
    });

    const clippedAndGlareFrame = computeCompositeFrameAccuracy({
      sharpness: 240,
      luminance: 135,
      glareRatio: 0.18,
      borderClipMax: 0.65,
    });

    expect(cleanFrame.isOptimal).toBe(true);
    expect(clippedAndGlareFrame.isOptimal).toBe(false);
    expect(cleanFrame.compositeScore).toBeGreaterThan(clippedAndGlareFrame.compositeScore + 0.25);
  });

  it('selects the single highest-accuracy frame from a 3-frame capture burst', () => {
    const burst = [
      { uri: 'file:///burst_1.jpg', sharpness: 120, glareRatio: 0.04, borderClipMax: 0.22 },
      { uri: 'file:///burst_2.jpg', sharpness: 255, glareRatio: 0.01, borderClipMax: 0.08 },
      { uri: 'file:///burst_3.jpg', sharpness: 190, glareRatio: 0.09, borderClipMax: 0.31 },
    ];

    const winner = selectBestBurstCandidate(burst);
    expect(winner.selectedUri).toBe('file:///burst_2.jpg');
    expect(winner.discardedUris).toEqual(['file:///burst_1.jpg', 'file:///burst_3.jpg']);
  });
});
