import { View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components';
import { config } from '@/lib/config';
import { t } from '@/strings';
import { useTheme } from '@/theme';

export default function SignInScreen() {
  const { spacing } = useTheme();
  return (
    <Screen contentStyle={{ justifyContent: 'center' }}>
      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <Text variant="title" color="primary">
          {t.app.name}
        </Text>
        <Text color="textMuted" align="center">
          {t.app.tagline}
        </Text>
      </View>

      {/* TODO(M2, task 9): Apple and Google sign-in buttons. */}

      {config.devLogin ? (
        <Card>
          <Text variant="subheading">{t.auth.devLoginSection}</Text>
          <Text variant="caption" color="textMuted">
            {t.auth.devLoginHint}
          </Text>
          {/* TODO(M2, task 9): call POST /api/v1/auth/dev, then useSession().setSession(response). */}
          <Button label={t.auth.devLoginButton} variant="secondary" disabled />
        </Card>
      ) : null}
    </Screen>
  );
}
