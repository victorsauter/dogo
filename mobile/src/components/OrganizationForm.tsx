import { useState } from 'react';

import { errorMessage } from '@/api/errors';
import {
  limits,
  organizationFields,
  serverFieldErrors,
  validateOrganization,
  type FieldErrors,
  type OrganizationFormValues,
} from '@/lib/forms';
import { t } from '@/strings';

import { Banner } from './Banner';
import { Button } from './Button';
import { useScrollToFirstError } from './FormScroll';
import { Text } from './Text';
import { TextField } from './TextField';

export interface OrganizationFormProps {
  initial: OrganizationFormValues;
  submitLabel: string;
  /** A paragraph shown above the fields (what happens after sending). */
  explanation?: string;
  /** Values are trimmed. Throw an `ApiError` to show it on the form. */
  onSubmit: (values: OrganizationFormValues) => Promise<void>;
}

type Errors = FieldErrors<keyof OrganizationFormValues>;

/** Create and edit form of an organisation. Render it inside a scrolling `Screen`. */
export function OrganizationForm({
  initial,
  submitLabel,
  explanation,
  onSubmit,
}: OrganizationFormProps) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const scrollToFirstError = useScrollToFirstError();

  const set = (key: keyof OrganizationFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function submit() {
    const found = validateOrganization(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      void scrollToFirstError(found);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: values.name.trim(),
        description: values.description.trim(),
        city: values.city.trim(),
      });
    } catch (error) {
      const fieldErrors = serverFieldErrors(error, organizationFields);
      setErrors(fieldErrors);
      setFormError(errorMessage(error));
      void scrollToFirstError(fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {explanation ? <Banner tone="info" message={explanation} /> : null}
      <TextField
        name="name"
        label={t.organization.name}
        value={values.name}
        onChangeText={(text) => set('name', text)}
        error={errors.name}
        hint={t.organization.nameHint}
        maxLength={limits.organizationName}
      />
      <TextField
        name="city"
        label={t.organization.city}
        value={values.city}
        onChangeText={(text) => set('city', text)}
        error={errors.city}
        hint={t.organization.cityHint}
        maxLength={limits.organizationCity}
      />
      <TextField
        name="description"
        label={t.organization.description}
        value={values.description}
        onChangeText={(text) => set('description', text)}
        error={errors.description}
        hint={t.organization.descriptionHint}
        maxLength={limits.organizationDescription}
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
