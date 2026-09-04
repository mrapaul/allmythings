import { useEffect, useState } from 'react';

/**
 * Trailing-edge debounce for fast-changing values (as-you-type search).
 * The first value renders immediately; subsequent changes settle after
 * `delayMs` of quiet.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
