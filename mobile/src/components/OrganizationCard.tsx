import { View } from 'react-native';

import type { MyMembership, OrganizationSummary } from '@/api/types';
import { enumLabel, plural, t } from '@/strings';
import { useLineLimit, useTheme } from '@/theme';

import { Badge } from './Badge';
import { Card } from './Card';
import { Text } from './Text';

export interface OrganizationCardProps {
  organization: OrganizationSummary;
  /** My membership: shows my role, and « Demande envoyée » while pending. */
  membership?: MyMembership;
  onPress: () => void;
}

/** An organisation in a list: name, city, member count, my role and what is pending. */
export function OrganizationCard({ organization, membership, onPress }: OrganizationCardProps) {
  const { spacing } = useTheme();
  const titleLines = useLineLimit(2);
  const details = [organization.city, plural(t.organization.memberCount, organization.memberCount)]
    .filter(Boolean)
    .join(' · ');
  const requestPending = membership?.status === 'Pending';
  const organizationStatus = organization.status !== 'Approved' ? organization.status : null;
  const role =
    membership?.status === 'Accepted' ? enumLabel('MembershipRole', membership.role) : null;

  const badges = [
    role ? <Badge key="role" tone="primary" label={role} /> : null,
    organizationStatus ? (
      <Badge
        key="status"
        tone={organizationStatus === 'Pending' ? 'info' : 'danger'}
        icon={organizationStatus === 'Pending' ? 'clock' : undefined}
        label={
          organizationStatus === 'Pending'
            ? t.organization.pendingBadge
            : enumLabel('OrganizationStatus', organizationStatus)
        }
      />
    ) : null,
    requestPending ? (
      <Badge key="request" tone="info" icon="clock" label={t.organization.requestBadge} />
    ) : null,
  ].filter(Boolean);

  const summary = [
    organization.name,
    details,
    role,
    organizationStatus === 'Pending'
      ? t.organization.pendingBadge
      : organizationStatus
        ? enumLabel('OrganizationStatus', organizationStatus)
        : null,
    requestPending ? t.organization.requestBadge : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Card onPress={onPress} accessibilityLabel={summary}>
      <Text variant="subheading" numberOfLines={titleLines}>
        {organization.name}
      </Text>
      <Text variant="caption" color="textMuted">
        {details}
      </Text>
      {badges.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>{badges}</View>
      ) : null}
    </Card>
  );
}
