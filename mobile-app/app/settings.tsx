import GlowBackdrop from '@/components/GlowBackdrop';
import { useHomes } from '@/contexts/HomesContext';
import { useInventory } from '@/contexts/InventoryContext';
import { useColors } from '@/hooks/useColors';
import { Prefs } from '@/stores/prefs';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
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

const ICONS = ['🏡', '🏠', '🏢', '🏖️', '🏔️', '🌳', '🛏️', '🛋️', '✨', '🌸'];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { homes, activeHomeId, renameHome, deleteHome, addHome, setActiveHomeId } = useHomes();
  const { counts, deleteAllInActiveHome } = useInventory();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('🏡');

  const prefs = useMemo(() => {
    try {
      return Prefs.makeMmkv();
    } catch {
      return Prefs.makeInMemory();
    }
  }, []);
  const defaultServerUrl =
    ((Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string }).apiBaseUrl ??
    'http://localhost:14000';
  const [serverUrl, setServerUrl] = useState(prefs.getApiBaseUrlOverride() ?? '');
  const saveServerUrl = () => {
    prefs.setApiBaseUrlOverride(serverUrl || null);
    setServerUrl(prefs.getApiBaseUrlOverride() ?? '');
  };

  const startEdit = (id: string, name: string, icon: string) => {
    setEditingId(id);
    setEditName(name);
    setEditIcon(icon);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await renameHome(editingId, editName, editIcon);
    setEditingId(null);
  };

  const handleDeleteHome = (id: string, name: string) => {
    if (homes.length <= 1) {
      Alert.alert('Cannot delete', 'You need at least one home.');
      return;
    }
    Alert.alert(
      `Delete ${name}?`,
      'This removes the home AND every item inside it. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
            // Switch off this home if it's currently active so the active
            // pointer never references a soon-to-be-deleted record.
            if (activeHomeId === id) {
              const next = homes.find((h) => h.id !== id);
              if (next) await setActiveHomeId(next.id);
            }
            await deleteHome(id);
          },
        },
      ],
    );
  };

  const handleDeleteAll = () => {
    Alert.alert(
      'Empty current home?',
      'All items in the active home will be removed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Empty home',
          style: 'destructive',
          onPress: async () => {
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
            await deleteAllInActiveHome();
          },
        },
      ],
    );
  };

  const handleAddHome = async () => {
    await addHome('New Home', '🏡');
  };

  const paddingTop = Platform.OS === 'web' ? 16 : insets.top + 4;

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
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        <Text style={[styles.section, { color: colors.mutedForeground }]}>YOUR HOMES</Text>
        <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {homes.map((home, i) => (
            <View key={home.id}>
              {i > 0 && <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />}
              {editingId === home.id ? (
                <View style={styles.editRow}>
                  <View style={styles.iconRow}>
                    {ICONS.map((icon) => (
                      <Pressable
                        key={icon}
                        onPress={() => setEditIcon(icon)}
                        style={[
                          styles.iconChoice,
                          {
                            backgroundColor: editIcon === icon ? colors.glowPrimary : colors.muted,
                          },
                        ]}
                      >
                        <Text style={styles.iconChoiceText}>{icon}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Home name"
                    placeholderTextColor={colors.mutedForeground}
                    style={[
                      styles.input,
                      { backgroundColor: colors.input, color: colors.foreground },
                    ]}
                  />
                  <View style={styles.editActions}>
                    <Pressable
                      onPress={() => setEditingId(null)}
                      style={({ pressed }) => [
                        styles.secondaryBtn,
                        { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Text style={[styles.btnText, { color: colors.foreground }]}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={saveEdit}
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                      ]}
                    >
                      <Text style={[styles.btnText, { color: colors.primaryForeground }]}>
                        Save
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.row}>
                  <Text style={styles.rowIcon}>{home.icon}</Text>
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowTitle, { color: colors.foreground }]}>
                      {home.name}
                      {home.id === activeHomeId && (
                        <Text style={[styles.activeTag, { color: colors.primary }]}>
                          {'  · active'}
                        </Text>
                      )}
                    </Text>
                    <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
                      {counts[home.id] ?? 0} items
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => startEdit(home.id, home.name, home.icon)}
                    style={styles.rowAction}
                  >
                    <Feather name="edit-2" size={16} color={colors.mutedForeground} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeleteHome(home.id, home.name)}
                    style={styles.rowAction}
                  >
                    <Feather name="trash-2" size={16} color={colors.destructive} />
                  </Pressable>
                </View>
              )}
            </View>
          ))}
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <Pressable onPress={handleAddHome} style={styles.row}>
            <View style={[styles.addIcon, { backgroundColor: colors.glowMint }]}>
              <Feather name="plus" size={18} color={colors.foreground} />
            </View>
            <Text style={[styles.rowTitle, { color: colors.primary }]}>Add a home</Text>
          </Pressable>
        </View>

        <Text style={[styles.section, { color: colors.mutedForeground }]}>SERVER</Text>
        <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={[styles.addIcon, { backgroundColor: colors.glowMint }]}>
              <Feather name="server" size={16} color={colors.foreground} />
            </View>
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>Server URL</Text>
              <TextInput
                accessibilityLabel="Server URL"
                value={serverUrl}
                onChangeText={setServerUrl}
                onEndEditing={saveServerUrl}
                onBlur={saveServerUrl}
                placeholder={defaultServerUrl}
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={[styles.serverInput, { color: colors.foreground }]}
              />
              <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
                Leave empty for the built-in default. Use your Tailscale hostname to reach the
                server away from home.
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.section, { color: colors.mutedForeground }]}>DANGER ZONE</Text>
        <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable onPress={handleDeleteAll} style={styles.row}>
            <View style={[styles.addIcon, { backgroundColor: colors.glowAccent }]}>
              <Feather name="trash-2" size={16} color={colors.destructive} />
            </View>
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, { color: colors.destructive }]}>
                Empty current home
              </Text>
              <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
                Removes every item in the active home
              </Text>
            </View>
          </Pressable>
        </View>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          Photos are stored on this device only.
        </Text>
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
  section: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 8,
    marginLeft: 12,
  },
  group: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 14,
  },
  rowBody: { flex: 1 },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 14,
  },
  rowIcon: {
    fontSize: 24,
  },
  rowTitle: {
    fontFamily: 'Fraunces_500Medium',
    fontSize: 15,
  },
  activeTag: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  rowMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  serverInput: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    paddingVertical: 4,
  },
  rowAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editRow: {
    padding: 14,
    gap: 10,
  },
  iconRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  iconChoice: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChoiceText: { fontSize: 18 },
  input: {
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  editActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  footer: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
  },
});
