import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import type { ChoiceOption } from './Chip';
import { Text } from './Text';

export interface SegmentedControlProps<T extends string> {
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group, e.g. « Période ». */
  accessibilityLabel: string;
}

/** Height of a segment (44 pt touch target); with the 1 pt padding and border the control is 48 pt. */
const SEGMENT_HEIGHT = 44;

/**
 * Compact single-choice control on one line: the options share the width, the
 * chosen one has a tinted background and a bold label (not the colour alone).
 * A radio group for screen readers, like `ChoiceGroup`.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const { colors, radii } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        padding: 1,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: SEGMENT_HEIGHT,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 4,
              borderRadius: radii.pill,
              backgroundColor: selected
                ? colors.primarySoft
                : pressed
                  ? colors.surfaceMuted
                  : 'transparent',
            })}
          >
            <Text
              variant="label"
              color={selected ? 'primary' : 'text'}
              align="center"
              style={{ fontWeight: selected ? '700' : '400' }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
