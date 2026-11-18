import createClient from 'openapi-fetch';

import { sessionStore } from '@/auth/sessionStore';
import { config } from '@/lib/config';

import { createAuthFetch } from './authFetch';
import { toApiError } from './errors';
import type { paths } from './schema';

/** Authenticated fetch bound to the app session. */
export const authFetch = createAuthFetch({ store: sessionStore, apiUrl: config.apiUrl });

/**
 * Typed API client generated from `api/openapi.json`. Paths include the
 * `/api/v1` prefix, e.g. `api.GET('/api/v1/me')`.
 */
export const api = createClient<paths>({
  baseUrl: config.apiUrl,
  fetch: (request) => authFetch(request),
});

/**
 * Awaits an openapi-fetch call and returns its data, or throws an `ApiError`.
 * Use it in every query and mutation function:
 * `queryFn: () => unwrap(api.GET('/api/v1/me'))`.
 */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await call;
  } catch (error) {
    throw toApiError(error);
  }
  if (!result.response.ok) throw toApiError(result.error, result.response);
  return result.data as T;
}
