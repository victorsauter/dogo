import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useDeleteAccount } from '@/api/account';
import { errorMessage } from '@/api/errors';
import { useSession } from '@/auth';
import { Button, Card, Screen, Text, TextField } from '@/components';
import { setSignInNotice } from '@/lib/signInNotice';
import { format, t } from '@/strings';
import { useTheme } from '@/theme';

/** The typed word counts however it is capitalised or spaced. */
const matchesWord = (text: string) =>
  text.trim().toLocaleUpperCase('fr-FR') === t.deleteAccount.confirmWord;

/**
 * Deletes the account after an explicit confirmation (typing a word). The
 * server removes devices and tokens itself, so the session is only forgotten
 * locally afterwards: no logout, no device removal (ADR 0023).
 */
export default function DeleteAccountScreen() {
  const { spacing } = useTheme();
  const { endSession } = useSession();
  const deleteAccount = useDeleteAccount();
  const [word, setWord] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    deleteAccount.mutate(undefined, {
      onSuccess: async () => {
        setSignInNotice(t.auth.accountDeleted);
        await endSession();
      },
      onError: (e) => setError(errorMessage(e)),
    });
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: t.deleteAccount.title }} />
      <Text>{t.deleteAccount.intro}</Text>
      <Card>
        {t.deleteAccount.consequences.map((consequence) => (
          <View key={consequence} style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Text>•</Text>
            <Text style={{ flex: 1 }}>{consequence}</Text>
          </View>
        ))}
      </Card>
      <TextField
        label={t.deleteAccount.confirmField}
        hint={format(t.deleteAccount.confirmHint, { word: t.deleteAccount.confirmWord })}
        value={word}
        onChangeText={setWord}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={20}
      />
      {error ? (
        <View accessibilityLiveRegion="polite" style={{ gap: spacing.xs }}>
          <Text color="danger" style={{ fontWeight: '700' }}>
            {t.deleteAccount.failed}
          </Text>
          <Text color="danger">{error}</Text>
        </View>
      ) : null}
      <Button
        label={t.deleteAccount.submit}
        variant="danger"
        disabled={!matchesWord(word)}
        loading={deleteAccount.isPending}
        onPress={submit}
      />
    </Screen>
  );
}
