import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, RefreshControl, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { errorMessage } from '@/api/errors';
import type { Participant, WalkDetail } from '@/api/types';
import {
  useAcceptRegistration,
  useCancelWalk,
  useDeclineRegistration,
  useStopSeries,
  useWalk,
} from '@/api/walks';
import { useSession } from '@/auth';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  ErrorState,
  isWalkFull,
  ListItem,
  LoadingState,
  ParticipantCard,
  Screen,
  sizesLabel,
  Text,
  WalkPin,
  WalkRegistrationPanel,
} from '@/components';
import { formatDuration, formatWalkStart, walkTiming } from '@/lib/dates';
import { regionAround } from '@/lib/geo';
import { reportHref } from '@/lib/report';
import { canUseThread } from '@/lib/thread';
import { enumLabel, format, t } from '@/strings';
import { useTheme } from '@/theme';

/** Opens the meeting point in the device's maps app. */
function openInMaps(walk: WalkDetail) {
  const { latitude, longitude } = walk.location;
  const label = encodeURIComponent(walk.locationLabel);
  const url =
    Platform.OS === 'ios'
      ? `https://maps.apple.com/?ll=${latitude},${longitude}&q=${label}`
      : `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`;
  void Linking.openURL(url);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View accessible accessibilityLabel={`${label} : ${value}`}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text>{value}</Text>
    </View>
  );
}

/** Everything about a walk, registration of my dogs, and the organizer's tools. */
export default function WalkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const walk = useWalk(id);
  const { colors } = useTheme();
  // Pulled by the person only: background refetches do not show the spinner.
  const [refreshing, setRefreshing] = useState(false);

  if (walk.isPending) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }
  if (walk.isError) {
    return (
      <Screen scroll={false}>
        <ErrorState error={walk.error} onRetry={() => walk.refetch()} />
      </Screen>
    );
  }
  return (
    <Screen
      testID="walk-detail"
      edges={['left', 'right', 'bottom']}
      refreshControl={
        // A request accepted, a new participant or a change by the organizer
        // happen elsewhere: pulling the page shows them.
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            try {
              await walk.refetch();
            } finally {
              setRefreshing(false);
            }
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <Stack.Screen options={{ title: t.walk.detailTitle }} />
      <WalkDetailContent walk={walk.data} />
    </Screen>
  );
}

