import { View } from 'react-native';

import type { Dog } from '@/api/types';
import { alsoWithPhrase, otherHumans } from '@/lib/dogMembers';
import { enumLabel, format, t } from '@/strings';
import { useLineLimit, useTheme } from '@/theme';

import { Avatar } from './Avatar';
import { Card } from './Card';
import { Text } from './Text';

export function dogSummary(dog: Dog): string {
  return format(t.dog.summary, {
    size: enumLabel('DogSize', dog.size),
    sociability: enumLabel('Sociability', dog.sociability),
  });
}

export interface DogCardProps {
  dog: Dog;
  onPress?: () => void;
  /**
   * The human whose profile lists the dog. When the dog has other humans, a line
   * « aussi avec Camille » says so; without it the line is never shown.
   */
  profileUserId?: string;
}

/**
 * Dog as a card: photo, name, size and sociability on one line, breed when known,
 * and « aussi avec … » when the dog has other humans than the profile's.
 */
export function DogCard({ dog, onPress, profileUserId }: DogCardProps) {
  const { spacing } = useTheme();
  const lines = useLineLimit(1);
  const summary = dogSummary(dog);
  const also = profileUserId ? alsoWithPhrase(dog.members, profileUserId) : null;
  const firstOther = profileUserId ? otherHumans(dog.members, profileUserId)[0] : undefined;
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={also ? `${dog.name}, ${summary}, ${also}` : `${dog.name}, ${summary}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar name={dog.name} photoUrl={dog.photoUrl} size={64} />
        <View style={{ flex: 1 }}>
          <Text variant="subheading" numberOfLines={lines}>
            {dog.name}
          </Text>
          <Text color="textMuted" numberOfLines={lines}>
            {summary}
          </Text>
          {dog.breed ? (
            <Text variant="caption" color="textMuted" numberOfLines={lines}>
              {dog.breed}
            </Text>
          ) : null}
          {also && firstOther ? (
            <View
              testID="dog-also-with"
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 }}
            >
              <Avatar name={firstOther.displayName} photoUrl={firstOther.photoUrl} size={20} />
              <Text
                variant="caption"
                color="textMuted"
                numberOfLines={lines}
                style={{ flexShrink: 1 }}
              >
                {also}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
