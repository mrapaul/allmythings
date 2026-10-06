import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type Props = {
  /** Current choice; '' means "no location". */
  value: string;
  /** Called with the trimmed choice ('' clears it). Single source of truth. */
  onChange: (value: string) => void;
  /** Recent locations, most recent first (Prefs.getRecentLocations()). */
  recents: string[];
  /**
   * Discrete commit — fired with the current value on text submit/blur and
   * on clear. Screens that persist on save (review, manual add) omit this;
   * the detail sheet uses it to write the DB once per edit, not per keystroke.
   */
  onCommit?: (value: string) => void;
  /** Chip tap — defaults to onChange (selection-only screens). */
  onSelectChip?: (location: string) => void;
};

/**
 * Whereabouts picker shared by review, manual add, and the detail sheet:
 * one-tap recent-location chips above a small free-text field for a new
 * one. Free text wins — a location is whatever words help the user find
 * the thing again.
 */
export function LocationField({ value, onChange, recents, onCommit, onSelectChip }: Props) {
  const colors = useColors();
  const chosen = value.trim();

  return (
    <View>
      {recents.length > 0 && (
        <View style={styles.chipRow} testID="location-recents">
          {recents.map((loc) => {
            const active = loc.toLowerCase() === chosen.toLowerCase();
            return (
              <Pressable
                key={loc}
                testID={`location-chip-${loc}`}
                accessibilityLabel={`Location ${loc}`}
                onPress={() => (onSelectChip ?? onChange)(active ? '' : loc)}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Feather
                  name="map-pin"
                  size={11}
                  color={active ? colors.primaryForeground : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? colors.primaryForeground : colors.foreground },
                  ]}
                >
                  {loc}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="map-pin" size={14} color={colors.mutedForeground} />
        <TextInput
          testID="location-input"
          value={value}
          onChangeText={onChange}
          onSubmitEditing={() => onCommit?.(value)}
          onBlur={() => onCommit?.(value)}
          placeholder="Add a location — 'hallway closet, top shelf'"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground }]}
        />
        {value.length > 0 && (
          <Pressable
            accessibilityLabel="Clear location"
            onPress={() => {
              onChange('');
              onCommit?.('');
            }}
            hitSlop={8}
            style={styles.clearDot}
          >
            <Feather name="x" size={12} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 0.1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    gap: 8,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
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

export default LocationField;
