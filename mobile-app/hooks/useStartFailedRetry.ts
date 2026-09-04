import { nextRetryDelayMs } from '@/lib/retry-backoff';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Relaunch control for a detection that could not start. `retryNonce` is a
 * dependency of the run effect; bumping it relaunches. While `active`, the
 * calm failure state auto-retries with backoff and again the moment the app
 * returns to the foreground.
 */
export function useStartFailedRetry(active: boolean) {
  const [retryNonce, setRetryNonce] = useState(0);
  const attemptRef = useRef(0);

  const retryNow = useCallback(() => {
    attemptRef.current += 1;
    setRetryNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(retryNow, nextRetryDelayMs(attemptRef.current));
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') retryNow();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [active, retryNow]);

  /** The capture reached the server: the backoff ladder starts over. */
  const resetAttempts = useCallback(() => {
    attemptRef.current = 0;
  }, []);

  return { retryNonce, retryNow, resetAttempts };
}
