import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { usePublicUser } from '@/api/profile';
import { Avatar, DogCard, ErrorState, LoadingState, Screen, Text } from '@/components';
import { format, t } from '@/strings';
import { useTheme } from '@/theme';

/** Public profile of any user: name, bio, photo and dogs (read-only). */
export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { spacing } = useTheme();
  const router = useRouter();
  const user = usePublicUser(id);

  if (user.isPending)
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  if (user.isError) {
    return (
      <Screen scroll={false}>
        <ErrorState error={user.error} onRetry={() => user.refetch()} />
      </Screen>
    );
  }
  const { displayName, bio, photoUrl, dogs } = user.data;
  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <Avatar name={displayName} photoUrl={photoUrl} size={96} />
        <Text variant="heading" align="center">
          {displayName}
        </Text>
        <Text color="textMuted" align="center">
          {bio || t.profile.noBio}
        </Text>
      </View>
      <Text variant="heading">{format(t.profile.dogsOf, { name: displayName })}</Text>
      {dogs.length === 0 ? (
        <Text color="textMuted">{t.profile.noDogsPublic}</Text>
      ) : (
        <View style={{ gap: spacing.md }}>
          {dogs.map((dog) => (
            <DogCard
              key={dog.id}
              dog={dog}
              onPress={() => router.push({ pathname: '/dogs/[id]', params: { id: dog.id } })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
