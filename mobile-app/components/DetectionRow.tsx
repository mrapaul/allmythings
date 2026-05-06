import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  Layout,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BoxThumbnail } from './BoxThumbnail';
import { AddChipButton, EditableChip } from './EditableChip';

export type DetectionRowStatus = 'pending' | 'saved';

type Props = {
  photoUri: string;
  imageWidth: number;
  imageHeight: number;
  box: { x: number; y: number; width: number; height: number };
  tags: string[];
  status: DetectionRowStatus;
  isSaving?: boolean;
  index: number;
  autoFocusFirst?: boolean;
  onChangeTag: (tagIndex: number, value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tagIndex: number) => void;
  onToggleSave: () => void;
  onDiscard: () => void;
};

const SWIPE_THRESHOLD = 110;
const SWIPE_OFF = 480;

export function DetectionRow({
  photoUri,
  imageWidth,
  imageHeight,
  box,
  tags,
  status,
  isSaving = false,
  index,
  autoFocusFirst,
  onChangeTag,
  onAddTag,
  onRemoveTag,
  onToggleSave,
  onDiscard,
}: Props) {
  const colors = useColors();
  const translateX = useSharedValue(0);
  const itemHeight = useSharedValue<number | undefined>(undefined);
  const opacity = useSharedValue(1);
  const [hintLeft, setHintLeft] = useState(false);
  const [hintRight, setHintRight] = useState(false);

  const isSaved = status === 'saved';

  const triggerSelectionHaptic = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  };

  const triggerWarningHaptic = () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const finishDiscard = () => {
    onDiscard();
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .enabled(!isSaved && !isSaving)
    .onUpdate((e: { translationX: number }) => {
      translateX.value = e.translationX;
      const past = Math.abs(e.translationX) > SWIPE_THRESHOLD;
      if (e.translationX < 0) {
        runOnJS(setHintLeft)(past);
        runOnJS(setHintRight)(false);
      } else if (e.translationX > 0) {
        runOnJS(setHintRight)(past);
        runOnJS(setHintLeft)(false);
      } else {
        runOnJS(setHintLeft)(false);
        runOnJS(setHintRight)(false);
      }
    })
    .onEnd(() => {
      if (Math.abs(translateX.value) > SWIPE_THRESHOLD) {
        const dir = translateX.value < 0 ? -1 : 1;
        translateX.value = withTiming(SWIPE_OFF * dir, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
        });
        opacity.value = withTiming(0, { duration: 180 });
        itemHeight.value = withTiming(0, { duration: 200 }, () => {
          runOnJS(finishDiscard)();
        });
        runOnJS(triggerWarningHaptic)();
      } else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
        runOnJS(setHintLeft)(false);
        runOnJS(setHintRight)(false);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  // collapse height when discarded
  const collapseStyle = useAnimatedStyle(() =>
    itemHeight.value === undefined ? {} : { height: itemHeight.value, overflow: 'hidden' },
  );

  const handleSavePress = () => {
    if (isSaving) return;
    triggerSelectionHaptic();
    onToggleSave();
  };

  const accentBorder = isSaved ? colors.success : colors.border;

  return (
    <Animated.View
      entering={FadeIn.delay(Math.min(index, 8) * 50).duration(220)}
      exiting={FadeOut.duration(150)}
      layout={Layout.springify().damping(20)}
      style={[styles.outer, collapseStyle]}
    >
      {/* Discard hint background — visible while user is dragging */}
      <View
        style={[
          styles.hintLayer,
          {
            backgroundColor: hintLeft || hintRight ? 'rgba(207, 80, 92, 0.12)' : 'transparent',
          },
        ]}
        pointerEvents="none"
      >
        {hintLeft && (
          <View style={[styles.hintRight]}>
            <Feather name="trash-2" size={20} color="#cf505c" />
            <Text style={[styles.hintText, { color: '#cf505c' }]}>Release to discard</Text>
          </View>
        )}
        {hintRight && (
          <View style={[styles.hintLeft]}>
            <Feather name="trash-2" size={20} color="#cf505c" />
            <Text style={[styles.hintText, { color: '#cf505c' }]}>Release to discard</Text>
          </View>
        )}
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: accentBorder,
              borderWidth: isSaved ? 1.5 : 1,
            },
            cardStyle,
          ]}
        >
          <BoxThumbnail
            uri={photoUri}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            box={box}
            size={64}
            borderColor={isSaved ? colors.success : colors.border}
            dimmed={isSaved}
          />

          {/* Tags + actions */}
          <View style={styles.body}>
            <View style={styles.tagsRow}>
              {isSaved
                ? tags
                    .filter((t) => t.trim().length > 0)
                    .map((t, i) => (
                      <View
                        key={`f-${i}-${t}`}
                        style={[
                          styles.frozenChip,
                          {
                            backgroundColor: colors.muted,
                            borderColor: `${colors.success}55`,
                          },
                        ]}
                      >
                        <Text style={[styles.frozenHash, { color: colors.success }]}>#</Text>
                        <Text
                          style={[styles.frozenLabel, { color: colors.foreground }]}
                          numberOfLines={1}
                        >
                          {t}
                        </Text>
                      </View>
                    ))
                : tags.map((t, i) => {
                    const focus = autoFocusFirst === true && i === tags.length - 1 && t === '';
                    return (
                      <EditableChip
                        key={`${i}-${t}`}
                        label={t}
                        autoFocus={focus}
                        onChange={(v) => onChangeTag(i, v)}
                        onRemove={() => onRemoveTag(i)}
                      />
                    );
                  })}
              {!isSaved && <AddChipButton onAdd={onAddTag} />}
            </View>

            {isSaved && (
              <View style={styles.savedRow}>
                <Feather name="lock" size={9} color={colors.mutedForeground} />
                <Text style={[styles.savedHint, { color: colors.mutedForeground }]}>
                  Frozen · tap ✓ to unsave
                </Text>
              </View>
            )}
          </View>

          {/* Save toggle */}
          <Pressable
            accessibilityLabel={isSaving ? 'Saving' : isSaved ? 'Unsave item' : 'Save item'}
            disabled={isSaving}
            onPress={handleSavePress}
            hitSlop={6}
            style={({ pressed }) => [
              styles.saveBtn,
              {
                backgroundColor: isSaved ? colors.success : colors.primary,
                opacity: isSaving ? 0.7 : pressed ? 0.85 : 1,
                shadowColor: isSaved ? colors.success : colors.primary,
              },
            ]}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather
                name={isSaved ? 'check' : 'bookmark'}
                size={16}
                color={colors.primaryForeground}
              />
            )}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginBottom: 8,
    position: 'relative',
  },
  hintLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  hintLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hintRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  hintText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    borderRadius: 18,
    shadowColor: '#1c1b3f',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  body: {
    flex: 1,
    minHeight: 64,
    justifyContent: 'center',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  savedHint: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    letterSpacing: 0.3,
  },
  saveBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  frozenChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    marginRight: 6,
    marginBottom: 5,
    maxWidth: 160,
  },
  frozenHash: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    marginRight: 2,
  },
  frozenLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 0.1,
  },
});
