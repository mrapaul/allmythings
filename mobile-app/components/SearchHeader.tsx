import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
};

/**
 * Always-visible search bar — sleek and ambient.
 * Magnifier inside the field, clear-X appears when there's text.
 */
export const SearchHeader = forwardRef<TextInput, Props>(function SearchHeader(
  { value, onChange, placeholder = 'Search items, rooms, categories…' },
  ref,
) {
  const colors = useColors();

  return (
    <View style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name="search" size={16} color={colors.mutedForeground} />
      <TextInput
        ref={ref}
        testID="search-input"
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        returnKeyType="search"
        style={[styles.input, { color: colors.foreground }]}
      />
      {value.length > 0 && (
        <Pressable accessibilityLabel="Clear search" onPress={() => onChange('')} hitSlop={8}>
          <View style={[styles.clearDot, { backgroundColor: colors.muted }]}>
            <Feather name="x" size={12} color={colors.mutedForeground} />
          </View>
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    gap: 10,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    letterSpacing: 0.1,
  },
  clearDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default SearchHeader;
