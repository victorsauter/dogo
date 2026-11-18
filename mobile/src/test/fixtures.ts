import type { AuthResponse, SessionUser } from '@/api/types';

export const testUser: SessionUser = {
  id: '6f1d3c1e-0000-4000-8000-000000000001',
  displayName: 'Léa Martin',
  bio: null,
  photoUrl: null,
  email: 'lea@example.test',
  status: 'Active',
  isAdmin: false,
  createdAt: '2026-11-01T10:00:00Z',
};

let counter = 0;

/** A sign-in/refresh response whose access token expires `expiresInMs` after `now`. */
export function authResponse(
  options: { expiresInMs?: number; now?: number; user?: Partial<SessionUser> } = {},
): AuthResponse {
  counter += 1;
  const now = options.now ?? Date.now();
  return {
    accessToken: `access-${counter}`,
    accessTokenExpiresAt: new Date(now + (options.expiresInMs ?? 15 * 60_000)).toISOString(),
    refreshToken: `refresh-${counter}`,
    user: { ...testUser, ...options.user },
  };
}

export function jsonResponse(body: unknown, status = 200, contentType = 'application/json') {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
}

export function problemResponse(status: number, code?: string, extra: object = {}) {
  return jsonResponse(
    { type: 'about:blank', title: 'Problem', status, ...(code ? { code } : {}), ...extra },
    status,
    'application/problem+json',
  );
}
