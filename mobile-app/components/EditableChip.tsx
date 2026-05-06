import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, TextInput } from 'react-native';

type Props = {
  label: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  autoFocus?: boolean;
};

/**
 * Hashtag-style editable chip. Tap to edit inline, X to remove.
 * Spring-in on mount, fade/scale-out is handled by parent on remove.
 */
export function EditableChip({ label, onChange, onRemove, autoFocus }: Props) {
  const colors = useColors();
  const inputRef = useRef<TextInput>(null);
  const [editing, setEditing] = useState(!!autoFocus);
  const [draft, setDraft] = useState(label);
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => setDraft(label), [label]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 7,
        tension: 90,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale, opacity]);

  useEffect(() => {
    if (editing) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== label) onChange(trimmed || 'Untitled');
  };

  const handleRemove = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    onRemove();
  };

  const handleEdit = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setEditing(true);
  };

  return (
    <Animated.View
      style={[
        styles.chip,
        {
          backgroundColor: editing ? colors.card : colors.card,
          borderColor: editing ? colors.primary : colors.border,
          transform: [{ scale }],
          opacity,
        },
      ]}
    >
      <Text style={[styles.hash, { color: editing ? colors.primary : colors.mutedForeground }]}>
        #
      </Text>
      {editing ? (
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          returnKeyType="done"
          selectTextOnFocus
          style={[styles.input, { color: colors.foreground }]}
          placeholder="label"
          placeholderTextColor={colors.mutedForeground}
        />
      ) : (
        <Pressable onPress={handleEdit}>
          <Text style={[styles.label, { color: colors.foreground }]} numberOfLines={1}>
            {label || 'untitled'}
          </Text>
        </Pressable>
      )}
      <Pressable onPress={handleRemove} hitSlop={8} style={styles.removeBtn}>
        <Feather name="x" size={11} color={colors.mutedForeground} />
      </Pressable>
    </Animated.View>
  );
}

type AddProps = {
  onAdd: () => void;
};

export function AddChipButton({ onAdd }: AddProps) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync();
        onAdd();
      }}
      style={({ pressed }) => [
        styles.addChip,
        {
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Feather name="plus" size={12} color={colors.mutedForeground} />
      <Text style={[styles.addLabel, { color: colors.mutedForeground }]}>Add tag</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 4,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 6,
    marginBottom: 5,
    maxWidth: 180,
  },
  hash: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    marginRight: 1,
    opacity: 0.7,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 0.1,
    paddingVertical: 1,
    paddingRight: 4,
  },
  input: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    minWidth: 50,
    paddingVertical: 1,
    paddingRight: 4,
  },
  removeBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 1,
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginRight: 6,
    marginBottom: 5,
    gap: 4,
  },
  addLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 0.1,
  },
});

export default EditableChip;