function WalkDetailContent({ walk }: { walk: WalkDetail }) {
  const router = useRouter();
  const { user } = useSession();
  const { radii, spacing } = useTheme();
  const accept = useAcceptRegistration(walk.id);
  const decline = useDeclineRegistration(walk.id);
  const cancelWalk = useCancelWalk(walk.id);
  const stopSeries = useStopSeries(walk.id);
  const [organizerError, setOrganizerError] = useState<string | null>(null);

  const cancelled = walk.status === 'Cancelled';
  const timing = walkTiming(walk);
  const open = !cancelled && timing === 'upcoming';
  const full = isWalkFull(walk);
  const organizer = walk.isOrganizer;

  const openDog = (dogId: string) => router.push({ pathname: '/dogs/[id]', params: { id: dogId } });
  const openUser = (userId: string) =>
    router.push({ pathname: '/users/[id]', params: { id: userId } });
  const openOrganization = (organizationId: string) =>
    router.push({ pathname: '/organizations/[id]', params: { id: organizationId } });

  const onError = (error: unknown) => setOrganizerError(errorMessage(error));

  function confirmRemove(participant: Participant) {
    setOrganizerError(null);
    Alert.alert(
      format(t.walk.removeTitle, { dog: participant.dog.name }),
      format(t.walk.removeMessage, { owner: participant.owner.displayName }),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.walk.remove,
          style: 'destructive',
          onPress: () => decline.mutate(participant.registrationId, { onError }),
        },
      ],
    );
  }

  function confirmCancelWalk() {
    setOrganizerError(null);
    Alert.alert(t.walk.cancelWalkTitle, t.walk.cancelWalkMessage, [
      { text: t.walk.keep, style: 'cancel' },
      {
        text: t.walk.cancelWalkConfirm,
        style: 'destructive',
        onPress: () => cancelWalk.mutate(undefined, { onError }),
      },
    ]);
  }

  function confirmStopSeries() {
    setOrganizerError(null);
    Alert.alert(t.walk.stopSeriesTitle, t.walk.stopSeriesMessage, [
      { text: t.walk.keep, style: 'cancel' },
      {
        text: t.walk.stopSeriesConfirm,
        style: 'destructive',
        onPress: () => stopSeries.mutate(undefined, { onError }),
      },
    ]);
  }

  return (
    <>
      {cancelled ? <Banner message={t.walk.cancelledBanner} /> : null}
      {!cancelled && timing === 'past' ? <Banner message={t.walk.pastBanner} /> : null}
      {!cancelled && timing === 'started' ? <Banner message={t.walk.startedBanner} /> : null}
      {walk.hasBlockedParticipant ? (
        <Banner tone="warning" message={t.walk.blockedWarning} />
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {walk.isProfessional ? <Badge tone="pro" label={t.walk.professional} /> : null}
          {walk.access === 'Approval' ? <Badge tone="info" label={t.walk.approval} /> : null}
          {full ? <Badge tone="danger" label={t.walk.full} /> : null}
          {walk.repeatsWeekly ? <Badge tone="info" icon="repeat" label={t.walk.weekly} /> : null}
          {walk.hasBlockedParticipant ? (
            <Badge
              tone="warning"
              icon="warning"
              label={t.walk.blockedParticipant}
              accessibilityLabel={t.walk.blockedParticipantA11y}
            />
          ) : null}
        </View>
        <Text variant="title">{walk.title}</Text>
        <Text color="textMuted">
          {`${formatWalkStart(walk.startsAt)} · ${formatDuration(walk.durationMinutes)}`}
        </Text>
      </View>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {walk.organizer ? (
          <ListItem
            title={walk.organizer.displayName}
            subtitle={t.walk.organizer}
            left={<Avatar name={walk.organizer.displayName} photoUrl={walk.organizer.photoUrl} />}
            accessibilityLabel={format(t.walk.organizerA11y, { name: walk.organizer.displayName })}
            onPress={() => openUser(walk.organizer!.id)}
          />
        ) : (
          <ListItem
            title={t.walk.organizerDeleted}
            subtitle={t.walk.organizer}
            left={<Avatar name="" />}
          />
        )}
        {walk.organization ? (
          <ListItem
            title={walk.organization.name}
            subtitle={t.walk.organizationOf}
            accessibilityLabel={format(t.walk.organizationA11y, { name: walk.organization.name })}
            onPress={() => openOrganization(walk.organization!.id)}
          />
        ) : null}
      </Card>

      <Card>
        <Row
          label={t.walk.participants}
          value={
            full
              ? t.walk.full
              : format(t.walk.places, { taken: walk.acceptedDogsCount, max: walk.maxDogs })
          }
        />
        <Row label={t.walk.sizes} value={sizesLabel(walk.allowedSizes)} />
        <Row label={t.walk.leash} value={enumLabel('LeashRule', walk.leashRule)} />
        <Row label={t.walk.access} value={enumLabel('WalkAccess', walk.access)} />
        <Row label={t.walk.duration} value={formatDuration(walk.durationMinutes)} />
      </Card>

      <Card>
        <Text variant="heading">{t.walk.meetingPoint}</Text>
        <View style={{ height: 180, borderRadius: radii.md, overflow: 'hidden' }}>
          <MapView
            testID="walk-map"
            style={{ flex: 1 }}
            initialRegion={regionAround(walk.location, 0.01)}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
          >
            <Marker coordinate={walk.location} title={walk.locationLabel}>
              <WalkPin professional={walk.isProfessional} />
            </Marker>
          </MapView>
        </View>
        <Text>{walk.locationLabel}</Text>
        <Button
          label={Platform.OS === 'ios' ? t.walk.openInMaps : t.walk.openInMapsAndroid}
          variant="secondary"
          onPress={() => openInMaps(walk)}
        />
      </Card>

      <Card>
        <Text variant="heading">{t.walk.description}</Text>
        <Text>{walk.description || t.walk.noDescription}</Text>
        <Text variant="heading">{t.walk.rules}</Text>
        <Text>{walk.rules || t.walk.noRules}</Text>
      </Card>

      <Card>
        <Text variant="heading">{t.thread.title}</Text>
        {canUseThread(walk) ? (
          <>
            <Text color="textMuted">{t.thread.entryHint}</Text>
            <Button
              label={t.thread.open}
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/walks/[id]/messages', params: { id: walk.id } })
              }
            />
          </>
        ) : (
          <Text color="textMuted">{t.thread.hiddenReason}</Text>
        )}
      </Card>

      <Text variant="heading">{t.walk.participants}</Text>
      {walk.participants.length === 0 ? (
        <Text color="textMuted">{t.walk.noParticipants}</Text>
      ) : (
        <View style={{ gap: spacing.md }}>
          {walk.participants.map((participant) => (
            <ParticipantCard
              key={participant.registrationId}
              participant={participant}
              onOpenDog={openDog}
              onOpenOwner={openUser}
              actions={
                organizer && open && participant.owner.id !== user?.id ? (
                  <Button
                    label={t.walk.remove}
                    accessibilityLabel={format(t.walk.removeA11y, { dog: participant.dog.name })}
                    variant="secondary"
                    loading={decline.isPending && decline.variables === participant.registrationId}
                    onPress={() => confirmRemove(participant)}
                  />
                ) : undefined
              }
            />
          ))}
        </View>
      )}

      {organizer ? (
        <View style={{ gap: spacing.md }}>
          <Text variant="heading">{t.walk.pendingRequests}</Text>
          {walk.pendingRegistrations.length === 0 ? (
            <Text color="textMuted">{t.walk.noPendingRequests}</Text>
          ) : (
            walk.pendingRegistrations.map((request) => {
              const names = { dog: request.dog.name, owner: request.owner.displayName };
              return (
                <ParticipantCard
                  key={request.registrationId}
                  participant={request}
                  onOpenDog={openDog}
                  onOpenOwner={openUser}
                  actions={
                    open ? (
                      <>
                        <View style={{ flex: 1 }}>
                          <Button
                            label={t.walk.accept}
                            accessibilityLabel={format(t.walk.acceptA11y, names)}
                            loading={
                              accept.isPending && accept.variables === request.registrationId
                            }
                            onPress={() => {
                              setOrganizerError(null);
                              accept.mutate(request.registrationId, { onError });
                            }}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Button
                            label={t.walk.decline}
                            accessibilityLabel={format(t.walk.declineA11y, names)}
                            variant="secondary"
                            loading={
                              decline.isPending && decline.variables === request.registrationId
                            }
                            onPress={() => {
                              setOrganizerError(null);
                              decline.mutate(request.registrationId, { onError });
                            }}
                          />
                        </View>
                      </>
                    ) : undefined
                  }
                />
              );
            })
          )}
        </View>
      ) : null}

      {organizerError ? (
        <Text color="danger" accessibilityLiveRegion="polite">
          {organizerError}
        </Text>
      ) : null}

      <WalkRegistrationPanel
        walk={walk}
        open={open}
        onAddDog={() => router.push('/dogs/new')}
        onOpenOrganization={openOrganization}
      />

      {organizer && walk.repeatsWeekly ? (
        <Button
          label={t.walk.stopSeries}
          variant="secondary"
          loading={stopSeries.isPending}
          onPress={confirmStopSeries}
        />
      ) : null}

      {!organizer ? (
        <Button
          label={t.report.action}
          variant="secondary"
          onPress={() => router.push(reportHref('walk', walk.id, walk.title))}
        />
      ) : null}

      {organizer && open ? (
        <View style={{ gap: spacing.md }}>
          <Button
            label={t.walk.editWalk}
            onPress={() => router.push({ pathname: '/walks/[id]/edit', params: { id: walk.id } })}
          />
          <Button
            label={t.walk.cancelWalk}
            variant="danger"
            loading={cancelWalk.isPending}
            onPress={confirmCancelWalk}
          />
        </View>
      ) : null}
    </>
  );
}
