import { View } from 'react-native';

import type { Dog } from '@/api/types';
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

/** Dog as a card: photo, name, size and sociability on one line, breed when known. */
export function DogCard({ dog, onPress }: { dog: Dog; onPress?: () => void }) {
  const { spacing } = useTheme();
  const lines = useLineLimit(1);
  const summary = dogSummary(dog);
  return (
    <Card onPress={onPress} accessibilityLabel={`${dog.name}, ${summary}`}>
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
        </View>
      </View>
    </Card>
  );
}
