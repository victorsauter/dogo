import type { PropsWithChildren } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { PressableScale } from './PressableScale';

export interface CardProps {
  /** Makes the whole card pressable. */
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  onPress,
  accessibilityLabel,
  style,
}: PropsWithChildren<CardProps>) {
  const { colors, radii, spacing } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <PressableScale
      size="large"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [base, pressed && { backgroundColor: colors.surfaceMuted }, style]}
    >
      {children}
    </PressableScale>
  );
}
