import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { formatDay, formatTime } from '@/lib/dates';
import { useTheme } from '@/theme';

import { Button } from './Button';
import { FieldAnchor } from './FormScroll';
import { Text } from './Text';

export interface DateTimeFieldProps {
  label: string;
  value: Date;
  onChange: (value: Date) => void;
  /** Earliest selectable day (a walk starts in the future). */
  minimumDate?: Date;
  /** Latest selectable day (a walk starts within a year). */
  maximumDate?: Date;
  dateA11yLabel: string;
  timeA11yLabel: string;
  error?: string;
  hint?: string;
  /** Name in the form's errors, to scroll to it when it is the first in error. */
  name?: string;
}

type Mode = 'date' | 'time';

/** Keeps the time of `base` and takes the day of `day`, or the reverse. */
function merge(base: Date, picked: Date, mode: Mode): Date {
  const next = new Date(base);
  if (mode === 'date') next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return next;
}

/**
 * Day and time of an event, in the device's time zone. Android opens the
 * system dialogs; iOS shows the inline calendar or the time wheel.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  dateA11yLabel,
  timeA11yLabel,
  error,
  hint,
  name,
}: DateTimeFieldProps) {
  const { spacing } = useTheme();
  const [open, setOpen] = useState<Mode | null>(null);
  const day = formatDay(value);
  const time = formatTime(value);

  function handleChange(mode: Mode) {
    return (event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS !== 'ios') setOpen(null);
      if (event.type === 'set' && date) onChange(merge(value, date, mode));
    };
  }

  function openPicker(mode: Mode) {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode,
        is24Hour: true,
        minimumDate: mode === 'date' ? minimumDate : undefined,
        maximumDate: mode === 'date' ? maximumDate : undefined,
        onChange: handleChange(mode),
      });
    } else {
      setOpen((current) => (current === mode ? null : mode));
    }
  }

  return (
    <FieldAnchor name={name} style={{ gap: spacing.xs }}>
      <Text variant="label">{label}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 3 }}>
          <Button
            label={day}
            variant="secondary"
            accessibilityLabel={`${dateA11yLabel} : ${day}`}
            onPress={() => openPicker('date')}
          />
        </View>
        <View style={{ flex: 2 }}>
          <Button
            label={time}
            variant="secondary"
            accessibilityLabel={`${timeA11yLabel} : ${time}`}
            onPress={() => openPicker('time')}
          />
        </View>
      </View>
      {open && Platform.OS === 'ios' ? (
        <DateTimePicker
          value={value}
          mode={open}
          display={open === 'date' ? 'inline' : 'spinner'}
          locale="fr-FR"
          minimumDate={open === 'date' ? minimumDate : undefined}
          maximumDate={open === 'date' ? maximumDate : undefined}
          minuteInterval={5}
          onChange={handleChange(open)}
        />
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
    </FieldAnchor>
  );
}
