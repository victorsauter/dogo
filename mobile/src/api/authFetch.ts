import type { SessionStore } from '@/auth/sessionStore';

import { ApiError, apiErrorFromResponse } from './errors';
import type { AuthResponse } from './types';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Time limit of a request, until the response headers arrive. */
export const DEFAULT_TIMEOUT_MS = 20_000;
/** Time limit of a photo upload (`PUT /me/photo`, `PUT /dogs/{id}/photo`). */
export const UPLOAD_TIMEOUT_MS = 60_000;

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
  /** Time limit of a request (default `DEFAULT_TIMEOUT_MS`). */
  timeoutMs?: number;
  /** Time limit of a photo upload (default `UPLOAD_TIMEOUT_MS`). */
  uploadTimeoutMs?: number;
}

/** `/api/v1/auth/*` endpoints never carry the access token and never trigger a refresh. */
const AUTH_PATH = /\/api\/v1\/auth\//;
/** Photo uploads: multipart `PUT` on a `…/photo` resource. */
const PHOTO_PATH = /\/photo$/;

const globalFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

function withBearer(request: Request, token: string | null): Request {
  if (!token) return request;
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return new Request(request, { headers });
}

/** The error a cancelled request rejects with: the signal's reason, or an `AbortError`. */
function abortReason(signal: AbortSignal): unknown {
  return (
    signal.reason ?? Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })
  );
}

function isUpload(request: Request): boolean {
  if (request.method !== 'PUT' && request.method !== 'POST') return false;
  if (request.headers.get('Content-Type')?.startsWith('multipart/form-data')) return true;
  return PHOTO_PATH.test(request.url.split('?')[0] ?? '');
}

/**
 * Calls `fetchImpl` with a time limit, combined with the caller's own signal
 * (TanStack Query's cancellation, through the request). An `AbortController`
 * and a timer are used rather than `AbortSignal.timeout` / `AbortSignal.any`
 * (available in React Native 0.88): this tells a timeout apart from a
 * cancellation with certainty, whatever error `expo/fetch` throws on abort
 * (a `FetchError` « fetch failed: … » with the reason as `cause`).
 *
 * A timeout becomes a `network` `ApiError` (`timedOut`); a cancellation by the
 * caller is rethrown as is. The limit covers the wait for the response
 * headers; the body of an API response is small and read right after.
 */
export async function fetchWithTimeout(
  fetchImpl: FetchLike,
  input: Request | string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const upstream = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  if (upstream?.aborted) throw abortReason(upstream);

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let forwardAbort: (() => void) | undefined;
  // Settles as soon as the limit is reached or the caller cancels, even if the
  // underlying fetch were slow to honour the signal.
  const stopped = new Promise<never>((_resolve, reject) => {
    forwardAbort = () => {
      controller.abort(upstream?.reason);
      reject(abortReason(upstream!));
    };
    upstream?.addEventListener('abort', forwardAbort);
    timer = setTimeout(() => {
      const reason = Object.assign(new Error('The request timed out.'), { name: 'TimeoutError' });
      controller.abort(reason);
      reject(new ApiError({ kind: 'network', timedOut: true, cause: reason }));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fetchImpl(input, { ...init, signal: controller.signal }), stopped]);
  } finally {
    clearTimeout(timer);
    if (forwardAbort) upstream?.removeEventListener('abort', forwardAbort);
  }
}

/**
 * Wraps `fetch` to authenticate API calls with the session:
 * - attaches `Authorization: Bearer <accessToken>`;
 * - refreshes the access token shortly before it expires (proactive) and when
 *   a call answers 401 (reactive), then replays the call once;
 * - shares one in-flight refresh between concurrent calls (refresh tokens
 *   rotate on every use, so two parallel refreshes would invalidate each other);
 * - ends the session only when the API refuses it: `/auth/refresh` answers 401
 *   (token invalid or revoked) or 403 `account.suspended`, or the replayed call
 *   still answers 401. Anything else during a refresh (network, timeout, 5xx,
 *   429 or another status from a proxy) is transient and keeps the session;
 * - gives every request a time limit (`timeoutMs`, longer for photo uploads).
 */
export function createAuthFetch(options: AuthFetchOptions) {
  const {
    store,
    apiUrl,
    now = Date.now,
    refreshMarginMs = 60_000,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    uploadTimeoutMs = UPLOAD_TIMEOUT_MS,
  } = options;
  const baseFetch: FetchLike = options.fetch ?? globalFetch;
  let inFlightRefresh: Promise<string | null> | null = null;

  const send = (request: Request) =>
    fetchWithTimeout(
      baseFetch,
      request,
      undefined,
      isUpload(request) ? uploadTimeoutMs : timeoutMs,
    );

  async function performRefresh(): Promise<string | null> {
    const session = store.getSession();
    if (!session) return null;

    let response: Response;
    try {
      response = await fetchWithTimeout(
        baseFetch,
        `${apiUrl}/api/v1/auth/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        },
        timeoutMs,
      );
    } catch (cause) {
      throw cause instanceof ApiError ? cause : new ApiError({ kind: 'network', cause });
    }

    // Signed out (or signed in again) meanwhile: drop this result.
    if (store.getSession()?.refreshToken !== session.refreshToken) {
      return store.getSession()?.accessToken ?? null;
    }

    if (response.ok) {
      const body = (await response.json()) as AuthResponse;
      return (await store.set(body)).accessToken;
    }

    const error = await apiErrorFromResponse(response);
    if (error.status === 401) {
      await store.clear('expired');
      return null;
    }
    if (error.status === 403 && error.code === 'account.suspended') {
      await store.clear('suspended');
      return null;
    }
    // 5xx, 429, 404, 408, 413… from the API or a proxy: try again later.
    throw error;
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
    if (AUTH_PATH.test(request.url)) return send(request);

    const token = await currentAccessToken();
    const replay = token ? request.clone() : null;
    const response = await send(withBearer(request, token));
    if (response.status !== 401 || !token || !replay) return response;

    const latest = store.getSession();
    let nextToken: string | null;
    if (latest && latest.accessToken !== token) {
      // Another call refreshed the session while this one was in flight.
      nextToken = latest.accessToken;
    } else {
      // A transient refresh failure is reported as such (network, timeout,
      // « trop de demandes »), not as the 401 that triggered the refresh.
      nextToken = await refresh();
    }
    if (!nextToken) return response;

    const replayed = await send(withBearer(replay, nextToken));
    // Still refused with a fresh token: the session is no longer valid.
    if (replayed.status === 401 && store.getSession()?.accessToken === nextToken) {
      await store.clear('expired');
    }
    return replayed;
  };
}

/** Revokes a refresh token (`POST /api/v1/auth/logout`). Best effort: errors are ignored. */
export async function revokeRefreshToken(
  apiUrl: string,
  refreshToken: string,
  fetchImpl: FetchLike = globalFetch,
): Promise<void> {
  try {
    await fetchWithTimeout(
      fetchImpl,
      `${apiUrl}/api/v1/auth/logout`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      },
      DEFAULT_TIMEOUT_MS,
    );
  } catch {
    // Offline: the token will expire on its own.
  }
}
