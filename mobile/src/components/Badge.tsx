import { View } from 'react-native';

import { useTheme, type ColorTokens } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'primary' | 'pro' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
  /** Read by screen readers instead of `label` (e.g. a fuller sentence). */
  accessibilityLabel?: string;
}

/** Small status pill: « Complet », « Sur approbation », « Pro », « Annulée »… */
export function Badge({ label, tone = 'neutral', icon, accessibilityLabel }: BadgeProps) {
  const { colors, radii, spacing } = useTheme();
  const palette: Record<BadgeTone, { background: keyof ColorTokens; text: keyof ColorTokens }> = {
    neutral: { background: 'surfaceMuted', text: 'textMuted' },
    primary: { background: 'primarySoft', text: 'primary' },
    pro: { background: 'pro', text: 'onPro' },
    warning: { background: 'surfaceMuted', text: 'warning' },
    danger: { background: 'dangerSoft', text: 'danger' },
    info: { background: 'infoSoft', text: 'info' },
  };
  const { background, text } = palette[tone];
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        alignSelf: 'flex-start',
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radii.pill,
        backgroundColor: colors[background],
      }}
    >
      {icon ? <Icon name={icon} size={14} color={text} /> : null}
      <Text variant="caption" color={text} style={{ fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}
