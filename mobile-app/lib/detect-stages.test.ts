import { describe, expect, it } from 'vitest';
import { formatElapsedClock, stageSubline, stageTitle } from './detect-stages';

describe('stageTitle', () => {
  it('walks the staged copy as time passes with no items yet', () => {
    expect(stageTitle({ elapsedMs: 2_000, itemCount: 0, expectedTotal: null })).toBe(
      'Reading the scene…',
    );
    expect(stageTitle({ elapsedMs: 20_000, itemCount: 0, expectedTotal: null })).toBe(
      'Cataloguing items…',
    );
    expect(stageTitle({ elapsedMs: 60_000, itemCount: 0, expectedTotal: null })).toBe(
      'Almost there — refining names…',
    );
    expect(stageTitle({ elapsedMs: 200_000, itemCount: 0, expectedTotal: null })).toBe(
      'Still working — dense scenes take a little longer…',
    );
  });

  it('shows honest partial progress once items stream in', () => {
    expect(stageTitle({ elapsedMs: 30_000, itemCount: 4, expectedTotal: 12 })).toBe(
      'Found 4 of ~12…',
    );
    expect(stageTitle({ elapsedMs: 30_000, itemCount: 4, expectedTotal: null })).toBe('4 found…');
    // Never show "4 of ~3" when the estimate was low.
    expect(stageTitle({ elapsedMs: 30_000, itemCount: 4, expectedTotal: 3 })).toBe('4 found…');
  });
});

describe('stageSubline', () => {
  it('formats seconds then minutes', () => {
    expect(stageSubline(5_000)).toBe("5s — we're on it");
    expect(stageSubline(95_000)).toBe('1m 35s — still with you');
  });
});

describe('formatElapsedClock', () => {
  it('counts up in mm:ss', () => {
    expect(formatElapsedClock(0)).toBe('0:00');
    expect(formatElapsedClock(5_000)).toBe('0:05');
    expect(formatElapsedClock(65_000)).toBe('1:05');
    expect(formatElapsedClock(10 * 60_000 + 9_000)).toBe('10:09');
  });

  it('never renders negative time', () => {
    expect(formatElapsedClock(-3_000)).toBe('0:00');
  });
});
