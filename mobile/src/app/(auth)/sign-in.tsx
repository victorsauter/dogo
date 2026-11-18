import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Screen, Text, TextField } from '@/components';
import { isAppleSignInAvailable } from '@/auth/providers/apple';
import { isGoogleSignInAvailable } from '@/auth/providers/google';
import { signInErrorMessage, useAppleSignIn, useDevSignIn, useGoogleSignIn } from '@/auth/signIn';
import { config } from '@/lib/config';
import { t } from '@/strings';
import { useTheme } from '@/theme';

export default function SignInScreen() {
  const { spacing } = useTheme();
  const apple = useAppleSignIn();
  const google = useGoogleSignIn();
  const dev = useDevSignIn();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [googleAvailable] = useState(isGoogleSignInAvailable);
  const [subject, setSubject] = useState<string>(t.auth.devDefaultIdentifier);
  const [displayName, setDisplayName] = useState<string>(t.auth.devDefaultDisplayName);

  useEffect(() => {
    let active = true;
    void isAppleSignInAvailable().then((available) => {
      if (active) setAppleAvailable(available);
    });
    return () => {
      active = false;
    };
  }, []);

  const busy = apple.isPending || google.isPending || dev.isPending;
  const error = [apple, google, dev].find((mutation) => mutation.isError)?.error;
  const hasMethod = appleAvailable || googleAvailable || config.devLogin;

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

      {appleAvailable || googleAvailable ? (
        <View style={{ gap: spacing.md }}>
          {appleAvailable ? (
            <Button
              label={t.auth.signInWithApple}
              loading={apple.isPending}
              disabled={busy}
              onPress={() => {
                google.reset();
                dev.reset();
                apple.mutate();
              }}
            />
          ) : null}
          {googleAvailable ? (
            <Button
              label={t.auth.signInWithGoogle}
              variant="secondary"
              loading={google.isPending}
              disabled={busy}
              onPress={() => {
                apple.reset();
                dev.reset();
                google.mutate();
              }}
            />
          ) : null}
        </View>
      ) : null}

      {config.devLogin ? (
        <Card>
          <Text variant="subheading">{t.auth.devLoginSection}</Text>
          <Text variant="caption" color="textMuted">
            {t.auth.devLoginHint}
          </Text>
          <TextField
            label={t.auth.devIdentifier}
            value={subject}
            onChangeText={setSubject}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={100}
          />
          <TextField
            label={t.auth.devDisplayName}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={50}
          />
          <Button
            label={t.auth.devLoginButton}
            variant="secondary"
            loading={dev.isPending}
            disabled={busy || !subject.trim() || !displayName.trim()}
            onPress={() => {
              apple.reset();
              google.reset();
              dev.mutate({ subject: subject.trim(), displayName: displayName.trim() });
            }}
          />
        </Card>
      ) : null}

      {!hasMethod ? (
        <Card>
          <Text variant="subheading">{t.auth.noMethodTitle}</Text>
          <Text color="textMuted">{t.auth.noMethodMessage}</Text>
        </Card>
      ) : null}

      {error ? (
        <Text color="danger" align="center" accessibilityLiveRegion="polite">
          {signInErrorMessage(error)}
        </Text>
      ) : null}
    </Screen>
  );
}
