import type { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface QualityIconAction {
  icon: keyof typeof Feather.glyphMap;
  /** accessibilityLabel — the action's name for VoiceOver. */
  label: string;
  /** accessibilityHint — what the action does. */
  hint?: string;
  onPress: () => void;
  /** Primary actions fill the accent; secondaries stay ghosted. */
  variant?: 'primary' | 'secondary';
}

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
  /**
   * Icon-only action row (Feather glyphs + accessibility text only). When
   * provided it replaces the text buttons — the card's other uses keep the
   * labeled variant untouched.
   */
  actions?: QualityIconAction[];
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
  actions,
}: QualityCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon} size={28} color={iconColor ?? colors.destructive} />
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>{body}</Text>
      {actions ? (
        <View style={styles.iconActions}>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityLabel={action.label}
              accessibilityHint={action.hint}
              onPress={action.onPress}
              style={({ pressed }) => [
                styles.iconActionBtn,
                action.variant === 'primary'
                  ? { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }
                  : {
                      borderWidth: 1,
                      borderColor: colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
              ]}
            >
              <Feather
                name={action.icon}
                size={18}
                color={action.variant === 'primary' ? colors.primaryForeground : colors.foreground}
              />
            </Pressable>
          ))}
        </View>
      ) : (
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
      )}
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
  iconActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  iconActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
