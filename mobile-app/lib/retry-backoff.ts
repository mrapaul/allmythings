/** Base delay before the first automatic retry of a failed detection start. */
export const RETRY_BASE_DELAY_MS = 5_000;
/** Ceiling so backoff never grows beyond a friendly wait. */
export const RETRY_MAX_DELAY_MS = 60_000;

/**
 * Exponential backoff: 5s, 10s, 20s, … capped at 60s. `attempt` is the
 * number of retries already made (0 for the first).
 */
export function nextRetryDelayMs(
  attempt: number,
  baseMs: number = RETRY_BASE_DELAY_MS,
  maxMs: number = RETRY_MAX_DELAY_MS,
): number {
  const bounded = Math.min(Math.max(attempt, 0), 10);
  return Math.min(maxMs, baseMs * 2 ** bounded);
}
