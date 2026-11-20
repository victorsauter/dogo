import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import type { Participant } from '@/api/types';
import { enumLabel, format, t } from '@/strings';
import { useLineLimit, useTheme, type ColorTokens } from '@/theme';

import { ActionMenu } from './ActionMenu';
import { Avatar } from './Avatar';
import { Text } from './Text';

const DOG_SIZE = 44;
const OWNER_SIZE = 20;
/** Ring of the owner's avatar, in the colour of the row: it cuts the dog's picture. */
const OWNER_RING = 2;
const SWIPE_ACTION_WIDTH = 88;

export interface ParticipantRowProps {
  participant: Participant;
  /** The dog is mine: the owner's line says « Toi ». */
  isMine?: boolean;
  onOpenDog: (dogId: string) => void;
  onOpenOwner: (userId: string) => void;
  /**
   * Organizer only: removes the dog from the walk (the caller confirms first).
   * Gives the row its « … » menu, its swipe action and its screen reader action.
   */
  onRemove?: () => void;
  /** A removal is on its way: a spinner replaces the menu. */
  busy?: boolean;
  /** At the end of the row (accept and decline buttons of a request). */
  trailing?: ReactNode;
  /** Background of the row (it must be opaque for the swipe), the surface by default. */
  background?: keyof ColorTokens;
}

/**
 * One line of the participants card: the dog's picture with its owner's small
 * picture on its corner (that is what binds them), the dog's name, then
 * « owner · size ». Touching the line opens the dog. For the organizer, a
 * « … » menu (see the dog, the owner, remove) and a swipe to the left that
 * reveals « Retirer ».
 */
export function ParticipantRow({
  participant,
  isMine = false,
  onOpenDog,
  onOpenOwner,
  onRemove,
  busy = false,
  trailing,
  background = 'surface',
}: ParticipantRowProps) {
  const { colors, radii, spacing } = useTheme();
  const lines = useLineLimit(1);
  const { dog, owner } = participant;
  // The avatars' fallback fill is `primarySoft`: on a row of that colour, they take the surface.
  const avatarBackground = background === 'primarySoft' ? 'surface' : undefined;
  const size = enumLabel('DogSize', dog.size);
  // The owner's picture and name open their profile (not for my own dog); the rest of the row opens the dog.
  const openOwner = isMine ? undefined : () => onOpenOwner(owner.id);
  const ownerA11yLabel = format(t.walk.viewName, { name: owner.displayName });
  // The row is one element for a screen reader: what its inner buttons do is in its actions.
  const a11yActions = [
    ...(openOwner ? [{ name: 'owner', label: ownerA11yLabel }] : []),
    ...(onRemove ? [{ name: 'remove', label: t.walk.remove }] : []),
  ];

  const row = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors[background],
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={format(t.walk.participantA11y, {
          dog: dog.name,
          size: size.toLocaleLowerCase('fr-FR'),
          owner: owner.displayName,
        })}
        accessibilityActions={a11yActions.length > 0 ? a11yActions : undefined}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'owner') openOwner?.();
          if (event.nativeEvent.actionName === 'remove') onRemove?.();
        }}
        onPress={() => onOpenDog(dog.id)}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.sm,
          paddingLeft: spacing.lg,
          paddingRight: trailing || onRemove || busy ? spacing.xs : spacing.lg,
          backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
        })}
      >
        <View style={{ width: DOG_SIZE, height: DOG_SIZE, marginRight: spacing.xs }}>
          <Avatar
            name={dog.name}
            photoUrl={dog.photoUrl}
            size={DOG_SIZE}
            placeholderIcon="paw"
            background={avatarBackground}
          />
          <Pressable
            testID={`participant-owner-photo-${participant.registrationId}`}
            disabled={!openOwner}
            onPress={openOwner}
            hitSlop={10}
            style={{
              position: 'absolute',
              right: -spacing.xs - OWNER_RING,
              bottom: -spacing.xs,
              padding: OWNER_RING,
              borderRadius: (OWNER_SIZE + OWNER_RING * 2) / 2,
              backgroundColor: colors[background],
            }}
          >
            <Avatar
              name={owner.displayName}
              photoUrl={owner.photoUrl}
              size={OWNER_SIZE}
              background={avatarBackground}
            />
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          {/* The size sits by the dog's name, as a pill: on the owner's line it read as the owner's. */}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              columnGap: spacing.sm,
            }}
          >
            <Text variant="subheading" numberOfLines={lines} style={{ flexShrink: 1 }}>
              {dog.name}
            </Text>
            <View
              testID={`participant-size-${participant.registrationId}`}
              style={{
                paddingHorizontal: spacing.sm,
                paddingVertical: 1,
                borderRadius: radii.pill,
                backgroundColor: colors[avatarBackground ?? 'primarySoft'],
              }}
            >
              <Text variant="caption" color="primary" style={{ fontWeight: '600' }}>
                {size}
              </Text>
            </View>
          </View>
          <Pressable
            testID={`participant-owner-name-${participant.registrationId}`}
            disabled={!openOwner}
            onPress={openOwner}
            hitSlop={{ top: 6, bottom: 10, right: 16 }}
            style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
          >
            <Text variant="caption" color="textMuted" numberOfLines={lines}>
              {isMine ? t.walk.you : owner.displayName}
            </Text>
          </Pressable>
        </View>
      </Pressable>
      {busy ? (
        <View
          accessibilityState={{ busy: true }}
          style={{ width: 48, alignItems: 'center', justifyContent: 'center' }}
        >
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : onRemove ? (
        <ActionMenu
          label={format(t.walk.participantActionsA11y, { dog: dog.name })}
          actions={[
            { id: 'dog', label: format(t.walk.viewName, { name: dog.name }) },
            { id: 'owner', label: format(t.walk.viewName, { name: owner.displayName }) },
            { id: 'remove', label: t.walk.removeFromWalk, destructive: true },
          ]}
          onAction={(id) => {
            if (id === 'dog') onOpenDog(dog.id);
            else if (id === 'owner') onOpenOwner(owner.id);
            else if (id === 'remove') onRemove();
          }}
        />
      ) : null}
      {trailing ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingRight: spacing.lg,
          }}
        >
          {trailing}
        </View>
      ) : null}
    </View>
  );

  if (!onRemove || busy) return row;
  return (
    <ReanimatedSwipeable
      testID={`participant-swipe-${participant.registrationId}`}
      overshootRight={false}
      friction={2}
      rightThreshold={SWIPE_ACTION_WIDTH / 2}
      renderRightActions={(_progress, _translation, methods) => (
        <Pressable
          testID={`participant-swipe-remove-${participant.registrationId}`}
          // The « … » menu and the screen reader action are the ways to remove for those who do not swipe.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={() => {
            methods.close();
            onRemove();
          }}
          style={{
            width: SWIPE_ACTION_WIDTH,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.danger,
          }}
        >
          <Text variant="label" color="onDanger">
            {t.walk.remove}
          </Text>
        </Pressable>
      )}
    >
      {row}
    </ReanimatedSwipeable>
  );
}
