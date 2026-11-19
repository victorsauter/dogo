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
  ReportType,
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
  organizationNameMin: 3,
  organizationName: 80,
  organizationDescription: 2000,
  organizationCity: 80,
  reportFactsMin: 10,
  reportFacts: 4000,
} as const;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

const tooLong = (max: number) => format(t.common.tooLong, { max });

/** Refusals (409) that name one form field, by their `code`. */
const fieldOfCode: Record<string, string> = {
  'dog.size_in_use': 'size',
};

/**
 * True when the refusal is already shown on its field (see `serverFieldErrors`):
 * the form then shows no second message under the button.
 */
export function isFieldRefusal(error: unknown): boolean {
  return error instanceof ApiError && error.code !== undefined && error.code in fieldOfCode;
}

/**
 * Maps `validation.failed` field errors of the API to a French message per
 * form field. Server messages are not translated, so a generic one is shown.
 * Field names are JSON names (`displayName`), sometimes PascalCase, and nested
 * ones point to their root field (`location.latitude` → `location`).
 */
export function serverFieldErrors<K extends string>(error: unknown, fields: readonly K[]) {
  const errors: FieldErrors<K> = {};
  if (!(error instanceof ApiError)) return errors;
  // A refusal that belongs to one field (`dog.size_in_use` → the size): its own message, on the field.
  const owner = error.code ? fieldOfCode[error.code] : undefined;
  if (owner && fields.includes(owner as K)) errors[owner as K] = error.message;
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

// ---- Organization

export interface OrganizationFormValues {
  name: string;
  description: string;
  city: string;
}

export const organizationFields = ['name', 'description', 'city'] as const;

export function validateOrganization(values: OrganizationFormValues) {
  const errors: FieldErrors<keyof OrganizationFormValues> = {};
  const name = values.name.trim();
  if (!name) errors.name = t.common.required;
  else if (name.length < limits.organizationNameMin || name.length > limits.organizationName) {
    errors.name = format(t.organization.nameLength, {
      min: limits.organizationNameMin,
      max: limits.organizationName,
    });
  }
  if (values.description.trim().length > limits.organizationDescription) {
    errors.description = tooLong(limits.organizationDescription);
  }
  if (values.city.trim().length > limits.organizationCity) {
    errors.city = tooLong(limits.organizationCity);
  }
  return errors;
}

// ---- Report

export interface ReportFormValues {
  type: ReportType | null;
  facts: string;
}

export const reportFields = ['type', 'facts'] as const;

export function validateReport(values: ReportFormValues) {
  const errors: FieldErrors<keyof ReportFormValues> = {};
  if (!values.type) errors.type = t.report.typeRequired;
  const facts = values.facts.trim().length;
  if (facts < limits.reportFactsMin || facts > limits.reportFacts) {
    errors.facts = format(t.report.factsLength, {
      min: limits.reportFactsMin,
      max: limits.reportFacts,
    });
  }
  return errors;
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
  /** Creation only: a new walk is created every week (spec §4.5). */
  repeatWeekly: boolean;
  /** Creation only: the organisation the walk is organised for; `null` for myself (spec §4.6). */
  organizationId: string | null;
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
    repeatWeekly: false,
    organizationId: null,
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
    repeatWeekly: walk.repeatsWeekly,
    organizationId: walk.organization?.id ?? null,
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
    repeatWeekly: values.repeatWeekly,
    ...(values.organizationId ? { organizationId: values.organizationId } : {}),
  };
}

/**
 * Body of `PATCH /walks/{id}`: every field is sent; empty strings clear
 * description and rules. The series and the organisation are fixed at creation.
 */
export function toUpdateWalkRequest(values: WalkFormValues): UpdateWalkRequest {
  const {
    repeatWeekly: _repeatWeekly,
    organizationId: _organizationId,
    ...request
  } = toCreateWalkRequest(values);
  return request;
}
