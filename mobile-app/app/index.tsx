import GlowBackdrop from '@/components/GlowBackdrop';
import { useColors } from '@/hooks/useColors';
import { Text, View } from 'react-native';

export default function Index() {
  const colors = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlowBackdrop />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.text, fontFamily: 'Fraunces_700Bold', fontSize: 28 }}>
          Home Inventory
        </Text>
      </View>
    </View>
  );
}
