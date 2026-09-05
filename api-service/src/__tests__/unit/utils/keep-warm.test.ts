import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keepModelsWarm } from '../../../utils/keep-warm';

describe('keepModelsWarm', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('warms every model at once, then again on each interval, until stopped', () => {
    const a = vi.fn();
    const b = vi.fn();
    const stop = keepModelsWarm([a, b], 1_000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_500);
    expect(a).toHaveBeenCalledTimes(3);
    expect(b).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(5_000);
    expect(a).toHaveBeenCalledTimes(3);
  });

  it('warms once and never schedules when the interval is disabled', () => {
    const a = vi.fn();
    keepModelsWarm([a], 0);
    vi.advanceTimersByTime(60_000);
    expect(a).toHaveBeenCalledTimes(1);
  });
});
