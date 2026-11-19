import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useGuardedRouter } from '@/lib/navigation';
import { useDeleteDog, useDog } from '@/api/dogs';
import { errorMessage } from '@/api/errors';
import { useSession } from '@/auth';
import { Avatar, Button, Card, ErrorState, LoadingState, Screen, Text } from '@/components';
import { formatAge } from '@/lib/age';
import { useFocusedRouter } from '@/lib/hooks';
import { reportHref } from '@/lib/report';
import { enumLabel, format, t } from '@/strings';
import { useTheme } from '@/theme';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View accessible accessibilityLabel={`${label} : ${value}`}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text>{value}</Text>
    </View>
  );
}

/** Read-only profile of a dog; the owner also gets edit and delete. */
export default function DogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const { spacing } = useTheme();
  const router = useGuardedRouter();
  const focusedRouter = useFocusedRouter();
  const dog = useDog(id);
  const deleteDog = useDeleteDog();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (dog.isPending)
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  if (dog.isError) {
    return (
      <Screen scroll={false}>
        <ErrorState error={dog.error} onRetry={() => dog.refetch()} />
      </Screen>
    );
  }

  const data = dog.data;
  const mine = data.ownerId === user?.id;

  function confirmDelete() {
    setDeleteError(null);
    Alert.alert(format(t.dog.deleteConfirmTitle, { name: data.name }), t.dog.deleteConfirmMessage, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: () => {
          deleteDog.mutate(data.id, {
            onSuccess: () => focusedRouter.back(),
            onError: (error) => setDeleteError(errorMessage(error)),
          });
        },
      },
    ]);
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: data.name }} />
      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <Avatar name={data.name} photoUrl={data.photoUrl} size={120} />
        <Text variant="title" align="center">
          {data.name}
        </Text>
        <Text color="textMuted" align="center">
          {data.breed || t.dog.noBreed}
        </Text>
      </View>
      <Card>
        <Row label={t.dog.size} value={enumLabel('DogSize', data.size)} />
        <Row label={t.dog.sociability} value={enumLabel('Sociability', data.sociability)} />
        <Row label={t.dog.reactivity} value={enumLabel('Reactivity', data.reactivity)} />
        <Row label={t.dog.leashHabit} value={enumLabel('LeashHabit', data.leashHabit)} />
        <Row label={t.dog.age} value={formatAge(data.birthDate) ?? t.dog.noBirthDate} />
      </Card>
      <Card>
        <Text>{data.description || t.dog.noDescription}</Text>
      </Card>
      {!mine ? (
        <View style={{ gap: spacing.md }}>
          <Button
            label={t.dog.ownedBy}
            variant="secondary"
            onPress={() => router.push({ pathname: '/users/[id]', params: { id: data.ownerId } })}
          />
          <Button
            label={t.report.action}
            variant="secondary"
            onPress={() => router.push(reportHref('dog', data.id, data.name))}
          />
        </View>
      ) : null}
      {mine ? (
        <View style={{ gap: spacing.md }}>
          <Button
            label={t.common.edit}
            onPress={() => router.push({ pathname: '/dogs/[id]/edit', params: { id: data.id } })}
          />
          <Button
            label={t.common.delete}
            variant="danger"
            loading={deleteDog.isPending}
            onPress={confirmDelete}
          />
          {deleteError ? (
            <Text color="danger" accessibilityLiveRegion="polite">
              {deleteError}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
