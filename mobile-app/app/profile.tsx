import GlowBackdrop from '@/components/GlowBackdrop';
import { useHomes } from '@/contexts/HomesContext';
import { useInventory } from '@/contexts/InventoryContext';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, updateProfile, homes } = useHomes();
  const { counts } = useInventory();

  const [name, setName] = useState(profile.name);
  const [initials, setInitials] = useState(profile.initials);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    await updateProfile({
      name: name.trim() || 'You',
      initials: (initials.trim() || name.trim().slice(0, 2) || 'Y').toUpperCase(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);
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
        <Text style={[styles.title, { color: colors.foreground }]}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        <View style={styles.heroWrap}>
          <View style={[styles.heroHalo, { backgroundColor: colors.glowPrimary }]} />
          <View
            style={[styles.avatar, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.avatarText, { color: colors.foreground }]}>
              {(initials || 'Y').slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.heroName, { color: colors.foreground }]}>{profile.name}</Text>
          <Text style={[styles.heroMeta, { color: colors.mutedForeground }]}>
            {homes.length} {homes.length === 1 ? 'home' : 'homes'} · {totalItems} items catalogued
          </Text>
        </View>

        <Text style={[styles.section, { color: colors.mutedForeground }]}>YOUR DETAILS</Text>
        <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Display name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.input, color: colors.foreground }]}
            />
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Initials</Text>
            <TextInput
              value={initials}
              onChangeText={(t) => setInitials(t.slice(0, 2).toUpperCase())}
              placeholder="2 letters"
              placeholderTextColor={colors.mutedForeground}
              maxLength={2}
              autoCapitalize="characters"
              style={[styles.input, { backgroundColor: colors.input, color: colors.foreground }]}
            />
          </View>
        </View>

        <Pressable
          onPress={handleSave}
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Feather
            name={saved ? 'check-circle' : 'check'}
            size={16}
            color={colors.primaryForeground}
          />
          <Text style={[styles.saveText, { color: colors.primaryForeground }]}>
            {saved ? 'Saved' : 'Save profile'}
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
  heroWrap: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  heroHalo: {
    position: 'absolute',
    top: 0,
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.5,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  avatarText: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 32,
    letterSpacing: 1,
  },
  heroName: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 22,
    letterSpacing: -0.3,
  },
  heroMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 4,
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
  field: {
    padding: 14,
    gap: 8,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 14,
  },
  input: {
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 16,
    marginTop: 18,
  },
  saveText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
});
