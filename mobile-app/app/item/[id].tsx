import GlowBackdrop from '@/components/GlowBackdrop';
import KeyboardAwareScrollViewCompat from '@/components/KeyboardAwareScrollViewCompat';
import { useInventory } from '@/contexts/InventoryContext';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
  const { items, updateItem, deleteItem, addPhotoToItem } = useInventory();

  const item = items.find((it) => it.id === id);

  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState('');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState('');

  useEffect(() => {
    if (item) {
      setLabelValue(item.label);
      setDescValue(item.description);
    }
  }, [item]);

  const paddingTop = Platform.OS === 'web' ? 16 : insets.top + 4;

  if (!item) {
    return (
      <View
        style={[styles.container, styles.notFoundCenter, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>
          Item not found.
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
      Alert.alert('Permission needed', 'Please grant access to add a photo.');
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

  const handleDelete = () => {
    Alert.alert('Delete item?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
          await deleteItem(item.id);
          router.back();
        },
      },
    ]);
  };

  const allPhotos = [item.primaryPhotoUri, ...(item.additionalPhotoUris || [])];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlowBackdrop />

      <View style={[styles.header, { paddingTop }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Feather name="chevron-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.mutedForeground }]}>{item.category}</Text>
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
                />
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
          <View style={styles.editableField}>
            {isEditingLabel ? (
              <TextInput
                style={[
                  styles.labelInput,
                  { color: colors.foreground, borderBottomColor: colors.primary },
                ]}
                value={labelValue}
                onChangeText={setLabelValue}
                autoFocus
                onBlur={() => {
                  setIsEditingLabel(false);
                  if (labelValue !== item.label) {
                    void updateItem(item.id, { label: labelValue });
                  }
                }}
              />
            ) : (
              <Pressable onPress={() => setIsEditingLabel(true)}>
                <Text style={[styles.label, { color: colors.foreground }]}>
                  {item.label}
                  {'  '}
                  <Feather name="edit-2" size={14} color={colors.mutedForeground} />
                </Text>
              </Pressable>
            )}
          </View>

          <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
            Catalogued{' '}
            {new Date(item.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>

          {item.tags && item.tags.length > 0 && (
            <View style={styles.tagsWrap}>
              {item.tags.map((tag, i) => (
                <View
                  key={`${i}-${tag}`}
                  style={[
                    styles.tagChip,
                    { backgroundColor: colors.muted, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.tagHash, { color: colors.primary }]}>#</Text>
                  <Text style={[styles.tagLabel, { color: colors.foreground }]} numberOfLines={1}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View
            style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.descLabel, { color: colors.mutedForeground }]}>Notes</Text>
            {isEditingDesc ? (
              <TextInput
                style={[styles.descInput, { color: colors.foreground }]}
                value={descValue}
                onChangeText={setDescValue}
                multiline
                autoFocus
                onBlur={() => {
                  setIsEditingDesc(false);
                  if (descValue !== item.description) {
                    void updateItem(item.id, { description: descValue });
                  }
                }}
              />
            ) : (
              <Pressable onPress={() => setIsEditingDesc(true)}>
                <Text style={[styles.description, { color: colors.foreground }]}>
                  {item.description || 'Tap to add notes about this piece.'}
                </Text>
              </Pressable>
            )}
          </View>

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
  labelInput: {
    fontFamily: 'Fraunces_700Bold',
    fontSize: 30,
    letterSpacing: -0.6,
    borderBottomWidth: 1,
    paddingBottom: 2,
  },
  dateText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 6,
    letterSpacing: 0.2,
  },
  descCard: {
    marginTop: 24,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
  },
  descLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  description: {
    fontFamily: 'Fraunces_400Regular',
    fontSize: 16,
    lineHeight: 24,
  },
  descInput: {
    fontFamily: 'Fraunces_400Regular',
    fontSize: 16,
    lineHeight: 24,
    minHeight: 60,
    textAlignVertical: 'top',
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
  tagHash: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    marginRight: 3,
  },
  tagLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    letterSpacing: 0.1,
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
