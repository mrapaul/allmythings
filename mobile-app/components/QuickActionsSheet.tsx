import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type QuickAction = 'edit' | 'move' | 'delete';

type Props = {
  visible: boolean;
  itemLabel?: string;
  onAction: (a: QuickAction) => void;
  onClose: () => void;
  showMove?: boolean;
};

type RowProps = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  tone?: 'default' | 'danger';
  onPress: () => void;
};

/**
 * Long-press contextual actions: Edit / Move home / Delete.
 * Slides up from bottom, dismisses on backdrop tap.
 */
export function QuickActionsSheet({ visible, itemLabel, onAction, onClose, showMove }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withTiming(visible ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [visible, t]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - t.value) * 320 }],
    opacity: 0.5 + t.value * 0.5,
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: t.value * 0.5 }));

  const tap = (kind?: 'warn') => {
    if (Platform.OS === 'web') return;
    if (kind === 'warn') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      Haptics.selectionAsync();
    }
  };

  const Row = ({ icon, label, tone, onPress }: RowProps) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.muted : 'transparent' },
      ]}
      accessibilityLabel={label}
    >
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: tone === 'danger' ? `${colors.destructive}1f` : colors.secondary,
          },
        ]}
      >
        <Feather
          name={icon}
          size={18}
          color={tone === 'danger' ? colors.destructive : colors.foreground}
        />
      </View>
      <Text
        style={[
          styles.rowLabel,
          {
            color: tone === 'danger' ? colors.destructive : colors.foreground,
          },
        ]}
      >
        {label}
      </Text>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      </Pressable>
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
          },
          sheetStyle,
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        {itemLabel && (
          <Text style={[styles.title, { color: colors.mutedForeground }]} numberOfLines={1}>
            #{itemLabel}
          </Text>
        )}
        <Row
          icon="edit-2"
          label="Rename"
          onPress={() => {
            tap();
            onAction('edit');
          }}
        />
        {showMove && (
          <Row
            icon="home"
            label="Move to another home"
            onPress={() => {
              tap();
              onAction('move');
            }}
          />
        )}
        <Row
          icon="trash-2"
          label="Delete item"
          tone="danger"
          onPress={() => {
            tap('warn');
            onAction('delete');
          }}
        />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#1c1b3f' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    letterSpacing: -0.1,
  },
});

export default QuickActionsSheet;
