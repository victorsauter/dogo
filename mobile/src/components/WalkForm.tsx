import { useState } from 'react';

import { enumValues, type DogSize, type LeashRule, type WalkAccess } from '@/api/enums';
import { ApiError, errorMessage } from '@/api/errors';
import type { GeoPoint } from '@/api/types';
import { formatDuration } from '@/lib/dates';
import {
  limits,
  serverFieldErrors,
  validateWalk,
  walkFields,
  type FieldErrors,
  type WalkFormValues,
} from '@/lib/forms';
import { enumLabel, format, t } from '@/strings';
import { useTheme } from '@/theme';

import { Button } from './Button';
import { ChoiceGroup } from './Chip';
import { DateTimeField } from './DateTimeField';
import { FieldAnchor, useScrollToFirstError } from './FormScroll';
import { MeetingPointPicker } from './MeetingPointPicker';
import { Stepper } from './Stepper';
import { SwitchRow } from './SwitchRow';
import { Text } from './Text';
import { TextField } from './TextField';

export interface WalkFormProps {
  initial: WalkFormValues;
  submitLabel: string;
  /**
   * The user's position, when it arrives after the form opened: a new walk's
   * pin follows it until the person moves the pin.
   */
  userLocation?: GeoPoint | null;
  /** Shows the « Répéter chaque semaine » switch: only when creating a walk. */
  allowRepeat?: boolean;
  /**
   * Organisations the person may organise for (creation only): when there is
   * at least one, the « Organiser pour » field offers « Moi » and each of them.
   */
  organizations?: readonly { id: string; name: string }[];
  /** Creates or updates the walk. Throw an `ApiError` to show it on the form. */
  onSubmit: (values: WalkFormValues) => Promise<void>;
}

type WalkErrors = FieldErrors<keyof WalkFormValues>;

/** Conflict codes of the API that concern one field of the form. */
const conflictFields: Partial<Record<string, keyof WalkFormValues>> = {
  'walk.capacity_below_registered': 'maxDogs',
  'walk.size_in_use': 'allowedSizes',
  'walk.organization_forbidden': 'organizationId',
};

/** Field errors of a failed submission: validation errors, or a conflict on its field. */
export function walkSubmitErrors(error: unknown): WalkErrors {
  const errors: WalkErrors = serverFieldErrors(error, walkFields);
  const field = error instanceof ApiError && error.code ? conflictFields[error.code] : undefined;
  if (field) errors[field] = errorMessage(error);
  return errors;
}

function GroupError({ message }: { message?: string }) {
  return message ? (
    <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
      {message}
    </Text>
  ) : null;
}

