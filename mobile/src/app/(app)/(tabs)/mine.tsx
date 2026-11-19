import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { useGuardedRouter } from '@/lib/navigation';
import type { MyWalksPeriod, MyWalksRole } from '@/api/enums';
import { useMyWalks } from '@/api/walks';
import {
  ChoiceGroup,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  Text,
  WalkCard,
} from '@/components';
import { t } from '@/strings';
import { useTheme } from '@/theme';

const roleOptions: { value: MyWalksRole; label: string }[] = [
  { value: 'Organizer', label: t.myWalks.organized },
  { value: 'Participant', label: t.myWalks.joined },
];
const whenOptions: { value: MyWalksPeriod; label: string }[] = [
  { value: 'Upcoming', label: t.myWalks.upcoming },
  { value: 'Past', label: t.myWalks.past },
];

/** « Mes balades »: walks I organize or joined, upcoming or past (`GET /me/walks`). */
export default function MyWalksScreen() {
  const router = useGuardedRouter();
  const { colors, spacing } = useTheme();
  const [role, setRole] = useState<MyWalksRole>('Organizer');
  const [when, setWhen] = useState<MyWalksPeriod>('Upcoming');
  const [refreshing, setRefreshing] = useState(false);
  const walks = useMyWalks(role, when);

  async function refresh() {
    setRefreshing(true);
    try {
      await walks.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  function empty() {
    if (when === 'Past') {
      return (
        <EmptyState
          icon="paw"
          title={t.myWalks.emptyPastTitle}
          message={t.myWalks.emptyPastMessage}
        />
      );
    }
    return role === 'Organizer' ? (
      <EmptyState
        icon="paw"
        title={t.myWalks.emptyOrganizedTitle}
        message={t.myWalks.emptyOrganizedMessage}
        action={{ label: t.myWalks.createWalk, onPress: () => router.push('/walks/new') }}
      />
    ) : (
      <EmptyState
        icon="map"
        title={t.myWalks.emptyJoinedTitle}
        message={t.myWalks.emptyJoinedMessage}
        action={{ label: t.myWalks.findWalk, onPress: () => router.navigate('/') }}
      />
    );
  }

  return (
    <Screen scroll={false} padded={false} edges={['top', 'left', 'right']}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm }}>
        <Text variant="title">{t.myWalks.title}</Text>
        <ChoiceGroup
          accessibilityLabel={t.myWalks.role}
          options={roleOptions}
          value={role}
          onChange={setRole}
        />
        <ChoiceGroup
          accessibilityLabel={t.myWalks.when}
          options={whenOptions}
          value={when}
          onChange={setWhen}
        />
      </View>
      {walks.isPending ? (
        <LoadingState />
      ) : walks.isError ? (
        <ErrorState error={walks.error} onRetry={() => walks.refetch()} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={walks.data}
          keyExtractor={(walk) => walk.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
          renderItem={({ item }) => (
            <WalkCard
              walk={item}
              onPress={() => router.push({ pathname: '/walks/[id]', params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={empty()}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      )}
    </Screen>
  );
}
