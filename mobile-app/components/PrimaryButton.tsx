import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  Platform,
  type StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  type ViewStyle,
} from 'react-native';

interface PrimaryButtonProps {
  onPress: () => void;
  title: string;
  icon?: keyof typeof Feather.glyphMap;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  variant?: 'primary' | 'secondary' | 'destructive';
}

export function PrimaryButton({
  onPress,
  title,
  icon,
  disabled,
  style,
  variant = 'primary',
}: PrimaryButtonProps) {
  const colors = useColors();

  const handlePress = () => {
    if (!disabled) {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onPress();
    }
  };

  const getBackgroundColor = () => {
    if (disabled) return colors.muted;
    if (variant === 'secondary') return colors.secondary;
    if (variant === 'destructive') return colors.destructive;
    return colors.primary;
  };

  const getTextColor = () => {
    if (disabled) return colors.mutedForeground;
    if (variant === 'secondary') return colors.secondaryForeground;
    if (variant === 'destructive') return colors.destructiveForeground;
    return colors.primaryForeground;
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: getBackgroundColor(), borderRadius: colors.radius },
        style,
      ]}
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {icon && <Feather name={icon} size={20} color={getTextColor()} style={styles.icon} />}
      <Text style={[styles.text, { color: getTextColor() }]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
});

export default PrimaryButton;
