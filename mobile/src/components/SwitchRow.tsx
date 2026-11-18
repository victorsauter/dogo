import { Switch, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface SwitchRowProps {
  label: string;
  /** One line explaining what the switch does. */
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

/** A labelled switch with its explanation under the label. */
export function SwitchRow({ label, description, value, onValueChange, disabled }: SwitchRowProps) {
  const { colors, spacing, minTouchSize } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: minTouchSize,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{label}</Text>
        {description ? (
          <Text variant="caption" color="textMuted">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityHint={description}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </View>
  );
}
