/**
 * Hand-written API shapes needed before the schema is generated.
 * Only the session contract lives here (sign-in and refresh responses); every
 * other type comes from `schema.d.ts`.
 */
import type { UserStatus } from './enums';

/** `user` in the session response (private profile of the signed-in user). */
export interface SessionUser {
  id: string;
  displayName: string;
  bio: string | null;
  /** Relative path (`/photos/...`); display it through `photoUri()`. */
  photoUrl: string | null;
  email: string | null;
  status: UserStatus;
  isAdmin: boolean;
  createdAt: string;
}

/** Response of `POST /api/v1/auth/{apple,google,dev,refresh}`. */
export interface AuthResponse {
  accessToken: string;
  /** ISO 8601, UTC. Access tokens last 15 minutes. */
  accessTokenExpiresAt: string;
  /** Rotated on every use: always store the latest one. */
  refreshToken: string;
  user: SessionUser;
}

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
