import { Stack, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, View } from 'react-native';

import { useGuardedRouter } from '@/lib/navigation';
import { ApiError, errorMessage } from '@/api/errors';
import {
  isMembersListCapped,
  useChangeRole,
  useDecideMembership,
  useOrganization,
  useOrganizationMembers,
  useRemoveMembership,
} from '@/api/organizations';
import type { Membership } from '@/api/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  Text,
} from '@/components';
import { useRefetchOnFocus } from '@/lib/hooks';
import { enumLabel, format, t } from '@/strings';
import { useTheme } from '@/theme';

function MemberCard({
  member,
  onOpenUser,
  children,
}: {
  member: Membership;
  onOpenUser: (userId: string) => void;
  children?: ReactNode;
}) {
  const { spacing } = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar name={member.user.displayName} photoUrl={member.user.photoUrl} />
        <Text
          variant="subheading"
          style={{ flex: 1 }}
          accessibilityRole="button"
          accessibilityLabel={format(t.walk.organizerA11y, { name: member.user.displayName })}
          onPress={() => onOpenUser(member.user.id)}
        >
          {member.user.displayName}
        </Text>
        {member.status === 'Accepted' ? (
          <Badge
            tone={member.role === 'Member' ? 'neutral' : 'primary'}
            label={enumLabel('MembershipRole', member.role)}
          />
        ) : null}
      </View>
      {children}
    </Card>
  );
}

/**
 * Members and requests, for the owner and the educators (the API answers 403
 * to anyone else). The owner also changes roles; educators only handle
 * requests and remove simple members.
 */
export default function MembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useGuardedRouter();
  const { spacing } = useTheme();
  const organization = useOrganization(id);
  const members = useOrganizationMembers(id);
  useRefetchOnFocus(members.refetch);
  const decide = useDecideMembership(id);
  const remove = useRemoveMembership(id);
  const changeRole = useChangeRole(id);
  const [error, setError] = useState<string | null>(null);
  const onError = (e: unknown) => setError(errorMessage(e));

  if (organization.isPending || members.isPending) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }
  if (members.isError) {
    const forbidden = members.error instanceof ApiError && members.error.status === 403;
    return (
      <Screen scroll={false}>
        {forbidden ? (
          <EmptyState icon="info" title={t.organization.membersForbidden} />
        ) : (
          <ErrorState error={members.error} onRetry={() => members.refetch()} />
        )}
      </Screen>
    );
  }
  if (organization.isError) {
    return (
      <Screen scroll={false}>
        <ErrorState error={organization.error} onRetry={() => organization.refetch()} />
      </Screen>
    );
  }

  const mine = organization.data.myMembership;
  const owner = mine?.status === 'Accepted' && mine.role === 'Owner';

  function confirmRemove(member: Membership) {
    setError(null);
    Alert.alert(
      format(t.organization.removeTitle, { name: member.user.displayName }),
      t.organization.removeMessage,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.organization.remove,
          style: 'destructive',
          onPress: () => remove.mutate(member.id, { onError }),
        },
      ],
    );
  }

  const openUser = (userId: string) =>
    router.push({ pathname: '/users/[id]', params: { id: userId } });

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: t.organization.membersTitle }} />

      <Text variant="heading">{t.organization.requests}</Text>
      {members.data.requests.length === 0 ? (
        <Text color="textMuted">{t.organization.noRequests}</Text>
      ) : (
        members.data.requests.map((request) => {
          const name = request.user.displayName;
          return (
            <MemberCard key={request.id} member={request} onOpenUser={openUser}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t.organization.accept}
                    accessibilityLabel={format(t.organization.acceptA11y, { name })}
                    loading={
                      decide.isPending &&
                      decide.variables?.membershipId === request.id &&
                      decide.variables.accept
                    }
                    onPress={() => {
                      setError(null);
                      decide.mutate({ membershipId: request.id, accept: true }, { onError });
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t.organization.decline}
                    accessibilityLabel={format(t.organization.declineA11y, { name })}
                    variant="secondary"
                    loading={
                      decide.isPending &&
                      decide.variables?.membershipId === request.id &&
                      !decide.variables.accept
                    }
                    onPress={() => {
                      setError(null);
                      decide.mutate({ membershipId: request.id, accept: false }, { onError });
                    }}
                  />
                </View>
              </View>
            </MemberCard>
          );
        })
      )}

      {isMembersListCapped(members.data.requests.length) ? (
        <Text color="textMuted" accessibilityLiveRegion="polite">
          {format(t.organization.requestsPartial, { count: members.data.requests.length })}
        </Text>
      ) : null}

      <Text variant="heading">{t.organization.members}</Text>
      {members.data.members.length === 0 ? (
        <Text color="textMuted">{t.organization.noMembers}</Text>
      ) : (
        members.data.members.map((member) => {
          const name = member.user.displayName;
          const itsMe = member.id === mine?.id;
          // The owner removes educators and members; educators remove members; nobody removes the owner or themselves.
          const canRemove =
            !itsMe && member.role !== 'Owner' && (owner || member.role === 'Member');
          const canChangeRole = owner && !itsMe && member.role !== 'Owner';
          if (!canRemove && !canChangeRole)
            return <MemberCard key={member.id} member={member} onOpenUser={openUser} />;
          return (
            <MemberCard key={member.id} member={member} onOpenUser={openUser}>
              {canChangeRole ? (
                <Button
                  label={
                    member.role === 'Educator' ? t.organization.demote : t.organization.promote
                  }
                  accessibilityLabel={format(
                    member.role === 'Educator'
                      ? t.organization.demoteA11y
                      : t.organization.promoteA11y,
                    { name },
                  )}
                  variant="secondary"
                  loading={changeRole.isPending && changeRole.variables?.membershipId === member.id}
                  onPress={() => {
                    setError(null);
                    changeRole.mutate(
                      {
                        membershipId: member.id,
                        role: member.role === 'Educator' ? 'Member' : 'Educator',
                      },
                      { onError },
                    );
                  }}
                />
              ) : null}
              {canRemove ? (
                <Button
                  label={t.organization.remove}
                  accessibilityLabel={format(t.organization.removeA11y, { name })}
                  variant="secondary"
                  loading={remove.isPending && remove.variables === member.id}
                  onPress={() => confirmRemove(member)}
                />
              ) : null}
            </MemberCard>
          );
        })
      )}

      {isMembersListCapped(members.data.members.length) ? (
        <Text color="textMuted" accessibilityLiveRegion="polite">
          {format(t.organization.membersPartial, { count: members.data.members.length })}
        </Text>
      ) : null}

      {error ? (
        <Text color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}
