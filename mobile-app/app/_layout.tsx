import { HomesProvider } from '@/contexts/HomesContext';
import { InventoryProvider } from '@/contexts/InventoryContext';
import { getDb } from '@/db/client';
import { Repo } from '@/db/repository';
import { initOtel } from '@/observability/otel';
import { initSentry, wrapApp } from '@/observability/sentry';
import { startJobPolling } from '@/services/job-manager';
import { PhotoStorage } from '@/services/photo-storage';
import { startServerDiscovery } from '@/services/server-discovery';
import { Prefs } from '@/stores/prefs';
import { initSuggestionsStore } from '@/stores/suggestions.store';
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
initOtel();

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

  // Zero-config: find the api-service on the LAN via mDNS and persist the
  // last-known-good URL for api/base-url.ts. No-ops when the native module
  // is not linked yet (pre-prebuild builds).
  useEffect(() => startServerDiscovery(prefs), [prefs]);

  // Walk mode: central background polling of dispatched detection jobs.
  useEffect(() => startJobPolling(prefs), [prefs]);

  // Tidy-up queue: hydrate persisted merge suggestions + dismissals.
  useEffect(() => initSuggestionsStore(prefs), [prefs]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <HomesProvider repo={repo} prefs={prefs}>
          <InventoryProvider repo={repo} photoStorage={photoStorage}>
            {/*
              The collection grid is the whole app: viewing/editing an item
              must never navigate away from it. The item route is presented as
              a sheet over the grid, so the grid stays visible underneath and
              dismissal returns to exactly where the user was. The route path
              is unchanged, so deep links still work.
            */}
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen
                name="item/[id]"
                options={{
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                  gestureEnabled: true,
                  sheetGrabberVisible: true,
                }}
              />
            </Stack>
          </InventoryProvider>
        </HomesProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

export default wrapApp(RootLayout);
