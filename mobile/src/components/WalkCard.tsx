import { View } from 'react-native';

import type { GeoPoint, MyRegistration, WalkSummary } from '@/api/types';
import { formatDuration, formatWalkStart } from '@/lib/dates';
import { distanceMeters, formatDistance } from '@/lib/geo';
import { enumLabel, format, t } from '@/strings';
import { useTheme } from '@/theme';

import { Badge } from './Badge';
import { Card } from './Card';
import { Text } from './Text';

export interface WalkCardProps {
  walk: WalkSummary;
  onPress?: () => void;
  /** Distance is measured from here when known (the user's position), else the API's. */
  origin?: GeoPoint | null;
  now?: Date;
  /** Highlighted (the walk whose pin was tapped on the map). */
  selected?: boolean;
  /** Title, time, distance and places only (a card over a map); the rest stays in the label. */
  compact?: boolean;
}

/** « Complet » when every place is taken (only accepted dogs count, spec §4.3). */
export function isWalkFull(walk: Pick<WalkSummary, 'acceptedDogsCount' | 'maxDogs'>): boolean {
  return walk.acceptedDogsCount >= walk.maxDogs;
}

/** My status on a walk: accepted wins over pending; `null` when I am not registered. */
export function myRegistrationState(
  registrations: MyRegistration[] | undefined,
): 'registered' | 'pending' | null {
  if (!registrations?.length) return null;
  if (registrations.some((r) => r.status === 'Accepted')) return 'registered';
  if (registrations.some((r) => r.status === 'Pending')) return 'pending';
  return null;
}

export function sizesLabel(sizes: WalkSummary['allowedSizes']): string {
  return sizes.map((size) => enumLabel('DogSize', size)).join(', ');
}

/**
 * A walk in a list: title, day and time, distance, places, sizes, leash rule
 * and access. Professional walks get an accent border and the organisation's
 * name; walks with a participant I blocked get a discreet warning.
 */
export function WalkCard({
  walk,
  onPress,
  origin,
  now = new Date(),
  selected = false,
  compact = false,
}: WalkCardProps) {
  const { colors, spacing } = useTheme();
  const full = isWalkFull(walk);
  const cancelled = walk.status === 'Cancelled';
  const registration = myRegistrationState(walk.myRegistrations);
  const distance = origin
    ? distanceMeters(origin, walk.location)
    : (walk.distanceMeters ?? undefined);
  const when = formatWalkStart(walk.startsAt, now);
  const duration = formatDuration(walk.durationMinutes);
  const places = format(t.walk.places, { taken: walk.acceptedDogsCount, max: walk.maxDogs });
  const where =
    distance !== undefined
      ? `${format(t.walk.distance, { distance: formatDistance(distance) })} · ${walk.locationLabel}`
      : walk.locationLabel;

  const summary = [
    selected ? t.walk.selected : null,
    walk.title,
    walk.isProfessional ? t.walk.professional : null,
    walk.organization?.name ?? null,
    cancelled ? t.walk.cancelled : null,
    registration === 'pending' ? t.walk.pending : null,
    registration === 'registered' ? t.walk.registered : null,
    `${when}, ${duration}`,
    where,
    full
      ? t.walk.full
      : format(t.walk.placesA11y, { taken: walk.acceptedDogsCount, max: walk.maxDogs }),
    sizesLabel(walk.allowedSizes),
    enumLabel('LeashRule', walk.leashRule),
    walk.access === 'Approval' ? t.walk.approval : null,
    walk.repeatsWeekly ? t.walk.weekly : null,
    walk.hasBlockedParticipant ? t.walk.blockedParticipantA11y : null,
  ]
    .filter(Boolean)
    .join(', ');

  const topBadges = [
    selected ? <Badge key="selected" tone="primary" icon="pin" label={t.walk.selected} /> : null,
    walk.isProfessional ? (
      <Badge
        key="pro"
        tone="accent"
        label={
          walk.organization
            ? `${t.walk.professional} · ${walk.organization.name}`
            : t.walk.professional
        }
      />
    ) : null,
    cancelled ? <Badge key="cancelled" tone="danger" label={t.walk.cancelled} /> : null,
    registration === 'pending' ? (
      <Badge key="pending" tone="info" icon="clock" label={t.walk.pending} />
    ) : null,
    registration === 'registered' ? (
      <Badge key="registered" tone="primary" label={t.walk.registered} />
    ) : null,
    walk.hasBlockedParticipant ? (
      <Badge
        key="blocked"
        tone="warning"
        icon="warning"
        label={t.walk.blockedParticipant}
        accessibilityLabel={t.walk.blockedParticipantA11y}
      />
    ) : null,
  ].filter(Boolean);

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={summary}
      style={[
        walk.isProfessional && { borderColor: colors.accent, borderLeftWidth: 6 },
        cancelled && { opacity: 0.75 },
        selected && { borderColor: colors.primary, borderWidth: 3 },
      ]}
    >
      {topBadges.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>{topBadges}</View>
      ) : null}
      <Text
        variant="subheading"
        numberOfLines={2}
        style={cancelled ? { textDecorationLine: 'line-through' } : undefined}
      >
        {walk.title}
      </Text>
      <Text color="textMuted">{`${when} · ${duration}`}</Text>
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {where}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        <Badge tone={full ? 'danger' : 'primary'} label={full ? t.walk.full : places} />
        {compact ? null : (
          <>
            <Badge label={sizesLabel(walk.allowedSizes)} />
            <Badge label={enumLabel('LeashRule', walk.leashRule)} />
            {walk.access === 'Approval' ? <Badge tone="info" label={t.walk.approval} /> : null}
            {walk.repeatsWeekly ? <Badge tone="info" icon="repeat" label={t.walk.weekly} /> : null}
          </>
        )}
      </View>
    </Card>
  );
}
