/**
 * API shapes used across the app, taken from the generated `schema.d.ts`
 * (`api/openapi.json`). Only RFC 9457 problem details keep a local shape, with
 * the dogo `code` extension (spec §1), because errors are read loosely.
 */
import type { components } from './schema';

type Schemas = components['schemas'];

/** `user` in the session response: private profile of the signed-in user. */
export type SessionUser = Schemas['MeResponse'];

/** Response of `POST /api/v1/auth/{apple,google,dev,refresh}`. */
export type AuthResponse = Schemas['SessionResponse'];

export type Dog = Schemas['DogResponse'];
export type PublicUser = Schemas['PublicUserResponse'];
export type CreateDogRequest = Schemas['CreateDogRequest'];
export type UpdateDogRequest = Schemas['UpdateDogRequest'];

export type GeoPoint = Schemas['GeoPoint'];
export type UserSummary = Schemas['UserSummaryResponse'];
export type WalkSearchResult = Schemas['WalkSearchResult'];
export type WalkDetail = Schemas['WalkDetailResponse'];
export type MyWalk = Schemas['MyWalkResponse'];
export type Participant = Schemas['ParticipantResponse'];
export type MyRegistration = Schemas['MyRegistrationResponse'];
export type Registration = Schemas['RegistrationResponse'];
export type CreateWalkRequest = Schemas['CreateWalkRequest'];
export type UpdateWalkRequest = Schemas['UpdateWalkRequest'];

/** Fields every walk shape shares (search result, my walks, detail): what `WalkCard` shows. */
export type WalkSummary = Pick<
  WalkSearchResult,
  | 'id'
  | 'title'
  | 'startsAt'
  | 'durationMinutes'
  | 'location'
  | 'locationLabel'
  | 'maxDogs'
  | 'acceptedDogsCount'
  | 'allowedSizes'
  | 'leashRule'
  | 'access'
  | 'status'
  | 'organizer'
  | 'isProfessional'
  | 'organization'
  | 'hasBlockedParticipant'
> & {
  distanceMeters?: number;
  myRegistrations?: MyRegistration[];
};

/** RFC 9457 problem details, with the dogo `code` extension (spec §1). */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  /** Validation errors: field name → messages. */
  errors?: Record<string, string[]>;
}
