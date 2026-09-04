import GlowBackdrop from '@/components/GlowBackdrop';
import { useInventory } from '@/contexts/InventoryContext';
import { useColors } from '@/hooks/useColors';
import { buildLabels } from '@/lib/labels';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Offered alongside whatever categories the collection already uses. */
const DEFAULT_CATEGORIES = ['Furniture', 'Decor', 'Kitchen', 'Electronics', 'Books', 'Other'];

/** Manual items carry a full-frame box — no detection localization. */
const FULL_FRAME_BOX = { x: 0, y: 0, width: 1, height: 1 };

/**
 * Add an item by hand — no photo or detection round-trip required (§8: not
 * everything needs detection). The typed name is stored VERBATIM.
 */
export default function AddItemScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items, addItems } = useInventory();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Other');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // The collection's own categories first, defaults filling the gaps.
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const it of items) {
      const c = it.category || 'Other';
      if (!seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
    }
    for (const c of DEFAULT_CATEGORIES) {
      if (!seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
    }
    return out;
  }, [items]);

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
    const uri = result.canceled ? undefined : result.assets?.[0]?.uri;
    if (uri) setPhotoUri(uri);
  };

  const canSave = name.trim().length > 0 && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      // Label stored exactly as typed — user words win over taxonomy.
      await addItems([
        {
          label: name,
          description: '',
          category,
          tags: [],
          primaryPhotoUri: photoUri ?? '',
          thumbnailUri: null,
          attributes: null,
          labels: buildLabels({ label: name, category }),
          additionalPhotoUris: [],
          notes: '',
          box: FULL_FRAME_BOX,
        },
      ]);
      router.replace('/');
    } finally {
      setIsSaving(false);
    }
  };

  const paddingTop = Platform.OS === 'web' ? 16 : insets.top + 4;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlowBackdrop />

      <View style={[styles.header, { paddingTop }]}>
        <Pressable
          accessibilityLabel="Close"
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
          <Feather name="x" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Add an item</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>NAME</Text>
        <TextInput
          testID="manual-add-name"
          value={name}
          onChangeText={setName}
          placeholder="What is it? Your words, exactly."
          placeholderTextColor={colors.mutedForeground}
          autoFocus
          style={[
            styles.nameInput,
            { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
          ]}
        />

        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>CATEGORY</Text>
        <View style={styles.chipRow}>
          {categories.map((c) => (
            <Pressable
              key={c}
              accessibilityLabel={`Category ${c}`}
              onPress={() => setCategory(c)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: category === c ? colors.primary : colors.card,
                  borderColor: category === c ? colors.primary : colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: category === c ? colors.primaryForeground : colors.foreground },
                ]}
              >
                {c}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>PHOTO (OPTIONAL)</Text>
        {photoUri ? (
          <View style={[styles.photoPreviewWrap, { borderColor: colors.border }]}>
            <Image source={photoUri} style={styles.photoPreview} contentFit="cover" />
            <Pressable
              accessibilityLabel="Remove photo"
              onPress={() => setPhotoUri(null)}
              style={[styles.photoRemove, { backgroundColor: colors.card }]}
            >
              <Feather name="x" size={14} color={colors.foreground} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.photoButtons}>
            <Pressable
              onPress={() => void pickPhoto('camera')}
              style={({ pressed }) => [
                styles.photoBtn,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Feather name="camera" size={16} color={colors.foreground} />
              <Text style={[styles.photoBtnText, { color: colors.foreground }]}>Camera</Text>
            </Pressable>
            <Pressable
              onPress={() => void pickPhoto('library')}
              style={({ pressed }) => [
                styles.photoBtn,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Feather name="image" size={16} color={colors.foreground} />
              <Text style={[styles.photoBtnText, { color: colors.foreground }]}>Library</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          testID="manual-add-save"
          accessibilityLabel="Save item"
          disabled={!canSave}
          onPress={() => void handleSave()}
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: colors.primary, opacity: !canSave ? 0.5 : pressed ? 0.85 : 1 },
          ]}
        >
          <Feather name="check" size={18} color={colors.primaryForeground} />
          <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>
            Add to collection
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  headerSpacer: { width: 44 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 22,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 8,
  },
  nameInput: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
  },
  photoBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  photoPreviewWrap: {
    width: 140,
    height: 140,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  photoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    marginTop: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 26,
  },
  saveBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
});
