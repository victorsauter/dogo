import { ApiError } from '@/api/errors';
import type {
  CreateDogRequest,
  CreateWalkRequest,
  Dog,
  GeoPoint,
  UpdateDogRequest,
  UpdateWalkRequest,
  WalkDetail,
} from '@/api/types';
import type {
  DogSize,
  LeashHabit,
  LeashRule,
  Reactivity,
  Sociability,
  WalkAccess,
} from '@/api/enums';
import { format, t } from '@/strings';

import { parseBirthDate, toApiDate } from './age';

/** Limits of the API (`api/openapi.json`): keep in sync with the request schemas. */
export const limits = {
  displayName: 50,
  bio: 500,
  dogName: 50,
  dogBreed: 80,
  dogDescription: 1000,
  walkTitleMin: 3,
  walkTitle: 80,
  walkDescription: 2000,
  walkLocationLabel: 120,
  walkRules: 1000,
  walkDurationMin: 15,
  walkDurationMax: 480,
  walkDurationStep: 15,
  walkDogsMin: 1,
  walkDogsMax: 50,
} as const;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

const tooLong = (max: number) => format(t.common.tooLong, { max });

/**
 * Maps `validation.failed` field errors of the API to a French message per
 * form field. Server messages are not translated, so a generic one is shown.
 * Field names are JSON names (`displayName`), sometimes PascalCase, and nested
 * ones point to their root field (`location.latitude` → `location`).
 */
export function serverFieldErrors<K extends string>(error: unknown, fields: readonly K[]) {
  const errors: FieldErrors<K> = {};
  if (!(error instanceof ApiError)) return errors;
  for (const name of Object.keys(error.fieldErrors)) {
    const root = name.split(/[.[]/)[0] ?? name;
    const key = (root.charAt(0).toLowerCase() + root.slice(1)) as K;
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

// ---- Walk

export interface WalkFormValues {
  title: string;
  description: string;
  startsAt: Date;
  durationMinutes: number;
  location: GeoPoint;
  locationLabel: string;
  maxDogs: number;
  allowedSizes: DogSize[];
  leashRule: LeashRule;
  rules: string;
  access: WalkAccess;
}

export const walkFields = [
  'title',
  'description',
  'startsAt',
  'durationMinutes',
  'location',
  'locationLabel',
  'maxDogs',
  'allowedSizes',
  'leashRule',
  'rules',
  'access',
] as const;

/** Defaults of a new walk: one hour, six dogs, every size, leash required, open access. */
export function emptyWalkForm(location: GeoPoint, startsAt: Date): WalkFormValues {
  return {
    title: '',
    description: '',
    startsAt,
    durationMinutes: 60,
    location,
    locationLabel: '',
    maxDogs: 6,
    allowedSizes: ['Small', 'Medium', 'Large'],
    leashRule: 'LeashRequired',
    rules: '',
    access: 'Open',
  };
}

export function walkFormFrom(walk: WalkDetail): WalkFormValues {
  return {
    title: walk.title,
    description: walk.description,
    startsAt: new Date(walk.startsAt),
    durationMinutes: walk.durationMinutes,
    location: walk.location,
    locationLabel: walk.locationLabel,
    maxDogs: walk.maxDogs,
    allowedSizes: [...walk.allowedSizes],
    leashRule: walk.leashRule,
    rules: walk.rules,
    access: walk.access,
  };
}

const inRange = (value: number, min: number, max: number) =>
  Number.isInteger(value) && value >= min && value <= max;

/** Client validation mirroring `CreateWalkRequest` / `UpdateWalkRequest` of the API. */
export function validateWalk(values: WalkFormValues, now: Date = new Date()) {
  const errors: FieldErrors<keyof WalkFormValues> = {};
  const title = values.title.trim();
  if (!title) errors.title = t.common.required;
  else if (title.length < limits.walkTitleMin || title.length > limits.walkTitle) {
    errors.title = format(t.walk.titleLength, { min: limits.walkTitleMin, max: limits.walkTitle });
  }
  if (values.description.trim().length > limits.walkDescription) {
    errors.description = tooLong(limits.walkDescription);
  }
  if (Number.isNaN(values.startsAt.getTime())) errors.startsAt = t.common.required;
  else if (values.startsAt.getTime() <= now.getTime()) errors.startsAt = t.walk.startsAtPast;
  if (!inRange(values.durationMinutes, limits.walkDurationMin, limits.walkDurationMax)) {
    errors.durationMinutes = t.common.fieldInvalid;
  }
  const { latitude, longitude } = values.location;
  if (!(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180)) {
    errors.location = t.common.fieldInvalid;
  }
  const label = values.locationLabel.trim();
  if (!label) errors.locationLabel = t.common.required;
  else if (label.length > limits.walkLocationLabel) {
    errors.locationLabel = tooLong(limits.walkLocationLabel);
  }
  if (!inRange(values.maxDogs, limits.walkDogsMin, limits.walkDogsMax)) {
    errors.maxDogs = format(t.walk.countRange, {
      min: limits.walkDogsMin,
      max: limits.walkDogsMax,
    });
  }
  if (values.allowedSizes.length === 0) errors.allowedSizes = t.walk.sizesRequired;
  if (values.rules.trim().length > limits.walkRules) errors.rules = tooLong(limits.walkRules);
  return errors;
}

/** Body of `POST /walks`, sizes in their natural order. Call after `validateWalk`. */
export function toCreateWalkRequest(values: WalkFormValues): CreateWalkRequest {
  const order: DogSize[] = ['Small', 'Medium', 'Large'];
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    startsAt: values.startsAt.toISOString(),
    durationMinutes: values.durationMinutes,
    location: { latitude: values.location.latitude, longitude: values.location.longitude },
    locationLabel: values.locationLabel.trim(),
    maxDogs: values.maxDogs,
    allowedSizes: order.filter((size) => values.allowedSizes.includes(size)),
    leashRule: values.leashRule,
    rules: values.rules.trim(),
    access: values.access,
  };
}

/** Body of `PATCH /walks/{id}`: every field is sent; empty strings clear description and rules. */
export function toUpdateWalkRequest(values: WalkFormValues): UpdateWalkRequest {
  return toCreateWalkRequest(values);
}
