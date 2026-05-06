import { useHomes } from '@/contexts/HomesContext';
import { useInventory } from '@/contexts/InventoryContext';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const ICON_CHOICES = ['🏡', '🏠', '🏢', '🏖️', '🏔️', '🌳', '🛏️', '🛋️', '✨', '🌸'];

export function HomePickerSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const { homes, activeHomeId, setActiveHomeId, addHome } = useHomes();
  const { counts } = useInventory();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('🏡');

  const tap = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  };

  const handleSelect = async (id: string) => {
    tap();
    await setActiveHomeId(id);
    onClose();
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await addHome(newName, newIcon);
    setNewName('');
    setNewIcon('🏡');
    setAdding(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <Text style={[styles.title, { color: colors.foreground }]}>Your homes</Text>

          <ScrollView style={styles.homeList}>
            {homes.map((home) => (
              <Pressable
                key={home.id}
                onPress={() => handleSelect(home.id)}
                style={({ pressed }) => [
                  styles.homeRow,
                  {
                    backgroundColor:
                      home.id === activeHomeId ? `${colors.glowPrimary}55` : 'transparent',
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={styles.homeIcon}>{home.icon}</Text>
                <View style={styles.homeText}>
                  <Text style={[styles.homeName, { color: colors.foreground }]}>{home.name}</Text>
                  <Text style={[styles.homeMeta, { color: colors.mutedForeground }]}>
                    {counts[home.id] ?? 0} items
                  </Text>
                </View>
                {home.id === activeHomeId && (
                  <Feather name="check" size={18} color={colors.primary} />
                )}
              </Pressable>
            ))}
          </ScrollView>

          {adding ? (
            <View
              style={[
                styles.addCard,
                { borderColor: colors.border, backgroundColor: colors.background },
              ]}
            >
              <Text style={[styles.addLabel, { color: colors.mutedForeground }]}>Name</Text>
              <TextInput
                testID="home-sheet-name-input"
                value={newName}
                onChangeText={setNewName}
                placeholder="Beach House"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { backgroundColor: colors.input, color: colors.foreground }]}
                autoFocus
              />
              <Text
                style={[styles.addLabel, styles.addLabelSpaced, { color: colors.mutedForeground }]}
              >
                Icon
              </Text>
              <View style={styles.iconGrid}>
                {ICON_CHOICES.map((icon) => (
                  <Pressable
                    key={icon}
                    onPress={() => setNewIcon(icon)}
                    style={[
                      styles.iconChoice,
                      {
                        backgroundColor: icon === newIcon ? colors.glowPrimary : colors.muted,
                      },
                    ]}
                  >
                    <Text style={styles.iconChoiceText}>{icon}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.addActions}>
                <Pressable
                  onPress={() => setAdding(false)}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.secondaryText, { color: colors.foreground }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  testID="home-sheet-confirm"
                  onPress={handleAdd}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>
                    Add home
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              testID="home-sheet-add-button"
              onPress={() => setAdding(true)}
              style={({ pressed }) => [
                styles.addRow,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="plus" size={18} color={colors.primary} />
              <Text style={[styles.addText, { color: colors.primary }]}>Add a home</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(20, 12, 30, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 20,
    paddingBottom: 32,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.12)',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 22,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  homeList: {
    maxHeight: 320,
  },
  homeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 14,
    marginBottom: 4,
  },
  homeIcon: {
    fontSize: 26,
  },
  homeText: {
    flex: 1,
  },
  homeName: {
    fontFamily: 'Fraunces_500Medium',
    fontSize: 17,
  },
  homeMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  addRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 18,
  },
  addText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  addCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  addLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 0.4,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  addLabelSpaced: {
    marginTop: 12,
  },
  input: {
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconChoice: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChoiceText: {
    fontSize: 22,
  },
  addActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  secondaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  primaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
});

export default HomePickerSheet;
