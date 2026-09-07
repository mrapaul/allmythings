import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
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
  /** This row's box is the one drawn in full on the photo. */
  isHighlighted?: boolean;
  /**
   * How many identical detections this row stands for (1 = just itself).
   * Saving or discarding the row applies to all of them.
   */
  groupCount?: number;
  /** Tap the count chip to see each one separately. */
  onExpandGroup?: () => void;
  /** Tap the thumbnail to highlight this item on the photo. */
  onPressThumb?: () => void;
  onChangeTag: (tagIndex: number, value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tagIndex: number) => void;
  onToggleSave: () => void;
  onDiscard: () => void;
};

/**
 * One detected item: box thumbnail, editable label chips, and icon-only
 * actions (save / discard). No swipe gestures — they fought the list scroll
 * on-device, and explicit buttons are discoverable.
 */
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
  isHighlighted = false,
  groupCount = 1,
  onExpandGroup,
  onPressThumb,
  onChangeTag,
  onAddTag,
  onRemoveTag,
  onToggleSave,
  onDiscard,
}: Props) {
  const colors = useColors();
  const isSaved = status === 'saved';

  const triggerSelectionHaptic = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  };

  const handleSavePress = () => {
    if (isSaving) return;
    triggerSelectionHaptic();
    onToggleSave();
  };

  const handleDiscardPress = () => {
    if (isSaving) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onDiscard();
  };

  const accentBorder = isSaved ? colors.success : colors.border;

  return (
    <Animated.View
      entering={FadeIn.delay(Math.min(index, 8) * 50).duration(220)}
      exiting={FadeOut.duration(150)}
      layout={Layout.springify().damping(20)}
      style={styles.outer}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: accentBorder,
            borderWidth: isSaved ? 1.5 : 1,
          },
        ]}
      >
        {groupCount > 1 && (
          <Pressable
            testID={`row-group-${index}`}
            accessibilityRole="button"
            accessibilityLabel={`${groupCount} of these — show each separately`}
            onPress={onExpandGroup}
            style={[styles.groupChip, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.groupChipText, { color: colors.primaryForeground }]}>
              × {groupCount}
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isHighlighted ? 'Clear highlight' : 'Show on photo'}
          testID={`row-thumb-${index}`}
          onPress={onPressThumb}
          disabled={!onPressThumb}
        >
          <BoxThumbnail
            uri={photoUri}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            box={box}
            size={64}
            borderColor={isHighlighted ? colors.primary : isSaved ? colors.success : colors.border}
            dimmed={isSaved}
          />
        </Pressable>

        {/* Label chips */}
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

        {/* Icon-only actions: save + discard */}
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={isSaving ? 'Saving' : isSaved ? 'Unsave item' : 'Save item'}
            testID={`row-save-${index}`}
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
                name={isSaved ? 'check-circle' : 'check'}
                size={16}
                color={colors.primaryForeground}
              />
            )}
          </Pressable>
          {!isSaved && (
            <Pressable
              accessibilityLabel="Discard item"
              testID={`row-discard-${index}`}
              disabled={isSaving}
              onPress={handleDiscardPress}
              hitSlop={6}
              style={({ pressed }) => [
                styles.discardBtn,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="trash-2" size={15} color={colors.destructive} />
            </Pressable>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  groupChip: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 2,
    minWidth: 30,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  outer: {
    marginBottom: 8,
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
  actions: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 8,
  },
  saveBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  discardBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
