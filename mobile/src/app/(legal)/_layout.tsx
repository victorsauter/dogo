import { Stack, useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { Text } from '@/components';
import { t } from '@/strings';
import { useTheme } from '@/theme';

/** The legal stack is the first screen of its own navigator: it brings its own « Retour ». */
function BackButton() {
  const router = useRouter();
  const { minTouchSize } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.common.back}
      hitSlop={8}
      style={{ minHeight: minTouchSize, justifyContent: 'center' }}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    >
      <Text color="primary" style={{ fontWeight: '600' }}>
        {t.common.back}
      </Text>
    </Pressable>
  );
}

/**
 * Legal texts, reachable signed in (« Réglages ») and signed out (sign-in
 * screen), so they live outside the `(app)` and `(auth)` groups (ADR 0025).
 */
export default function LegalLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        headerLeft: () => <BackButton />,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="terms" options={{ title: t.legal.terms.title }} />
      <Stack.Screen name="privacy" options={{ title: t.legal.privacy.title }} />
    </Stack>
  );
}
