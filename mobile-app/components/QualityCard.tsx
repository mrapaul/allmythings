import type { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface QualityCardProps {
  icon: keyof typeof Feather.glyphMap;
  /** Defaults to the destructive tone; calmer states pass a muted color. */
  iconColor?: string;
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  colors: ReturnType<typeof useColors>;
}

/** Photo verdict / calm-failure card on the review screen: one message, two choices. */
export function QualityCard({
  icon,
  iconColor,
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  colors,
}: QualityCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon} size={28} color={iconColor ?? colors.destructive} />
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>{body}</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={primaryLabel}
          onPress={onPrimary}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.primaryLabel, { color: colors.primaryForeground }]}>
            {primaryLabel}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={secondaryLabel}
          onPress={onSecondary}
          style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.secondaryLabel, { color: colors.mutedForeground }]}>
            {secondaryLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 24,
    marginTop: 8,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  title: { fontFamily: 'Fraunces_600SemiBold', fontSize: 16, textAlign: 'center' },
  body: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  primaryBtn: { paddingVertical: 10, paddingHorizontal: 22, borderRadius: 22 },
  primaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  secondaryBtn: { paddingVertical: 10, paddingHorizontal: 8 },
  secondaryLabel: { fontFamily: 'Inter_500Medium', fontSize: 13 },
});
