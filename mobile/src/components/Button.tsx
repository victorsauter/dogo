import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  /** Shows a spinner and ignores presses. */
  loading?: boolean;
  disabled?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityLabel,
  ...props
}: ButtonProps) {
  const { colors, radii, spacing, minTouchSize } = useTheme();
  const inactive = disabled || loading;
  const palette = {
    primary: { background: colors.primary, foreground: colors.onPrimary, border: colors.primary },
    secondary: { background: colors.surface, foreground: colors.primary, border: colors.primary },
    danger: { background: colors.danger, foreground: colors.onDanger, border: colors.danger },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: minTouchSize,
          borderRadius: radii.md,
          paddingHorizontal: spacing.xl,
          backgroundColor: palette.background,
          borderColor: palette.border,
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={palette.foreground} />
      ) : (
        <Text variant="label" style={{ color: palette.foreground }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
});
