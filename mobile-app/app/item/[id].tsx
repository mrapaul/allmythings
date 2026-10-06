import GlowBackdrop from '@/components/GlowBackdrop';
import ItemShareButton from '@/components/ItemShareButton';
import KeyboardAwareScrollViewCompat from '@/components/KeyboardAwareScrollViewCompat';
import LocationField from '@/components/LocationField';
import { useInventory } from '@/contexts/InventoryContext';
import { useColors } from '@/hooks/useColors';
import { boxToViewRect, computeCoverLayout, isDetectedBox } from '@/lib/bbox-layout';
import {
  type ItemLabel,
  addLabel,
  labelSuggestions,
  labelsForDisplay,
  parseLabelInput,
  removeLabel,
  typeHandle,
} from '@/lib/labels';
import { visibilityNote, visibilityVerdict } from '@/lib/partial-visibility';
import { pushRecentLocation } from '@/lib/recent-locations';
import { getHomeScreenStore } from '@/stores/home-screen.store';
import { Prefs } from '@/stores/prefs';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GALLERY_SIZE = Math.min(SCREEN_WIDTH - 64, 320);

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { items, updateItem, softDelete, addPhotoToItem } = useInventory();

  const item = items.find((it) => it.id === id);

  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  // Chip editor: input accepts "color: red" or a plain free label.
  const [isAddingLabel, setIsAddingLabel] = useState(false);
  const [labelInput, setLabelInput] = useState('');

  // Location edits are drafted locally and written on commit (submit/blur/
  // chip tap) — never per keystroke.
  const prefs = useMemo(() => {
    try {
      return Prefs.makeMmkv();
    } catch {
      return Prefs.makeInMemory();
    }
  }, []);
  const [locationDraft, setLocationDraft] = useState('');
  const [recentLocations, setRecentLocations] = useState<string[]>(() =>
    prefs.getRecentLocations(),
  );
  useEffect(() => {
    setLocationDraft(item?.location ?? '');
  }, [item?.location]);

  // Natural size for box mapping. expo-image's onLoad can fail to fire for
  // file:// sources on release builds, which silently hid the overlay — so
  // read the source dimensions directly; the gallery onLoad below stays as
  // a fast path, and a square mapping is the last-resort fallback.
  const primaryUri = item?.primaryPhotoUri;
  useEffect(() => {
    let cancelled = false;
    if (!primaryUri) return;
    void (async () => {
      try {
        const src = await Image.loadAsync(primaryUri);
        if (!cancelled && src.width > 0 && src.height > 0) {
          setSourceSize({ width: src.width, height: src.height });
        }
        src.release();
      } catch {
        // keep the square-mapping fallback — the overlay must never vanish
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [primaryUri]);

  const paddingTop = Platform.OS === 'web' ? 16 : insets.top + 4;

  if (!item) {
    return (
      <View
        style={[styles.container, styles.notFoundCenter, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>
          We can't find that item — it may have just been removed.
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const pickPhoto = async (source: 'camera' | 'library') => {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'One quick step',
        source === 'camera'
          ? 'Allow camera access in Settings and we can photograph this item.'
          : 'Allow photo access in Settings and we can add a picture of this item.',
      );
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      await addPhotoToItem(item.id, result.assets[0].uri);
    }
  };

  const handleAddPhoto = () => {
    Alert.alert('Add a photo', 'Choose a source', [
      { text: 'Camera', onPress: () => pickPhoto('camera') },
      { text: 'Library', onPress: () => pickPhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // No confirm dialog: the collection screen shows a 5s Undo snackbar while
  // the delete waits to commit (context soft-delete).
  const handleDelete = () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    softDelete([item.id], typeHandle(labelsForDisplay(item)));
    router.back();
  };

  const allPhotos = [item.primaryPhotoUri, ...(item.additionalPhotoUris || [])];

  // The primary photo is the full source capture; the item's normalized box
  // marks where it was detected. The overlay renders UNCONDITIONALLY for any
  // valid detected box: measured dimensions when available, square mapping
  // otherwise — never silently absent. (x=0 / y=0 are valid coordinates;
  // only width/height decide validity via isDetectedBox.)
  const effectiveSource = sourceSize ?? { width: GALLERY_SIZE, height: GALLERY_SIZE };
  const boxRect = isDetectedBox(item.box)
    ? boxToViewRect(
        item.box,
        computeCoverLayout(
          GALLERY_SIZE,
          GALLERY_SIZE,
          effectiveSource.width,
          effectiveSource.height,
        ),
      )
    : null;
  const chipBelow = boxRect ? boxRect.top + boxRect.height + 8 : 0;
  const detectedChipTop = boxRect
    ? chipBelow <= GALLERY_SIZE - 32
      ? chipBelow
      : Math.max(6, boxRect.top - 32)
    : 0;
  const detectedChipLeft = boxRect ? Math.min(Math.max(boxRect.left, 6), GALLERY_SIZE - 96) : 0;

  // Label-first: persisted chips or derived-from-legacy-columns; editing
  // materializes the full set into the labels JSON — the legacy label /
  // description columns are never mutated.
  const labels = labelsForDisplay(item);
  const commitLabels = (next: ItemLabel[]) => {
    void updateItem(item.id, { labels: next });
  };
  const handleAddLabel = (raw: string) => {
    const parsed = parseLabelInput(raw);
    if (!parsed) return;
    commitLabels(addLabel(labels, parsed));
    setLabelInput('');
    setIsAddingLabel(false);
  };
  // Suggestions from values already used across the inventory, matching the
  // value part of the current input (after any "key:" prefix).
  const inputValuePart = labelInput.includes(':') ? (labelInput.split(':')[1] ?? '') : labelInput;
  const suggestions =
    isAddingLabel && inputValuePart.trim().length > 0
      ? labelSuggestions(
          items.map((it) => labelsForDisplay(it)),
          inputValuePart,
          5,
        ).filter((s) => s.toLowerCase() !== inputValuePart.trim().toLowerCase())
      : [];

  // Partial visibility, derived from the stored box (retroactive, no migration).
  const partialNote = visibilityNote(visibilityVerdict(item.box));

  // Whereabouts: free text the user can change any time. Writing null clears
  // the row; a set location joins the recents offered across the app.
  const commitLocation = (next: string) => {
    const trimmed = next.trim();
    setLocationDraft(trimmed);
    if (trimmed === (item.location ?? '')) return;
    void updateItem(item.id, { location: trimmed || null });
    if (trimmed) {
      const recents = pushRecentLocation(prefs.getRecentLocations(), trimmed);
      prefs.setRecentLocations(recents);
      setRecentLocations(recents);
    }
  };

  // Label chip → collection filtered by that term.
  const searchAttribute = (term: string) => {
    getHomeScreenStore().getState().setQuery(term);
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlowBackdrop />

      {/* Modal chrome: a grabber signals swipe-down-to-dismiss, and "Done"
          replaces the back arrow — there is nowhere to go "back" to, the grid
          is already underneath. */}
      <View style={[styles.grabber, { backgroundColor: colors.border }]} />

      <View style={[styles.header, { paddingTop }]}>
        <Pressable
          testID="item-modal-done"
          accessibilityLabel="Done"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.doneBtn,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text style={[styles.doneText, { color: colors.foreground }]}>Done</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.mutedForeground }]}>{item.category}</Text>
        <ItemShareButton item={item} />
        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Feather name="trash-2" size={18} color={colors.destructive} />
        </Pressable>
      </View>

      <KeyboardAwareScrollViewCompat contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={styles.galleryWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={GALLERY_SIZE + 16}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: (SCREEN_WIDTH - GALLERY_SIZE) / 2 }}
          >
            {allPhotos.map((uri, idx) => (
              <View
                key={`${idx}-${uri}`}
                style={[
                  styles.galleryFrame,
                  {
                    width: GALLERY_SIZE,
                    height: GALLERY_SIZE,
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Image
                  source={uri}
                  style={styles.galleryImage}
                  contentFit="cover"
                  transition={250}
                  onLoad={(e) => {
                    if (idx === 0 && e.source.width > 0 && e.source.height > 0) {
                      setSourceSize({ width: e.source.width, height: e.source.height });
                    }
                  }}
                />
                {idx === 0 && boxRect && (
                  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    {/* Soft scrim over everything EXCEPT the detected region,
                        so the item itself pops. */}
                    <View
                      style={[
                        styles.scrim,
                        { left: 0, right: 0, top: 0, height: Math.max(0, boxRect.top) },
                      ]}
                    />
                    <View
                      style={[
                        styles.scrim,
                        { left: 0, right: 0, top: boxRect.top + boxRect.height, bottom: 0 },
                      ]}
                    />
                    <View
                      style={[
                        styles.scrim,
                        {
                          left: 0,
                          width: Math.max(0, boxRect.left),
                          top: Math.max(0, boxRect.top),
                          height: boxRect.height,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.scrim,
                        {
                          left: boxRect.left + boxRect.width,
                          right: 0,
                          top: Math.max(0, boxRect.top),
                          height: boxRect.height,
                        },
                      ]}
                    />
                    <View
                      testID="detail-bbox-overlay"
                      style={[styles.bboxOverlay, boxRect, { borderColor: colors.primary }]}
                    />
                    <View
                      style={[
                        styles.detectedChip,
                        {
                          backgroundColor: colors.primary,
                          left: detectedChipLeft,
                          top: detectedChipTop,
                        },
                      ]}
                    >
                      <Feather name="crop" size={10} color={colors.primaryForeground} />
                      <Text style={[styles.detectedChipText, { color: colors.primaryForeground }]}>
                        detected
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            ))}
            <Pressable
              onPress={handleAddPhoto}
              style={[
                styles.addPhotoFrame,
                {
                  width: GALLERY_SIZE,
                  height: GALLERY_SIZE,
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather name="plus" size={28} color={colors.mutedForeground} />
              <Text style={[styles.addPhotoText, { color: colors.mutedForeground }]}>
                Add photo
              </Text>
            </Pressable>
          </ScrollView>
        </View>

        <View style={styles.content}>
          <Text style={[styles.label, { color: colors.foreground }]}>{typeHandle(labels)}</Text>

          <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
            Catalogued{' '}
            {new Date(item.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
          {isDetectedBox(item.box) && (
            <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
              Detected in the source photo above — the outline marks this item.
            </Text>
          )}
          {partialNote && (
            <View style={styles.partialRow} testID="partial-indicator">
              <Feather name="maximize" size={11} color={colors.mutedForeground} />
              <Text style={[styles.dateText, { color: colors.mutedForeground, marginTop: 0 }]}>
                {partialNote}
              </Text>
            </View>
          )}

          <View style={styles.locationSection} testID="detail-location">
            <Text style={[styles.locationLabel, { color: colors.mutedForeground }]}>LOCATION</Text>
            <LocationField
              value={locationDraft}
              onChange={setLocationDraft}
              onSelectChip={commitLocation}
              onCommit={commitLocation}
              recents={recentLocations}
            />
          </View>

          <View style={styles.tagsWrap}>
            {labels.map((chip) => (
              <Pressable
                key={`${chip.key}-${chip.value}`}
                testID={`label-chip-${chip.key}-${chip.value}`}
                accessibilityLabel={`Find everything ${chip.value}`}
                onPress={() => searchAttribute(chip.value)}
                style={({ pressed }) => [
                  styles.tagChip,
                  {
                    backgroundColor: colors.muted,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={[styles.labelChipKey, { color: colors.mutedForeground }]}>
                  {chip.key}
                </Text>
                <Text style={[styles.tagLabel, { color: colors.foreground }]} numberOfLines={1}>
                  {chip.value}
                </Text>
                <Pressable
                  testID={`label-chip-remove-${chip.key}-${chip.value}`}
                  accessibilityLabel={`Remove label ${chip.value}`}
                  hitSlop={8}
                  onPress={() => commitLabels(removeLabel(labels, chip))}
                  style={styles.labelChipRemove}
                >
                  <Feather name="x" size={11} color={colors.mutedForeground} />
                </Pressable>
              </Pressable>
            ))}

            <Pressable
              testID="label-editor-open"
              accessibilityLabel="Add a label"
              onPress={() => setIsAddingLabel(true)}
              style={({ pressed }) => [
                styles.tagChip,
                styles.addLabelChip,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="plus" size={12} color={colors.primary} />
              <Text style={[styles.tagLabel, { color: colors.primary }]}>label</Text>
            </Pressable>
          </View>

          {isAddingLabel && (
            <View style={styles.labelEditor}>
              <TextInput
                testID="label-editor-input"
                value={labelInput}
                onChangeText={setLabelInput}
                autoFocus
                autoCapitalize="none"
                placeholder={'red — or — color: red'}
                placeholderTextColor={colors.mutedForeground}
                onSubmitEditing={() => handleAddLabel(labelInput)}
                style={[
                  styles.labelEditorInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
              />
              {suggestions.length > 0 && (
                <View style={styles.tagsWrap}>
                  {suggestions.map((s) => (
                    <Pressable
                      key={s}
                      testID={`label-suggestion-${s}`}
                      accessibilityLabel={`Use label ${s}`}
                      onPress={() => {
                        const prefix = labelInput.includes(':')
                          ? `${labelInput.split(':')[0]}: `
                          : '';
                        handleAddLabel(`${prefix}${s}`);
                      }}
                      style={({ pressed }) => [
                        styles.tagChip,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.tagLabel, { color: colors.foreground }]}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          <Pressable
            onPress={handleAddPhoto}
            style={({ pressed }) => [
              styles.addPhotoBtn,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Feather name="plus-square" size={18} color={colors.foreground} />
            <Text style={[styles.addPhotoBtnText, { color: colors.foreground }]}>
              Add another photo
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  notFoundCenter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  notFoundText: {
    fontFamily: 'Inter_400Regular',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    opacity: 0.8,
  },
  doneBtn: {
    height: 44,
    minWidth: 64,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  galleryWrap: {
    paddingVertical: 16,
  },
  galleryFrame: {
    borderRadius: 28,
    borderWidth: 1,
    marginHorizontal: 8,
    overflow: 'hidden',
    shadowColor: '#2a1f2e',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  bboxOverlay: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 8,
  },
  scrim: {
    position: 'absolute',
    backgroundColor: 'rgba(20, 18, 40, 0.28)',
  },
  detectedChip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 11,
  },
  detectedChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.4,
  },
  attrChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    letterSpacing: 0.1,
    marginLeft: 5,
  },
  addPhotoFrame: {
    borderRadius: 28,
    borderWidth: 1,
    marginHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
  },
  addPhotoText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 6,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  editableField: {
    marginBottom: 4,
  },
  label: {
    fontFamily: 'Fraunces_700Bold',
    fontSize: 30,
    letterSpacing: -0.6,
    lineHeight: 36,
  },
  dateText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 6,
    letterSpacing: 0.2,
  },
  partialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  locationSection: {
    marginTop: 18,
  },
  locationLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.6,
    marginBottom: 8,
    opacity: 0.7,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
    gap: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    maxWidth: 200,
  },
  tagLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    letterSpacing: 0.1,
  },
  labelChipKey: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginRight: 6,
  },
  labelChipRemove: {
    marginLeft: 6,
  },
  addLabelChip: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    gap: 4,
  },
  labelEditor: {
    marginTop: 10,
  },
  labelEditorInput: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  addPhotoBtn: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
  },
  addPhotoBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  actionButton: {
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
});
