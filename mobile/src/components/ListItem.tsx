import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useLineLimit, useTheme } from '@/theme';

import { Text } from './Text';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  /** Leading element, typically an `Avatar`. */
  left?: ReactNode;
  /** Trailing element, typically a chevron or a status chip. */
  right?: ReactNode;
  /** Element under the title (a `Badge`), in place of the subtitle. */
  below?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Title in the danger color (a destructive entry such as « Supprimer mon compte »). */
  danger?: boolean;
}

export function ListItem({
  title,
  subtitle,
  left,
  right,
  below,
  onPress,
  accessibilityLabel,
  danger = false,
}: ListItemProps) {
  const { colors, spacing } = useTheme();
  const titleLines = useLineLimit(1);
  const subtitleLines = useLineLimit(2);
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
      })}
    >
      {left}
      <View style={{ flex: 1 }}>
        <Text variant="subheading" numberOfLines={titleLines} color={danger ? 'danger' : 'text'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted" numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        ) : null}
        {below}
      </View>
      {right}
    </Pressable>
  );
}
