import { QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { connectQueryEventsToReactNative, createQueryClient } from '@/api/queryClient';
import { SessionProvider } from '@/auth';
import { unregisterDevice } from '@/notifications';
import { ThemeProvider } from '@/theme';

/**
 * Every app-wide provider, in dependency order. Used by the root layout.
 * `GestureHandlerRootView` comes first: the sliding panel of the « Balades »
 * tab (`@gorhom/bottom-sheet`) needs gesture handling from the app's root.
 */
export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => connectQueryEventsToReactNative(), []);

  // Cached data belongs to the previous user.
  const clearCache = useCallback(() => queryClient.clear(), [queryClient]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <SessionProvider onBeforeSignOut={unregisterDevice} onSignedOut={clearCache}>
              {children}
            </SessionProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
