import { useColors } from '@/hooks/useColors';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface SnackbarProps {
  visible: boolean;
  message: string;
  actionLabel?: string;
  /**
   * Stable handle for the action button. The snackbar is a 5s transient, so an
   * end-to-end test searching for it by visible text can lose the race; a
   * testID resolves directly.
   */
  actionTestID?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  testID?: string;
}

/**
 * Non-blocking bottom snackbar with an optional primary action (e.g. Undo)
 * and a quieter secondary affordance. The caller owns visibility and any
 * auto-dismiss window.
 */
export function Snackbar({
  visible,
  message,
  actionLabel,
  actionTestID,
  onAction,
  secondaryLabel,
  onSecondary,
  testID,
}: SnackbarProps) {
  const colors = useColors();
  if (!visible) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none" {...(testID ? { testID } : {})}>
      <View style={[styles.bar, { backgroundColor: colors.foreground }]}>
        <Text style={[styles.message, { color: colors.background }]} numberOfLines={2}>
          {message}
        </Text>
        {secondaryLabel && onSecondary && (
          <Pressable
            accessibilityLabel={secondaryLabel}
            onPress={onSecondary}
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.secondaryLabel, { color: colors.background }]}>
              {secondaryLabel}
            </Text>
          </Pressable>
        )}
        {actionLabel && onAction && (
          <Pressable
            accessibilityLabel={actionLabel}
            {...(actionTestID ? { testID: actionTestID } : {})}
            onPress={onAction}
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.actionLabel, { color: colors.accent }]}>{actionLabel}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 118,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 6,
  },
  message: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
  },
  actionBtn: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  actionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  secondaryLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    opacity: 0.75,
  },
});
