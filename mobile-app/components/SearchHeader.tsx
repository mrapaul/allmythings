import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Focus/blur hooks let the caller reveal recent searches while typing. */
  onFocus?: () => void;
  onBlur?: () => void;
  /** Fired on the keyboard's search action — commits the query. */
  onSubmit?: () => void;
};

/**
 * Always-visible search bar — sleek and ambient.
 * Magnifier inside the field, clear-X appears when there's text.
 */
export const SearchHeader = forwardRef<TextInput, Props>(function SearchHeader(
  { value, onChange, placeholder = 'Search items, rooms, categories…', onFocus, onBlur, onSubmit },
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
        onFocus={onFocus}
        onBlur={onBlur}
        onSubmitEditing={onSubmit}
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
    height: 44,
    borderRadius: 22,
    // Hairline, not a full border: the field should recede until needed.
    borderWidth: StyleSheet.hairlineWidth,
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
