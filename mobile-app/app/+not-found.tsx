import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Hmm' }} />
      <View style={styles.center}>
        <Text style={styles.body}>That page seems to have wandered off.</Text>
        <Link href="/">Back to your collection</Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  body: { fontSize: 15 },
});