/** Create and edit form of a walk. Render it inside a scrolling `Screen`. */
export function WalkForm({
  initial,
  submitLabel,
  userLocation,
  allowRepeat = false,
  organizations = [],
  onSubmit,
}: WalkFormProps) {
  const { spacing } = useTheme();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<WalkErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pinMoved, setPinMoved] = useState(false);
  const scrollToFirstError = useScrollToFirstError();

  const set = <K extends keyof WalkFormValues>(key: K, value: WalkFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  // Until the person moves the pin, a new walk's meeting point follows their position.
  const current: WalkFormValues =
    userLocation && !pinMoved ? { ...values, location: userLocation } : values;

  async function submit() {
    const found = validateWalk(current);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      void scrollToFirstError(found);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(current);
    } catch (error) {
      const fieldErrors = walkSubmitErrors(error);
      setErrors(fieldErrors);
      setFormError(errorMessage(error));
      void scrollToFirstError(fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  const sizeOptions = enumValues.DogSize.map((value) => ({
    value: value as DogSize,
    label: enumLabel('DogSize', value),
  }));
  const leashOptions = enumValues.LeashRule.map((value) => ({
    value: value as LeashRule,
    label: enumLabel('LeashRule', value),
  }));
  const ME = 'me';
  const organizerOptions = [
    { value: ME, label: t.walk.organizeForMe },
    ...organizations.map((organization) => ({ value: organization.id, label: organization.name })),
  ];
  const accessOptions = enumValues.WalkAccess.map((value) => ({
    value: value as WalkAccess,
    label: enumLabel('WalkAccess', value),
  }));

  return (
    <>
      <TextField
        name="title"
        label={t.walk.title}
        value={values.title}
        onChangeText={(text) => set('title', text)}
        error={errors.title}
        hint={t.walk.titleHint}
        maxLength={limits.walkTitle}
        autoCapitalize="sentences"
      />
      <TextField
        name="description"
        label={t.walk.description}
        value={values.description}
        onChangeText={(text) => set('description', text)}
        error={errors.description}
        hint={t.walk.descriptionHint}
        maxLength={limits.walkDescription}
        multiline
      />
      <DateTimeField
        name="startsAt"
        label={t.walk.startsAt}
        value={values.startsAt}
        onChange={(date) => set('startsAt', date)}
        minimumDate={new Date()}
        dateA11yLabel={t.walk.pickDate}
        timeA11yLabel={t.walk.pickTime}
        error={errors.startsAt}
      />
      <FieldAnchor name="durationMinutes">
        <Stepper
          label={t.walk.duration}
          value={values.durationMinutes}
          onChange={(minutes) => set('durationMinutes', minutes)}
          min={limits.walkDurationMin}
          max={limits.walkDurationMax}
          step={limits.walkDurationStep}
          formatValue={formatDuration}
          error={errors.durationMinutes}
          hint={durationRangeHint()}
        />
      </FieldAnchor>
      <MeetingPointPicker
        name="location"
        value={current.location}
        recenterOn={pinMoved ? null : userLocation}
        onChange={(point) => {
          setPinMoved(true);
          set('location', point);
        }}
        error={errors.location}
      />
      <TextField
        name="locationLabel"
        label={t.walk.locationLabel}
        value={values.locationLabel}
        onChangeText={(text) => set('locationLabel', text)}
        error={errors.locationLabel}
        hint={t.walk.locationLabelHint}
        maxLength={limits.walkLocationLabel}
      />
      <FieldAnchor name="maxDogs">
        <Stepper
          label={t.walk.maxDogs}
          value={values.maxDogs}
          onChange={(count) => set('maxDogs', count)}
          min={limits.walkDogsMin}
          max={limits.walkDogsMax}
          error={errors.maxDogs}
        />
      </FieldAnchor>
      <FieldAnchor name="allowedSizes" style={{ gap: spacing.sm }}>
        <Text variant="label">{t.walk.sizes}</Text>
        <ChoiceGroup
          multiple
          accessibilityLabel={t.walk.sizes}
          options={sizeOptions}
          value={values.allowedSizes}
          onChange={(sizes) => set('allowedSizes', sizes)}
        />
        <GroupError message={errors.allowedSizes} />
      </FieldAnchor>
      <FieldAnchor name="leashRule" style={{ gap: spacing.sm }}>
        <Text variant="label">{t.walk.leash}</Text>
        <ChoiceGroup
          accessibilityLabel={t.walk.leash}
          options={leashOptions}
          value={values.leashRule}
          onChange={(rule) => set('leashRule', rule)}
        />
        <GroupError message={errors.leashRule} />
      </FieldAnchor>
      <TextField
        name="rules"
        label={t.walk.rules}
        value={values.rules}
        onChangeText={(text) => set('rules', text)}
        error={errors.rules}
        hint={t.walk.rulesHint}
        maxLength={limits.walkRules}
        multiline
      />
      <FieldAnchor name="access" style={{ gap: spacing.sm }}>
        <Text variant="label">{t.walk.access}</Text>
        <ChoiceGroup
          accessibilityLabel={t.walk.access}
          options={accessOptions}
          value={values.access}
          onChange={(access) => set('access', access)}
        />
        <GroupError message={errors.access} />
      </FieldAnchor>
      {organizations.length > 0 ? (
        <FieldAnchor name="organizationId" style={{ gap: spacing.sm }}>
          <Text variant="label">{t.walk.organizeFor}</Text>
          <ChoiceGroup
            accessibilityLabel={t.walk.organizeFor}
            options={organizerOptions}
            value={values.organizationId ?? ME}
            onChange={(choice) => set('organizationId', choice === ME ? null : choice)}
          />
          <Text variant="caption" color="textMuted">
            {t.walk.organizeForHint}
          </Text>
          <GroupError message={errors.organizationId} />
        </FieldAnchor>
      ) : null}
      {allowRepeat ? (
        <SwitchRow
          label={t.walk.repeatWeekly}
          description={t.walk.repeatWeeklyHint}
          value={values.repeatWeekly}
          onValueChange={(repeat) => set('repeatWeekly', repeat)}
        />
      ) : null}
      {formError ? (
        <Text color="danger" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}
      <Button label={submitLabel} loading={submitting} onPress={submit} />
    </>
  );
}

/** « Entre 15 min et 8 h. » */
function durationRangeHint(): string {
  return format(t.walk.durationRange, {
    min: formatDuration(limits.walkDurationMin),
    max: formatDuration(limits.walkDurationMax),
  });
}
