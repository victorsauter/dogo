import { useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { scaledSize, useFontScale, useTheme } from '@/theme';

import { FieldAnchor } from './FormScroll';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Error message shown under the field (French, from the strings module). */
  error?: string;
  /** Help text shown under the field when there is no error. */
  hint?: string;
  /** Name in the form's errors, to scroll to it when it is the first in error. */
  name?: string;
}

export function TextField({
  label,
  error,
  hint,
  name,
  multiline,
  onFocus,
  onBlur,
  ...props
}: TextFieldProps) {
  const { colors, radii, spacing, typography, minTouchSize } = useTheme();
  const fontScale = useFontScale();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <FieldAnchor name={name} style={{ gap: spacing.xs }}>
      <Text variant="label">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          typography.body,
          {
            // A minimum that follows the text size, never a fixed height: the field grows with its text.
            minHeight: scaledSize(multiline ? minTouchSize * 2.5 : minTouchSize, fontScale),
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderColor,
            backgroundColor: colors.surface,
            color: colors.text,
          },
        ]}
        {...props}
      />
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textMuted">
          {hint}
        </Text>
      ) : null}
    </FieldAnchor>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1.5 },
});
