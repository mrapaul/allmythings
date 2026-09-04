import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Arrange mode (iPhone home-screen idiom): long-press any tile to reveal ×
 * badges on every item. Deletes go through the normal soft-delete + undo
 * snackbar, so there is no confirmation dialog to dismiss. The Android
 * system back gesture leaves arrange mode before anything else.
 */
export function useArrangeMode() {
  const [isArranging, setIsArranging] = useState(false);

  const enterArrangeMode = () => {
    if (isArranging) return;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsArranging(true);
  };
  const exitArrangeMode = () => setIsArranging(false);

  useEffect(() => {
    if (!isArranging) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setIsArranging(false);
      return true;
    });
    return () => sub.remove();
  }, [isArranging]);

  return { isArranging, enterArrangeMode, exitArrangeMode };
}
