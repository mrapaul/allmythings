import { describe, expect, it } from 'vitest';
import {
  BLUR_FOCUS_SCORE,
  type GrayscaleSample,
  analyzeQuality,
  isProcessableQuality,
} from './image-quality';

const SIZE = 32;

/** Flat field of one luma value — a blank wall. */
function flat(value: number, size = SIZE): GrayscaleSample {
  return { width: size, height: size, luma: new Uint8Array(size * size).fill(value) };
}

/**
 * Hard checkerboard: maximum high-frequency energy — a crisp, detailed frame.
 * `scale` is the square size in pixels (1 = finest detail).
 */
function checkerboard(low: number, high: number, scale = 1, size = SIZE): GrayscaleSample {
  const luma = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const on = (Math.floor(x / scale) + Math.floor(y / scale)) % 2 === 0;
      luma[y * size + x] = on ? high : low;
    }
  }
  return { width: size, height: size, luma };
}

/** Smooth horizontal ramp: plenty of contrast, no sharp edges — soft/blurry. */
function ramp(from: number, to: number, size = SIZE): GrayscaleSample {
  const luma = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      luma[y * size + x] = Math.round(from + ((to - from) * x) / (size - 1));
    }
  }
  return { width: size, height: size, luma };
}

describe('analyzeQuality — exposure', () => {
  it('flags a dark frame and tells the user to add light', () => {
    const report = analyzeQuality(flat(10));
    expect(report.verdict).toBe('too_dark');
    expect(report.advice).toContain('more light');
    expect(isProcessableQuality(report)).toBe(false);
  });

  it('flags a blown-out frame', () => {
    expect(analyzeQuality(flat(245)).verdict).toBe('too_bright');
  });

  it('prefers the exposure verdict over blur for a dark, detailless frame', () => {
    // A dark frame is also low-detail and low-focus; "add light" is the
    // actionable advice, so exposure must win the classification.
    expect(analyzeQuality(flat(15)).verdict).toBe('too_dark');
    expect(analyzeQuality(checkerboard(0, 20)).verdict).toBe('too_dark');
  });

  it('accepts normal indoor exposure with detail', () => {
    const report = analyzeQuality(checkerboard(60, 200));
    expect(report.verdict).toBe('ok');
    expect(report.meanLuma).toBeGreaterThan(100);
    expect(report.meanLuma).toBeLessThan(160);
  });
});

describe('analyzeQuality — focus', () => {
  it('scores a crisp frame far above the blur threshold', () => {
    expect(analyzeQuality(checkerboard(40, 210)).focusScore).toBeGreaterThan(BLUR_FOCUS_SCORE * 10);
  });

  it('flags a well-exposed but smeared frame as blurry, not dark', () => {
    // A smooth ramp has strong contrast but almost no high-frequency energy.
    const report = analyzeQuality(ramp(60, 200));
    expect(report.verdict).toBe('too_blurry');
    expect(report.advice).toContain('hold still');
    expect(report.contrast).toBeGreaterThan(20);
  });

  it('treats coarse-but-sharp detail as acceptable', () => {
    // Larger blocks = less high-frequency energy, but real edges remain.
    expect(analyzeQuality(checkerboard(50, 205, 4)).verdict).toBe('ok');
  });
});

describe('analyzeQuality — empty frames', () => {
  it('flags a mid-grey blank wall as nothing much to catalogue', () => {
    const report = analyzeQuality(flat(128));
    expect(report.verdict).toBe('low_detail');
    expect(report.advice).toContain('Not much to catalogue');
  });

  it('does not call a detailed frame low-detail', () => {
    expect(analyzeQuality(checkerboard(60, 190)).verdict).toBe('ok');
  });
});

describe('analyzeQuality — degenerate input', () => {
  it('never blocks a capture when there is too little data to judge', () => {
    expect(analyzeQuality({ width: 1, height: 1, luma: [128] }).verdict).toBe('ok');
    expect(analyzeQuality({ width: 0, height: 0, luma: [] }).verdict).toBe('ok');
  });

  it('handles plain number arrays as well as typed arrays', () => {
    const grid = flat(128);
    const asArray = { ...grid, luma: Array.from(grid.luma) };
    expect(analyzeQuality(asArray).verdict).toBe(analyzeQuality(grid).verdict);
  });
});
