import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the OS "reduce motion" setting. Decorative loops (the arrange-mode
 * tile wobble) must be skipped when it is on — the affordance itself stays,
 * only the animation goes.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduceMotion(enabled);
      })
      .catch(() => {
        // Setting unavailable — assume motion is fine.
      });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled: boolean) =>
      setReduceMotion(enabled),
    );
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return reduceMotion;
}
