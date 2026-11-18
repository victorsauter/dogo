import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/auth';
import { shouldShowWelcome } from '@/lib/welcomeNudge';
import { t } from '@/strings';
import { useTheme } from '@/theme';

/**
 * Signed-in area: the tabs, and the screens pushed on top of them (edit
 * profile, public profile, dogs, walks). Also opens the edit-profile screen once for
 * a new member who still has the default display name.
 */
export default function AppLayout() {
  const { colors } = useTheme();
  const { user } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (user && shouldShowWelcome(user)) {
      router.push({ pathname: '/edit-profile', params: { welcome: '1' } });
    }
  }, [user, router]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="edit-profile"
        options={{ title: t.profile.editTitle, presentation: 'modal' }}
      />
      <Stack.Screen name="users/[id]" options={{ title: t.profile.publicTitle }} />
      <Stack.Screen name="dogs/new" options={{ title: t.dog.addTitle }} />
      <Stack.Screen name="dogs/[id]/index" options={{ title: t.dog.detailTitle }} />
      <Stack.Screen name="dogs/[id]/edit" options={{ title: t.dog.editTitle }} />
      <Stack.Screen name="walks/new" options={{ title: t.walk.newTitle }} />
      <Stack.Screen name="walks/[id]/index" options={{ title: t.walk.detailTitle }} />
      <Stack.Screen name="walks/[id]/edit" options={{ title: t.walk.editTitle }} />
      <Stack.Screen name="walks/[id]/messages" options={{ title: t.thread.title }} />
      <Stack.Screen name="notifications" options={{ title: t.notifications.title }} />
    </Stack>
  );
}
