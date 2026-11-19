import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useGuardedRouter } from '@/lib/navigation';
import { errorMessage } from '@/api/errors';
import { useOrganization, useRemoveMembership, useRequestMembership } from '@/api/organizations';
import type { OrganizationDetail } from '@/api/types';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  ErrorState,
  ListItem,
  LoadingState,
  Screen,
  Text,
  WalkCard,
} from '@/components';
import { useRefetchOnFocus } from '@/lib/hooks';
import { enumLabel, format, plural, t } from '@/strings';
import { useTheme } from '@/theme';

/** An organisation: who runs it, its next walks, and my membership. */
export default function OrganizationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const organization = useOrganization(id);
  useRefetchOnFocus(organization.refetch);

  if (organization.isPending) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }
  if (organization.isError) {
    return (
      <Screen scroll={false}>
        <ErrorState
          error={organization.error}
          notFoundTitle={t.organization.notFoundTitle}
          onRetry={() => organization.refetch()}
        />
      </Screen>
    );
  }
  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: t.organization.detailTitle }} />
      <OrganizationContent organization={organization.data} />
    </Screen>
  );
}

function OrganizationContent({ organization }: { organization: OrganizationDetail }) {
  const router = useGuardedRouter();
  const { spacing } = useTheme();
  const request = useRequestMembership(organization.id);
  const remove = useRemoveMembership(organization.id);
  const [error, setError] = useState<string | null>(null);

  const membership = organization.myMembership;
  const approved = organization.status === 'Approved';
  const isMember = membership?.status === 'Accepted';
  const requestPending = membership?.status === 'Pending';
  const requestDeclined = membership?.status === 'Declined';
  const staff = isMember && (membership.role === 'Owner' || membership.role === 'Educator');
  const owner = isMember && membership.role === 'Owner';
  const onError = (e: unknown) => setError(errorMessage(e));

  function confirmWithdraw() {
    setError(null);
    Alert.alert(t.organization.withdrawTitle, t.organization.withdrawMessage, [
      { text: t.organization.keep, style: 'cancel' },
      {
        text: t.organization.withdraw,
        style: 'destructive',
        onPress: () => remove.mutate(membership!.id, { onError }),
      },
    ]);
  }

  function confirmLeave() {
    setError(null);
    Alert.alert(
      format(t.organization.leaveTitle, { name: organization.name }),
      t.organization.leaveMessage,
      [
        { text: t.organization.keep, style: 'cancel' },
        {
          text: t.organization.leaveConfirm,
          style: 'destructive',
          onPress: () => remove.mutate(membership!.id, { onError }),
        },
      ],
    );
  }

  return (
    <>
      {organization.status !== 'Approved' ? (
        <Banner
          tone={organization.status === 'Pending' ? 'warning' : 'danger'}
          message={t.organization.statusBanner[organization.status]}
        />
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <Text variant="title">{organization.name}</Text>
        <Text color="textMuted">
          {[organization.city, plural(t.organization.memberCount, organization.memberCount)]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      <Card>
        <Text>{organization.description || t.organization.noDescription}</Text>
      </Card>

      <Text variant="heading">{t.organization.educators}</Text>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {organization.educators.map(({ user, role }) => (
          <ListItem
            key={user.id}
            title={user.displayName}
            subtitle={enumLabel('MembershipRole', role)}
            left={<Avatar name={user.displayName} photoUrl={user.photoUrl} />}
            accessibilityLabel={format(t.organization.educatorA11y, {
              name: user.displayName,
              role: enumLabel('MembershipRole', role),
            })}
            onPress={() => router.push({ pathname: '/users/[id]', params: { id: user.id } })}
          />
        ))}
      </Card>

      <Card>
        {isMember ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ flex: 1 }}>{t.organization.joined}</Text>
              <Badge tone="primary" label={enumLabel('MembershipRole', membership.role)} />
            </View>
            {staff ? (
              <Button
                label={t.organization.openMembers}
                onPress={() =>
                  router.push({
                    pathname: '/organizations/[id]/members',
                    params: { id: organization.id },
                  })
                }
              />
            ) : null}
            {owner ? (
              <Button
                label={t.organization.edit}
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/organizations/[id]/edit',
                    params: { id: organization.id },
                  })
                }
              />
            ) : null}
            <Button
              label={t.organization.leave}
              variant="secondary"
              loading={remove.isPending}
              onPress={confirmLeave}
            />
          </>
        ) : requestPending ? (
          <>
            <Badge tone="info" icon="clock" label={t.organization.requested} />
            <Text color="textMuted">{t.organization.requestedHint}</Text>
            <Button
              label={t.organization.withdraw}
              variant="secondary"
              loading={remove.isPending}
              onPress={confirmWithdraw}
            />
          </>
        ) : approved ? (
          <>
            {requestDeclined ? <Text color="textMuted">{t.organization.declinedHint}</Text> : null}
            <Button
              label={t.organization.join}
              loading={request.isPending}
              onPress={() => {
                setError(null);
                request.mutate(undefined, { onError });
              }}
            />
          </>
        ) : null}
        {error ? (
          <Text color="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </Card>

      {approved ? (
        <View style={{ gap: spacing.md }}>
          <Text variant="heading">{t.organization.upcomingWalks}</Text>
          {organization.upcomingWalks.length === 0 ? (
            <Text color="textMuted">{t.organization.noUpcomingWalks}</Text>
          ) : (
            organization.upcomingWalks.map((walk) => (
              <WalkCard
                key={walk.id}
                walk={walk}
                onPress={() => router.push({ pathname: '/walks/[id]', params: { id: walk.id } })}
              />
            ))
          )}
        </View>
      ) : null}
    </>
  );
}
