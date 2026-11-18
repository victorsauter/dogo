import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** `radio` inside a single choice, `checkbox` inside a multiple choice. */
  role?: 'radio' | 'checkbox' | 'button';
  disabled?: boolean;
}

export function Chip({ label, selected = false, onPress, role = 'button', disabled }: ChipProps) {
  const { colors, radii, spacing, minTouchSize } = useTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: role === 'button' ? undefined : selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={(minTouchSize - 40) / 2}
      style={({ pressed }) => ({
        minHeight: 40,
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
        borderRadius: radii.pill,
        borderWidth: 1.5,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected
          ? colors.primarySoft
          : pressed
            ? colors.surfaceMuted
            : colors.surface,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Text variant="label" color={selected ? 'primary' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

interface ChoiceGroupBaseProps<T extends string> {
  options: readonly ChoiceOption<T>[];
  /** Accessible name of the group, e.g. « Gabarit ». */
  accessibilityLabel: string;
}

export type ChoiceGroupProps<T extends string> = ChoiceGroupBaseProps<T> &
  (
    | { multiple?: false; value: T | null; onChange: (value: T) => void }
    | { multiple: true; value: readonly T[]; onChange: (value: T[]) => void }
  );

/**
 * Row of chips to pick one value (`value`/`onChange`) or several (`multiple`).
 * Typical use with an enum: options built from `enumValues.DogSize` and `enumLabel()`.
 */
export function ChoiceGroup<T extends string>(props: ChoiceGroupProps<T>) {
  const { spacing } = useTheme();
  const isSelected = (value: T) =>
    props.multiple ? props.value.includes(value) : props.value === value;

  function toggle(value: T) {
    if (props.multiple) {
      props.onChange(
        props.value.includes(value)
          ? props.value.filter((item) => item !== value)
          : [...props.value, value],
      );
    } else {
      props.onChange(value);
    }
  }

  return (
    <View
      accessibilityRole={props.multiple ? undefined : 'radiogroup'}
      accessibilityLabel={props.accessibilityLabel}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}
    >
      {props.options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          role={props.multiple ? 'checkbox' : 'radio'}
          selected={isSelected(option.value)}
          onPress={() => toggle(option.value)}
        />
      ))}
    </View>
  );
}
