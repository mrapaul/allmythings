import { useColors } from '@/hooks/useColors';
import type { DetectedItem } from '@/types/inventory';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface ItemCardProps {
  item: DetectedItem & { included: boolean; id: string };
  onUpdate: (id: string, field: keyof DetectedItem, value: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ItemCard({ item, onUpdate, onToggle, onDelete }: ItemCardProps) {
  const colors = useColors();

  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(item.label);

  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(item.description);

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle(item.id);
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDelete(item.id);
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: item.included ? colors.primary : colors.border,
        },
      ]}
    >
      <TouchableOpacity style={styles.toggleArea} onPress={handleToggle} activeOpacity={0.7}>
        <View
          style={[
            styles.checkbox,
            {
              borderColor: item.included ? colors.primary : colors.mutedForeground,
              backgroundColor: item.included ? colors.primary : 'transparent',
            },
          ]}
        >
          {item.included && <Feather name="check" size={14} color={colors.primaryForeground} />}
        </View>
      </TouchableOpacity>

      <View style={styles.contentArea}>
        {isEditingLabel ? (
          <TextInput
            style={[
              styles.labelInput,
              { color: colors.foreground, borderBottomColor: colors.primary },
            ]}
            value={labelValue}
            onChangeText={setLabelValue}
            autoFocus
            onBlur={() => {
              setIsEditingLabel(false);
              onUpdate(item.id, 'label', labelValue);
            }}
            onSubmitEditing={() => {
              setIsEditingLabel(false);
              onUpdate(item.id, 'label', labelValue);
            }}
          />
        ) : (
          <TouchableOpacity onPress={() => setIsEditingLabel(true)}>
            <Text
              style={[
                styles.label,
                { color: item.included ? colors.foreground : colors.mutedForeground },
              ]}
            >
              {item.label || 'Unnamed item'}
              <Feather
                name="edit-2"
                size={12}
                color={colors.mutedForeground}
                style={styles.labelEditIcon}
              />
            </Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.category, { color: colors.primary }]}>{item.category}</Text>

        {isEditingDesc ? (
          <TextInput
            style={[
              styles.descInput,
              { color: colors.foreground, borderBottomColor: colors.primary },
            ]}
            value={descValue}
            onChangeText={setDescValue}
            multiline
            autoFocus
            onBlur={() => {
              setIsEditingDesc(false);
              onUpdate(item.id, 'description', descValue);
            }}
          />
        ) : (
          <TouchableOpacity onPress={() => setIsEditingDesc(true)} style={styles.descContainer}>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              {item.description || 'Add description...'}
              <Feather
                name="edit-2"
                size={10}
                color={colors.mutedForeground}
                style={styles.descEditIcon}
              />
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
        <Feather name="trash-2" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  toggleArea: {
    marginRight: 16,
    paddingTop: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentArea: {
    flex: 1,
  },
  label: {
    fontSize: 19,
    fontFamily: 'Fraunces_600SemiBold',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  labelInput: {
    fontSize: 19,
    fontFamily: 'Fraunces_600SemiBold',
    letterSpacing: -0.2,
    borderBottomWidth: 1,
    paddingBottom: 2,
    marginBottom: 4,
  },
  labelEditIcon: {
    marginLeft: 6,
  },
  category: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  descContainer: {
    marginTop: 4,
  },
  description: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  descInput: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    borderBottomWidth: 1,
    paddingBottom: 2,
    marginTop: 4,
  },
  descEditIcon: {
    marginLeft: 6,
  },
  deleteButton: {
    padding: 8,
    alignSelf: 'flex-start',
  },
});

export default ItemCard;
