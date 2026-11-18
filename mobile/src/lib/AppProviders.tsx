import { QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { connectQueryEventsToReactNative, createQueryClient } from '@/api/queryClient';
import { SessionProvider } from '@/auth';
import { unregisterDevice } from '@/notifications';
import { ThemeProvider } from '@/theme';

/** Every app-wide provider, in dependency order. Used by the root layout. */
export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => connectQueryEventsToReactNative(), []);

  // Cached data belongs to the previous user.
  const clearCache = useCallback(() => queryClient.clear(), [queryClient]);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider onBeforeSignOut={unregisterDevice} onSignedOut={clearCache}>
            {children}
          </SessionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
