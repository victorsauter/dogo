import { Pressable, View } from 'react-native';

import { format, t } from '@/strings';
import { useTheme } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

export interface StepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Displayed value (e.g. « 1 h 30 » for minutes); defaults to the number. */
  formatValue?: (value: number) => string;
  error?: string;
  hint?: string;
}

/** − value + control, announced as an adjustable element by screen readers. */
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  formatValue = String,
  error,
  hint,
}: StepperProps) {
  const { colors, radii, spacing, minTouchSize } = useTheme();
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const display = formatValue(value);

  const button = (direction: -1 | 1) => {
    const disabled = direction < 0 ? value <= min : value >= max;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={format(
          direction < 0 ? t.walk.stepperDecrease : t.walk.stepperIncrease,
          {
            label: label.toLocaleLowerCase('fr-FR'),
          },
        )}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onChange(clamp(value + direction * step))}
        style={({ pressed }) => ({
          width: minTouchSize,
          height: minTouchSize,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radii.md,
          borderWidth: 1.5,
          borderColor: colors.primary,
          backgroundColor: pressed ? colors.primarySoft : colors.surface,
          opacity: disabled ? 0.4 : 1,
        })}
      >
        <Icon name={direction < 0 ? 'minus' : 'plus'} size={20} color="primary" />
      </Pressable>
    );
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="label">{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        {button(-1)}
        <Text
          variant="subheading"
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: display }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) =>
            onChange(clamp(value + (event.nativeEvent.actionName === 'increment' ? step : -step)))
          }
          style={{ minWidth: 72, flexShrink: 1, textAlign: 'center' }}
        >
          {display}
        </Text>
        {button(1)}
      </View>
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
