import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { Participant, WalkDetail } from '@/api/types';
import { format, plural, t } from '@/strings';
import { useTheme } from '@/theme';

import { Card } from './Card';
import { Icon } from './Icon';
import { ParticipantRow } from './ParticipantRow';
import { Text } from './Text';

export interface ParticipantsCardProps {
  walk: Pick<WalkDetail, 'acceptedDogsCount' | 'maxDogs' | 'participants' | 'pendingRegistrations'>;
  /** The signed-in user: their dog's row says « Toi ». */
  currentUserId?: string;
  organizer: boolean;
  /** The walk takes changes (not cancelled, not started): the buttons are there only then. */
  open: boolean;
  onOpenDog: (dogId: string) => void;
  onOpenUser: (userId: string) => void;
  /** Asks to remove an accepted dog (the caller confirms). */
  onRemove: (participant: Participant) => void;
  onAccept: (registrationId: string) => void;
  onDecline: (registrationId: string) => void;
  /** Registration whose acceptance is on its way. */
  acceptingId?: string;
  /** Registration whose refusal or removal is on its way. */
  decliningId?: string;
}

/** The whole participants block in one card: seats gauge, requests to validate, registered dogs. */
export function ParticipantsCard({
  walk,
  currentUserId,
  organizer,
  open,
  onOpenDog,
  onOpenUser,
  onRemove,
  onAccept,
  onDecline,
  acceptingId,
  decliningId,
}: ParticipantsCardProps) {
  const { colors, spacing } = useTheme();
  const requests = organizer ? walk.pendingRegistrations : [];
  const hasRequests = requests.length > 0;

  return (
    <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
      <SeatsGauge taken={walk.acceptedDogsCount} max={walk.maxDogs} />

      {hasRequests ? (
        <View testID="pending-requests">
          <View
            style={{
              backgroundColor: colors.primarySoft,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
            }}
          >
            <Text variant="caption" color="primary" style={{ fontWeight: '700' }}>
              {plural(t.walk.pendingCount, requests.length)}
            </Text>
          </View>
          {requests.map((request) => {
            const names = { dog: request.dog.name, owner: request.owner.displayName };
            return (
              <ParticipantRow
                key={request.registrationId}
                participant={request}
                isMine={request.owner.id === currentUserId}
                onOpenDog={onOpenDog}
                onOpenOwner={onOpenUser}
                background="primarySoft"
                trailing={
                  open ? (
                    <>
                      <RoundButton
                        icon="close"
                        label={format(t.walk.declineA11y, names)}
                        loading={decliningId === request.registrationId}
                        onPress={() => onDecline(request.registrationId)}
                      />
                      <RoundButton
                        icon="check"
                        filled
                        label={format(t.walk.acceptA11y, names)}
                        loading={acceptingId === request.registrationId}
                        onPress={() => onAccept(request.registrationId)}
                      />
                    </>
                  ) : undefined
                }
              />
            );
          })}
        </View>
      ) : null}

      {hasRequests ? (
        <View
          style={{
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
          }}
        >
          <Text variant="caption" color="textMuted" style={{ fontWeight: '700' }}>
            {t.walk.registeredTitle}
          </Text>
        </View>
      ) : null}

      {walk.participants.length === 0 ? (
        <View
          style={{
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            padding: spacing.lg,
          }}
        >
          <Text color="textMuted">{t.walk.noParticipants}</Text>
        </View>
      ) : (
        walk.participants.map((participant) => {
          const mine = participant.owner.id === currentUserId;
          return (
            <ParticipantRow
              key={participant.registrationId}
              participant={participant}
              isMine={mine}
              onOpenDog={onOpenDog}
              onOpenOwner={onOpenUser}
              onRemove={organizer && open && !mine ? () => onRemove(participant) : undefined}
              busy={decliningId === participant.registrationId}
            />
          );
        })
      )}
    </Card>
  );
}

/** « 3 chiens sur 6 », « 3 places » (or « Complet »), and a thin bar of the same ratio. */
function SeatsGauge({ taken, max }: { taken: number; max: number }) {
  const { colors, radii, spacing } = useTheme();
  const left = Math.max(max - taken, 0);
  const takenText = plural(t.walk.gaugeTaken, taken, { max });
  const leftText = left === 0 ? t.walk.full : plural(t.walk.gaugeLeft, left);
  const ratio = max > 0 ? Math.min(taken / max, 1) : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${takenText}, ${leftText}`}
      accessibilityValue={{ min: 0, max, now: Math.min(taken, max) }}
      style={{ padding: spacing.lg, gap: spacing.sm }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: spacing.md,
        }}
      >
        <Text variant="subheading" style={{ flexShrink: 1 }}>
          {takenText}
        </Text>
        <Text color={left === 0 ? 'danger' : 'textMuted'} style={{ flexShrink: 0 }}>
          {leftText}
        </Text>
      </View>
      <View
        style={{
          height: 6,
          borderRadius: radii.pill,
          backgroundColor: colors.surfaceMuted,
          overflow: 'hidden',
        }}
      >
        <View
          testID="seats-bar"
          style={{
            width: `${Math.round(ratio * 100)}%`,
            height: '100%',
            borderRadius: radii.pill,
            backgroundColor: colors.primary,
          }}
        />
      </View>
    </View>
  );
}

const ROUND_SIZE = 40;

/** Round, icon-only button: the outline refuses, the filled one accepts. */
function RoundButton({
  icon,
  label,
  filled = false,
  loading = false,
  onPress,
}: {
  icon: 'check' | 'close';
  label: string;
  filled?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: loading, busy: loading }}
      disabled={loading}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => ({
        width: ROUND_SIZE,
        height: ROUND_SIZE,
        borderRadius: ROUND_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: colors.primary,
        backgroundColor: filled ? colors.primary : colors.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={filled ? colors.onPrimary : colors.primary} />
      ) : (
        <Icon name={icon} size={16} color={filled ? 'onPrimary' : 'primary'} />
      )}
    </Pressable>
  );
}
