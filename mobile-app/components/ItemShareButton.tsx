import { useColors } from '@/hooks/useColors';
import { type ShareableItem, shareItemCard } from '@/services/share-item';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

/**
 * Ready-to-wire per-item share button. Drop it into the item detail sheet's
 * header row, right before the delete action, so the pair reads
 * share / delete (same 44pt icon-button chrome, so it drops in unnamed):
 *
 *   <ItemShareButton item={item} />
 *
 * Shares a 'Label — location — added <date>' card with the item's primary
 * photo; the sheet is the OS one, so the answer travels anywhere the family
 * already talks.
 */
export function ItemShareButton({
  item,
  testID = 'item-share-button',
}: {
  item: ShareableItem & { primaryPhotoUri?: string };
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityLabel={`Share ${item.label}`}
      onPress={() => void shareItemCard(item, item.primaryPhotoUri)}
      style={({ pressed }) => [
        styles.iconBtn,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Feather name="share-2" size={18} color={colors.foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ItemShareButton;
