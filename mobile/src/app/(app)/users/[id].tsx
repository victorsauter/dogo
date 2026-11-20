import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useGuardedRouter } from '@/lib/navigation';
import { useBlockedUsers, useBlockUser, useUnblockUser } from '@/api/blocks';
import { errorMessage } from '@/api/errors';
import { usePublicUser } from '@/api/profile';
import { useSession } from '@/auth';
import { Avatar, Button, DogCard, ErrorState, LoadingState, Screen, Text } from '@/components';
import { reportHref } from '@/lib/report';
import { format, t } from '@/strings';
import { useTheme } from '@/theme';

/** Public profile of any user: name, bio, photo and dogs; block and report when it is not me. */
export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { spacing } = useTheme();
  const router = useGuardedRouter();
  const { user: me } = useSession();
  const user = usePublicUser(id);
  const blocks = useBlockedUsers();
  const block = useBlockUser();
  const unblock = useUnblockUser();
  const [actionError, setActionError] = useState<string | null>(null);

  if (user.isPending)
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  if (user.isError) {
    return (
      <Screen scroll={false}>
        <ErrorState
          error={user.error}
          notFoundTitle={t.profile.notFoundTitle}
          onRetry={() => user.refetch()}
        />
      </Screen>
    );
  }
  const { displayName, bio, photoUrl, dogs } = user.data;
  const itsMe = me?.id === id;
  const blocked = blocks.data?.some((entry) => entry.user.id === id) ?? false;
  const onError = (error: unknown) => setActionError(errorMessage(error));

  function confirmBlock() {
    setActionError(null);
    Alert.alert(
      format(t.block.confirmTitle, { name: displayName }),
      format(t.block.confirmMessage, { name: displayName }),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.block.confirm,
          style: 'destructive',
          onPress: () => block.mutate(id, { onError }),
        },
      ],
    );
  }

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
        {blocked ? (
          <Text color="textMuted" align="center">
            {t.block.blockedNote}
          </Text>
        ) : null}
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
              profileUserId={id}
              onPress={() => router.push({ pathname: '/dogs/[id]', params: { id: dog.id } })}
            />
          ))}
        </View>
      )}
      {!itsMe ? (
        <View style={{ gap: spacing.md }}>
          {blocked ? (
            <Button
              label={t.block.unblock}
              accessibilityLabel={format(t.block.unblockA11y, { name: displayName })}
              variant="secondary"
              loading={unblock.isPending}
              onPress={() => {
                setActionError(null);
                unblock.mutate(id, { onError });
              }}
            />
          ) : (
            <Button
              label={t.block.action}
              accessibilityLabel={format(t.block.actionA11y, { name: displayName })}
              variant="secondary"
              disabled={blocks.isPending}
              loading={block.isPending}
              onPress={confirmBlock}
            />
          )}
          <Button
            label={t.report.action}
            variant="secondary"
            onPress={() => router.push(reportHref('user', id, displayName))}
          />
          {actionError ? (
            <Text color="danger" accessibilityLiveRegion="polite">
              {actionError}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
