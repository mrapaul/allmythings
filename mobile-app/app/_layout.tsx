import { HomesProvider } from '@/contexts/HomesContext';
import { InventoryProvider } from '@/contexts/InventoryContext';
import { getDb } from '@/db/client';
import { Repo } from '@/db/repository';
import { initSentry, wrapApp } from '@/observability/sentry';
import { PhotoStorage } from '@/services/photo-storage';
import { Prefs } from '@/stores/prefs';
import { Fraunces_700Bold, useFonts } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Module-load side-effects: install observability before anything else
// can throw, so error reports + traces capture the very first frame.
initSentry();

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayout() {
  const [loaded] = useFonts({
    Fraunces_700Bold,
    Inter_400Regular,
    Inter_600SemiBold,
  });
  const repo = useMemo(() => new Repo(getDb()), []);
  const prefs = useMemo(() => Prefs.makeMmkv(), []);
  const photoStorage = useMemo(() => PhotoStorage.fromExpo(), []);
  const queryClient = useMemo(() => new QueryClient(), []);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <HomesProvider repo={repo} prefs={prefs}>
          <InventoryProvider repo={repo} photoStorage={photoStorage}>
            <Stack screenOptions={{ headerShown: false }} />
          </InventoryProvider>
        </HomesProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

export default wrapApp(RootLayout);
