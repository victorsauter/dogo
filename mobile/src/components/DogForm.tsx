import { useState } from 'react';

import { enumValues } from '@/api/enums';
import { errorMessage } from '@/api/errors';
import type { PickedPhoto } from '@/api/photoUpload';
import {
  dogFields,
  limits,
  serverFieldErrors,
  validateDog,
  type DogFormValues,
  type FieldErrors,
} from '@/lib/forms';
import { enumLabel, t } from '@/strings';
import { useTheme } from '@/theme';

import { Button } from './Button';
import { ChoiceGroup } from './Chip';
import { DateField } from './DateField';
import { FieldAnchor, useScrollToFirstError } from './FormScroll';
import { PhotoPicker } from './PhotoPicker';
import { Text } from './Text';
import { TextField } from './TextField';

export interface DogFormProps {
  initial: DogFormValues;
  /** Current photo (edit), from the API. */
  photoUrl?: string | null;
  submitLabel: string;
  /** Creates or updates the dog. Throw an `ApiError` to show it on the form. */
  onSubmit: (values: DogFormValues, photo: PickedPhoto | null) => Promise<void>;
}

function GroupError({ message }: { message?: string }) {
  return message ? (
    <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
      {message}
    </Text>
  ) : null;
}

/** Create and edit form of a dog, with client validation and server errors on fields. */
export function DogForm({ initial, photoUrl, submitLabel, onSubmit }: DogFormProps) {
  const { spacing } = useTheme();
  const [values, setValues] = useState(initial);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [errors, setErrors] = useState<FieldErrors<keyof DogFormValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const scrollToFirstError = useScrollToFirstError();

  const set = <K extends keyof DogFormValues>(key: K, value: DogFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function submit() {
    const found = validateDog(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      void scrollToFirstError(found);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(values, photo);
    } catch (error) {
      const serverErrors = serverFieldErrors(error, dogFields);
      setErrors(serverErrors);
      setFormError(errorMessage(error));
      void scrollToFirstError(serverErrors);
    } finally {
      setSubmitting(false);
    }
  }

  const options = <E extends 'DogSize' | 'Sociability' | 'Reactivity' | 'LeashHabit'>(name: E) =>
    enumValues[name].map((value) => ({
      value: value as string,
      label: enumLabel(name, value as never),
    }));

  return (
    <>
      <PhotoPicker
        name={values.name}
        placeholderIcon="paw"
        photoUrl={photoUrl}
        picked={photo}
        onPick={setPhoto}
        disabled={submitting}
      />
      <TextField
        name="name"
        label={t.dog.name}
        value={values.name}
        onChangeText={(text) => set('name', text)}
        error={errors.name}
        maxLength={limits.dogName}
        autoCapitalize="words"
        returnKeyType="next"
      />
      {(
        [
          ['size', t.dog.size, 'DogSize'],
          ['sociability', t.dog.sociability, 'Sociability'],
          ['reactivity', t.dog.reactivity, 'Reactivity'],
          ['leashHabit', t.dog.leashHabit, 'LeashHabit'],
        ] as const
      ).map(([key, label, enumName]) => (
        <FieldAnchor key={key} name={key} style={{ gap: spacing.sm }}>
          <Text variant="label">{label}</Text>
          <ChoiceGroup
            accessibilityLabel={label}
            options={options(enumName)}
            value={values[key]}
            onChange={(value) => set(key, value as never)}
          />
          <GroupError message={errors[key]} />
        </FieldAnchor>
      ))}
      <DateField
        name="birthDate"
        label={t.dog.birthDate}
        value={values.birthDate}
        onChange={(date) => set('birthDate', date)}
        maximumDate={new Date()}
        pickLabel={t.dog.birthDatePick}
        clearLabel={t.dog.birthDateClear}
        hint={t.dog.birthDateHint}
        error={errors.birthDate}
      />
      <TextField
        name="breed"
        label={t.dog.breed}
        value={values.breed}
        onChangeText={(text) => set('breed', text)}
        error={errors.breed}
        hint={t.dog.breedHint}
        maxLength={limits.dogBreed}
      />
      <TextField
        name="description"
        label={t.dog.description}
        value={values.description}
        onChangeText={(text) => set('description', text)}
        error={errors.description}
        hint={t.dog.descriptionHint}
        maxLength={limits.dogDescription}
        multiline
      />
      {formError ? (
        <Text color="danger" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}
      <Button label={submitLabel} loading={submitting} onPress={submit} />
    </>
  );
}
