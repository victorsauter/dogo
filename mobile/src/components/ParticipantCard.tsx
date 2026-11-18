import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { Participant } from '@/api/types';
import { format, t } from '@/strings';
import { useTheme } from '@/theme';

import { DogCard } from './DogCard';
import { Text } from './Text';

export interface ParticipantCardProps {
  participant: Participant;
  onOpenDog: (dogId: string) => void;
  onOpenOwner: (userId: string) => void;
  /** Actions under the card (accept / decline / remove), for the organizer. */
  actions?: ReactNode;
}

/** A registered dog (its card opens the dog) with its owner (opens the profile). */
export function ParticipantCard({
  participant,
  onOpenDog,
  onOpenOwner,
  actions,
}: ParticipantCardProps) {
  const { spacing } = useTheme();
  const { dog, owner } = participant;
  return (
    <View style={{ gap: spacing.xs }}>
      <DogCard dog={dog} onPress={() => onOpenDog(dog.id)} />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={format(t.walk.organizerA11y, { name: owner.displayName })}
        onPress={() => onOpenOwner(owner.id)}
        hitSlop={8}
        style={{ paddingHorizontal: spacing.sm }}
      >
        <Text variant="caption" color="primary">
          {format(t.walk.withOwner, { name: owner.displayName })}
        </Text>
      </Pressable>
      {actions ? <View style={{ flexDirection: 'row', gap: spacing.sm }}>{actions}</View> : null}
    </View>
  );
}
