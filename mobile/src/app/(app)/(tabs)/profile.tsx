import { type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useGuardedRouter } from '@/lib/navigation';
import { useMyDogs } from '@/api/dogs';
import { useMyOrganizations } from '@/api/organizations';
import { useMe } from '@/api/profile';
import { useSession } from '@/auth';
import {
  Avatar,
  Banner,
  Button,
  Card,
  DogCard,
  EmptyState,
  ErrorState,
  Icon,
  ListItem,
  LoadingState,
  OrganizationCard,
  Screen,
  Text,
} from '@/components';
import { LayoutSetting } from '@/discover/LayoutSetting';
import { limits } from '@/lib/forms';
import { useRefetchOnFocus } from '@/lib/hooks';
import { format, t } from '@/strings';
import { useTheme } from '@/theme';

interface Entry {
  label: string;
  href: Href;
  danger?: boolean;
}

const organizationEntries: Entry[] = [
  { label: t.organization.find, href: '/organizations' },
  { label: t.organization.create, href: '/organizations/new' },
];

const settingsEntries: Entry[] = [
  { label: t.notifications.open, href: '/notifications' },
  { label: t.settings.blocked, href: '/blocked' },
  { label: t.settings.terms, href: '/terms' },
  { label: t.settings.privacy, href: '/privacy' },
  { label: t.settings.deleteAccount, href: '/delete-account', danger: true },
];

/** Rows with a chevron in one card: the compact way to list entry points on a small phone. */
function EntryList({ entries }: { entries: Entry[] }) {
  const router = useGuardedRouter();
  const { colors } = useTheme();
  return (
    <Card style={{ padding: 0, overflow: 'hidden', gap: 0 }}>
      {entries.map((entry, index) => (
        <View
          key={entry.label}
          style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}
        >
          <ListItem
            title={entry.label}
            danger={entry.danger}
            right={<Icon name="chevron" size={16} color="textMuted" />}
            onPress={() => router.push(entry.href)}
          />
        </View>
      ))}
    </Card>
  );
}

export default function ProfileScreen() {
  const { user, signOut } = useSession();
  const { spacing } = useTheme();
  const router = useGuardedRouter();
  const me = useMe();
  const dogs = useMyDogs();
  const organizations = useMyOrganizations();
  const [signingOut, setSigningOut] = useState(false);
  useRefetchOnFocus(organizations.refetch);
  useRefetchOnFocus(me.refetch);
  const profile = me.data ?? user;
  const name = profile?.displayName ?? '';
  // « Refusée » memberships are requests that went nowhere: they are not « mine » any more.
  const myOrganizations = (organizations.data ?? []).filter(
    ({ membership }) => membership.status !== 'Declined',
  );

  return (
    <Screen edges={['top', 'left', 'right']}>
      {profile?.status === 'Suspended' ? (
        <Banner
          title={t.settings.suspendedTitle}
          message={t.settings.suspendedMessage}
          tone="danger"
        />
      ) : null}

      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <Avatar name={name} photoUrl={profile?.photoUrl} size={72} />
        <Text variant="heading" align="center">
          {format(t.profile.greeting, { name })}
        </Text>
        <Text color="textMuted" align="center" numberOfLines={3}>
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
          {dogs.data.length >= limits.dogsMax ? (
            // The API refuses a 21st dog: explain rather than offer a button that fails.
            <Text color="textMuted" accessibilityLiveRegion="polite">
              {t.errors['dog.limit_reached']}
            </Text>
          ) : (
            <Button
              label={t.dog.add}
              variant="secondary"
              onPress={() => router.push('/dogs/new')}
            />
          )}
        </View>
      )}

      <Text variant="heading">{t.organization.mine}</Text>
      {organizations.isPending ? (
        <LoadingState />
      ) : organizations.isError ? (
        <ErrorState error={organizations.error} onRetry={() => organizations.refetch()} />
      ) : myOrganizations.length === 0 ? (
        <Text color="textMuted">{t.organization.mineEmpty}</Text>
      ) : (
        <View style={{ gap: spacing.md }}>
          {myOrganizations.map(({ organization, membership }) => (
            <OrganizationCard
              key={organization.id}
              organization={organization}
              membership={membership}
              onPress={() =>
                router.push({ pathname: '/organizations/[id]', params: { id: organization.id } })
              }
            />
          ))}
        </View>
      )}
      <EntryList entries={organizationEntries} />

      <Text variant="heading">{t.settings.title}</Text>
      <Text variant="subheading">{t.discoverLayout.title}</Text>
      <LayoutSetting />
      <EntryList entries={settingsEntries} />

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
