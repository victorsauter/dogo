import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme, type ColorTokens, type TypographyVariant } from '@/theme';

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: keyof ColorTokens;
  align?: 'auto' | 'left' | 'center' | 'right';
}

/** Themed text. Headings (`title`, `heading`) are announced as headers by screen readers. */
export function Text({
  variant = 'body',
  color = 'text',
  align,
  style,
  accessibilityRole,
  ...props
}: TextProps) {
  const theme = useTheme();
  const isHeader = variant === 'title' || variant === 'heading';
  return (
    <RNText
      accessibilityRole={accessibilityRole ?? (isHeader ? 'header' : undefined)}
      style={[theme.typography[variant], { color: theme.colors[color], textAlign: align }, style]}
      {...props}
    />
  );
}
