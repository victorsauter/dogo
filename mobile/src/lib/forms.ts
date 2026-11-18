import { ApiError } from '@/api/errors';
import type { CreateDogRequest, Dog, UpdateDogRequest } from '@/api/types';
import type { DogSize, LeashHabit, Reactivity, Sociability } from '@/api/enums';
import { format, t } from '@/strings';

import { parseBirthDate, toApiDate } from './age';

/** Limits of the API (`api/openapi.json`): keep in sync with the request schemas. */
export const limits = {
  displayName: 50,
  bio: 500,
  dogName: 50,
  dogBreed: 80,
  dogDescription: 1000,
} as const;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

const tooLong = (max: number) => format(t.common.tooLong, { max });

/**
 * Maps `validation.failed` field errors of the API to a French message per
 * form field. Server messages are not translated, so a generic one is shown.
 * Field names are JSON names (`displayName`), sometimes PascalCase.
 */
export function serverFieldErrors<K extends string>(error: unknown, fields: readonly K[]) {
  const errors: FieldErrors<K> = {};
  if (!(error instanceof ApiError)) return errors;
  for (const name of Object.keys(error.fieldErrors)) {
    const key = (name.charAt(0).toLowerCase() + name.slice(1)) as K;
    if (fields.includes(key)) errors[key] = t.common.fieldInvalid;
  }
  return errors;
}

// ---- Profile

export interface ProfileFormValues {
  displayName: string;
  bio: string;
}

export const profileFields = ['displayName', 'bio'] as const;

export function validateProfile(values: ProfileFormValues) {
  const errors: FieldErrors<keyof ProfileFormValues> = {};
  const name = values.displayName.trim();
  if (!name) errors.displayName = t.common.required;
  else if (name.length > limits.displayName) errors.displayName = tooLong(limits.displayName);
  if (values.bio.trim().length > limits.bio) errors.bio = tooLong(limits.bio);
  return errors;
}

// ---- Dog

export interface DogFormValues {
  name: string;
  size: DogSize | null;
  sociability: Sociability | null;
  reactivity: Reactivity | null;
  leashHabit: LeashHabit | null;
  birthDate: Date | null;
  breed: string;
  description: string;
}

export const dogFields = [
  'name',
  'size',
  'sociability',
  'reactivity',
  'leashHabit',
  'birthDate',
  'breed',
  'description',
] as const;

export const emptyDogForm: DogFormValues = {
  name: '',
  size: null,
  sociability: null,
  reactivity: null,
  leashHabit: null,
  birthDate: null,
  breed: '',
  description: '',
};

export function dogFormFrom(dog: Dog): DogFormValues {
  return {
    name: dog.name,
    size: dog.size,
    sociability: dog.sociability,
    reactivity: dog.reactivity,
    leashHabit: dog.leashHabit,
    birthDate: dog.birthDate ? parseBirthDate(dog.birthDate) : null,
    breed: dog.breed ?? '',
    description: dog.description,
  };
}

export function validateDog(values: DogFormValues, now: Date = new Date()) {
  const errors: FieldErrors<keyof DogFormValues> = {};
  const name = values.name.trim();
  if (!name) errors.name = t.common.required;
  else if (name.length > limits.dogName) errors.name = tooLong(limits.dogName);
  if (!values.size) errors.size = t.common.required;
  if (!values.sociability) errors.sociability = t.common.required;
  if (!values.reactivity) errors.reactivity = t.common.required;
  if (!values.leashHabit) errors.leashHabit = t.common.required;
  if (values.birthDate) {
    // Compare calendar days: the picker may return today with a time of day.
    if (toApiDate(values.birthDate) > toApiDate(now)) errors.birthDate = t.dog.birthDateFuture;
  }
  if (values.breed.trim().length > limits.dogBreed) errors.breed = tooLong(limits.dogBreed);
  if (values.description.trim().length > limits.dogDescription) {
    errors.description = tooLong(limits.dogDescription);
  }
  return errors;
}

/** Body of `POST /dogs`: empty optional fields are left out. Call after `validateDog`. */
export function toCreateDogRequest(values: DogFormValues): CreateDogRequest {
  return {
    name: values.name.trim(),
    size: values.size!,
    sociability: values.sociability!,
    reactivity: values.reactivity!,
    leashHabit: values.leashHabit!,
    ...(values.birthDate ? { birthDate: toApiDate(values.birthDate) } : {}),
    ...(values.breed.trim() ? { breed: values.breed.trim() } : {}),
    ...(values.description.trim() ? { description: values.description.trim() } : {}),
  };
}

/**
 * Body of `PATCH /dogs/{id}`: every field is sent. `null` clears `birthDate`
 * and `breed`, an empty string clears `description` (API semantics).
 */
export function toUpdateDogRequest(values: DogFormValues): UpdateDogRequest {
  return {
    ...toCreateDogRequest(values),
    birthDate: values.birthDate ? toApiDate(values.birthDate) : null,
    breed: values.breed.trim() || null,
    description: values.description.trim(),
  };
}
