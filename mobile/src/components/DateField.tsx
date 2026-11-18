import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useTheme } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

export interface DateFieldProps {
  label: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  /** Latest selectable date (no future birth dates). */
  maximumDate?: Date;
  /** Label of the button that opens the picker while no date is set. */
  pickLabel: string;
  clearLabel: string;
  error?: string;
  hint?: string;
}

const FALLBACK_DATE = new Date(2020, 0, 1);

/**
 * Optional date. Android opens the system dialog; iOS shows the inline calendar
 * (both come with Expo Go through `@react-native-community/datetimepicker`).
 */
export function DateField({
  label,
  value,
  onChange,
  maximumDate,
  pickLabel,
  clearLabel,
  error,
  hint,
}: DateFieldProps) {
  const { spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const display = value?.toLocaleDateString('fr-FR', { dateStyle: 'long' });

  function handleChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS !== 'ios') setOpen(false);
    if (event.type === 'set' && date) onChange(date);
  }

  function openPicker() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: value ?? maximumDate ?? FALLBACK_DATE,
        mode: 'date',
        maximumDate,
        onChange: handleChange,
      });
    } else {
      setOpen((current) => !current);
    }
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="label">{label}</Text>
      <Button
        label={display ?? pickLabel}
        variant="secondary"
        accessibilityLabel={`${label} : ${display ?? pickLabel}`}
        onPress={openPicker}
      />
      {open && Platform.OS === 'ios' ? (
        <DateTimePicker
          value={value ?? maximumDate ?? FALLBACK_DATE}
          mode="date"
          display="inline"
          locale="fr-FR"
          maximumDate={maximumDate}
          onChange={handleChange}
        />
      ) : null}
      {value ? (
        <Button label={clearLabel} variant="secondary" onPress={() => onChange(null)} />
      ) : null}
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
