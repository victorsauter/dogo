import { Pressable, View } from 'react-native';

import type { UserSummary } from '@/api/types';
import { useTheme } from '@/theme';

import { Avatar } from './Avatar';
import { Text } from './Text';

/** Share of an avatar covered by the next one, in points (the 32 px default). */
const OVERLAP = 10;
/** Ring in the colour of the background: it cuts each picture from its neighbour. */
const RING = 2;
const MAX_VISIBLE = 3;

export interface AvatarStackProps {
  users: UserSummary[];
  /** Diameter of each picture, ring excluded. */
  size?: number;
  /** Pictures shown before the « +N » pill. */
  max?: number;
  /** Read by screen readers for the whole stack (its pictures are then hidden from them). */
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** Makes the stack a button. */
  onPress?: () => void;
  testID?: string;
}

/**
 * Overlapping pictures of people, the first one underneath: at most `max`, then a
 * « +N » pill for the rest. It reads as one element, with the label given.
 */
export function AvatarStack({
  users,
  size = 32,
  max = MAX_VISIBLE,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  testID,
}: AvatarStackProps) {
  const { colors, radii } = useTheme();
  const visible = users.slice(0, max);
  const hidden = users.length - visible.length;
  const outer = size + RING * 2;
  const ring = {
    padding: RING,
    borderRadius: radii.pill,
    backgroundColor: colors.background,
  };

  const content = (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center' }}>
      {visible.map((user, index) => (
        <View key={user.id} style={[ring, index > 0 && { marginLeft: -OVERLAP }]}>
          <Avatar name={user.displayName} photoUrl={user.photoUrl} size={size} />
        </View>
      ))}
      {hidden > 0 ? (
        <View style={[ring, { marginLeft: -OVERLAP }]}>
          <View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: colors.primarySoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              allowFontScaling={false}
              style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}
            >
              {`+${hidden}`}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <Pressable
      accessible
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={onPress ? accessibilityHint : undefined}
      disabled={!onPress}
      onPress={onPress}
      hitSlop={6}
      style={{ minHeight: outer }}
    >
      {content}
    </Pressable>
  );
}
