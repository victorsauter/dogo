import { View } from 'react-native';

import { useTheme, type ColorTokens } from '@/theme';

import { Text } from './Text';

export type BannerTone = 'danger' | 'warning' | 'info';

export interface BannerProps {
  message: string;
  title?: string;
  tone?: BannerTone;
}

/** A sentence (or two) that frames a whole screen: « Cette balade est annulée », « Compte suspendu »… */
export function Banner({ message, title, tone = 'danger' }: BannerProps) {
  const { colors, radii, spacing } = useTheme();
  const palette: Record<BannerTone, { background: keyof ColorTokens; text: keyof ColorTokens }> = {
    danger: { background: 'dangerSoft', text: 'danger' },
    warning: { background: 'surfaceMuted', text: 'warning' },
    info: { background: 'infoSoft', text: 'info' },
  };
  const { background, text } = palette[tone];
  return (
    <View
      accessibilityRole={tone === 'info' ? undefined : 'alert'}
      style={{
        backgroundColor: colors[background],
        borderRadius: radii.md,
        padding: spacing.md,
        gap: spacing.xs,
      }}
    >
      {title ? (
        <Text color={text} style={{ fontWeight: '700' }}>
          {title}
        </Text>
      ) : null}
      <Text color={text} style={{ fontWeight: title ? '400' : '600' }}>
        {message}
      </Text>
    </View>
  );
}
