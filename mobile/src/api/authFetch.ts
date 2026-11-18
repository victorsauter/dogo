import type { SessionStore } from '@/auth/sessionStore';

import { ApiError, apiErrorFromResponse } from './errors';
import type { AuthResponse } from './types';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface AuthFetchOptions {
  store: SessionStore;
  /** API base URL, without trailing slash. */
  apiUrl: string;
  /** Underlying fetch (defaults to the global one). Injected in tests. */
  fetch?: FetchLike;
  /** Clock, injected in tests. */
  now?: () => number;
  /** Refresh the access token when it expires in less than this (default 60 s). */
  refreshMarginMs?: number;
}

/** `/api/v1/auth/*` endpoints never carry the access token and never trigger a refresh. */
const AUTH_PATH = /\/api\/v1\/auth\//;

function withBearer(request: Request, token: string | null): Request {
  if (!token) return request;
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return new Request(request, { headers });
}

/**
 * Wraps `fetch` to authenticate API calls with the session:
 * - attaches `Authorization: Bearer <accessToken>`;
 * - refreshes the access token shortly before it expires (proactive) and when
 *   a call answers 401 (reactive), then replays the call once;
 * - shares one in-flight refresh between concurrent calls (refresh tokens
 *   rotate on every use, so two parallel refreshes would invalidate each other);
 * - signs the user out when the API rejects the refresh token. A network or
 *   server failure during refresh keeps the session (the user may be offline).
 */
export function createAuthFetch(options: AuthFetchOptions) {
  const { store, apiUrl, now = Date.now, refreshMarginMs = 60_000 } = options;
  const baseFetch: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  let inFlightRefresh: Promise<string | null> | null = null;

  async function performRefresh(): Promise<string | null> {
    const session = store.getSession();
    if (!session) return null;

    let response: Response;
    try {
      response = await baseFetch(`${apiUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
    } catch (cause) {
      throw new ApiError({ kind: 'network', cause });
    }

    // Signed out (or signed in again) meanwhile: drop this result.
    if (store.getSession()?.refreshToken !== session.refreshToken) {
      return store.getSession()?.accessToken ?? null;
    }

    if (response.ok) {
      const body = (await response.json()) as AuthResponse;
      return (await store.set(body)).accessToken;
    }
    if (response.status >= 500) throw await apiErrorFromResponse(response);

    await store.clear();
    return null;
  }

  /** Refreshes the session; concurrent callers share the same request. */
  function refresh(): Promise<string | null> {
    inFlightRefresh ??= performRefresh().finally(() => {
      inFlightRefresh = null;
    });
    return inFlightRefresh;
  }

  async function currentAccessToken(): Promise<string | null> {
    const session = store.getSession();
    if (!session) return null;
    if (session.accessTokenExpiresAt - now() > refreshMarginMs) return session.accessToken;
    try {
      return await refresh();
    } catch {
      // Refresh unreachable: try the current token, the call will report the failure.
      return session.accessToken;
    }
  }

  return async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
    const request = new Request(input, init);
    if (AUTH_PATH.test(request.url)) return baseFetch(request);

    const token = await currentAccessToken();
    const replay = token ? request.clone() : null;
    const response = await baseFetch(withBearer(request, token));
    if (response.status !== 401 || !token || !replay) return response;

    const latest = store.getSession();
    let nextToken: string | null;
    if (latest && latest.accessToken !== token) {
      // Another call refreshed the session while this one was in flight.
      nextToken = latest.accessToken;
    } else {
      try {
        nextToken = await refresh();
      } catch {
        return response;
      }
    }
    if (!nextToken) return response;
    return baseFetch(withBearer(replay, nextToken));
  };
}

/** Revokes a refresh token (`POST /api/v1/auth/logout`). Best effort: errors are ignored. */
export async function revokeRefreshToken(
  apiUrl: string,
  refreshToken: string,
  fetchImpl: FetchLike = (input, init) => globalThis.fetch(input, init),
): Promise<void> {
  try {
    await fetchImpl(`${apiUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Offline: the token will expire on its own.
  }
}
