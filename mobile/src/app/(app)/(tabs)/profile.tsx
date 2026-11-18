import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useMyDogs } from '@/api/dogs';
import { useMe } from '@/api/profile';
import { useSession } from '@/auth';
import {
  Avatar,
  Button,
  DogCard,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  Text,
} from '@/components';
import { format, t } from '@/strings';
import { useTheme } from '@/theme';

export default function ProfileScreen() {
  const { user, signOut } = useSession();
  const { spacing } = useTheme();
  const router = useRouter();
  const me = useMe();
  const dogs = useMyDogs();
  const [signingOut, setSigningOut] = useState(false);
  const profile = me.data ?? user;
  const name = profile?.displayName ?? '';

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <Avatar name={name} photoUrl={profile?.photoUrl} size={88} />
        <Text variant="heading" align="center">
          {format(t.profile.greeting, { name })}
        </Text>
        <Text color="textMuted" align="center">
          {profile?.bio || t.profile.noBio}
        </Text>
        <Button
          label={t.profile.editButton}
          variant="secondary"
          onPress={() => router.push('/edit-profile')}
        />
      </View>

      <Text variant="heading">{t.profile.myDogs}</Text>
      {dogs.isPending ? (
        <LoadingState />
      ) : dogs.isError ? (
        <ErrorState error={dogs.error} onRetry={() => dogs.refetch()} />
      ) : dogs.data.length === 0 ? (
        <EmptyState
          title={t.dog.myDogsEmptyTitle}
          message={t.dog.myDogsEmptyMessage}
          action={{ label: t.dog.add, onPress: () => router.push('/dogs/new') }}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {dogs.data.map((dog) => (
            <DogCard
              key={dog.id}
              dog={dog}
              onPress={() => router.push({ pathname: '/dogs/[id]', params: { id: dog.id } })}
            />
          ))}
          <Button label={t.dog.add} variant="secondary" onPress={() => router.push('/dogs/new')} />
        </View>
      )}

      <Button
        label={t.auth.signOut}
        variant="danger"
        loading={signingOut}
        onPress={async () => {
          setSigningOut(true);
          await signOut();
        }}
      />
    </Screen>
  );
}
