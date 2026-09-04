import { describe, expect, it } from 'vitest';
import { RETRY_MAX_DELAY_MS, nextRetryDelayMs } from './retry-backoff';

describe('nextRetryDelayMs', () => {
  it('doubles from the base delay per attempt', () => {
    expect(nextRetryDelayMs(0)).toBe(5_000);
    expect(nextRetryDelayMs(1)).toBe(10_000);
    expect(nextRetryDelayMs(2)).toBe(20_000);
  });

  it('caps at the maximum delay', () => {
    expect(nextRetryDelayMs(6)).toBe(RETRY_MAX_DELAY_MS);
    expect(nextRetryDelayMs(100)).toBe(RETRY_MAX_DELAY_MS);
  });

  it('treats negative attempts as the first attempt', () => {
    expect(nextRetryDelayMs(-3)).toBe(5_000);
  });
});
