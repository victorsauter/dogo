import { SplashScreen, Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useSessionUserSync } from '@/api/profile';
import { useSession } from '@/auth';
import { EmptyState, Screen } from '@/components';
import { AppProviders } from '@/lib/AppProviders';
import { NotificationsEffects } from '@/notifications';
import { t } from '@/strings';
import { ThemeProvider, useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

/**
 * Expo Router renders this in place of the root layout when a screen throws
 * while rendering, instead of closing the app. It sits outside `AppProviders`
 * (the layout that threw is gone), so it brings the little it needs: the theme. « Réessayer » (`retry`) renders the route again.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <ThemeProvider>
      <Screen scroll={false}>
        <EmptyState
          icon="warning"
          title={t.states.crashTitle}
          message={t.states.crashMessage}
          action={{ label: t.common.retry, onPress: () => void retry() }}
        />
      </Screen>
    </ThemeProvider>
  );
}

/**
 * Auth gate: signed-in users only reach `(app)`, everyone else only `(auth)`.
 * The splash screen stays up while the stored session is read. The session
 * user follows the server (`useSessionUserSync`).
 */
function RootNavigator() {
  const { status } = useSession();
  const theme = useTheme();
  const signedIn = status === 'signedIn';
  useSessionUserSync();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hide();
  }, [status]);

  return (
    <>
      <NotificationsEffects />
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Protected guard={signedIn} redirectTo="/sign-in">
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn} redirectTo="/">
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Screen name="(legal)" />
      </Stack>
    </>
  );
}
