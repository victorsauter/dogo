import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { useBlockedUsers, useUnblockUser } from '@/api/blocks';
import { errorMessage } from '@/api/errors';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  Text,
} from '@/components';
import { format, t } from '@/strings';
import { useTheme } from '@/theme';

/** « Personnes bloquées »: the people I blocked, each with « Débloquer ». */
export default function BlockedUsersScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const blocked = useBlockedUsers();
  const unblock = useUnblockUser();
  const [error, setError] = useState<string | null>(null);

  if (blocked.isPending) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }
  if (blocked.isError) {
    return (
      <Screen scroll={false}>
        <ErrorState error={blocked.error} onRetry={() => blocked.refetch()} />
      </Screen>
    );
  }
  return (
    <Screen scroll={false} edges={['left', 'right', 'bottom']}>
      <FlatList
        data={blocked.data}
        keyExtractor={({ user }) => user.id}
        contentContainerStyle={{ gap: spacing.md, flexGrow: 1 }}
        ListHeaderComponent={
          blocked.data.length > 0 ? (
            <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
              <Text color="textMuted">{t.block.listIntro}</Text>
              {error ? (
                <Text color="danger" accessibilityLiveRegion="polite">
                  {error}
                </Text>
              ) : null}
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          <EmptyState icon="info" title={t.block.emptyTitle} message={t.block.emptyMessage} />
        }
        renderItem={({ item }) => (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Avatar name={item.user.displayName} photoUrl={item.user.photoUrl} />
              <Text
                variant="subheading"
                style={{ flex: 1 }}
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/users/[id]', params: { id: item.user.id } })
                }
              >
                {item.user.displayName}
              </Text>
            </View>
            <Button
              label={t.block.unblock}
              accessibilityLabel={format(t.block.unblockA11y, { name: item.user.displayName })}
              variant="secondary"
              loading={unblock.isPending && unblock.variables === item.user.id}
              onPress={() => {
                setError(null);
                unblock.mutate(item.user.id, { onError: (e) => setError(errorMessage(e)) });
              }}
            />
          </Card>
        )}
      />
    </Screen>
  );
}
