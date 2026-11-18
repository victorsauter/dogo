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
