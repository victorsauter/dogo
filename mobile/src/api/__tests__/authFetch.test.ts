import { createSessionStore, type SessionStore } from '@/auth/sessionStore';
import { t } from '@/strings';
import { authResponse, jsonResponse, problemResponse } from '@/test/fixtures';

import { createAuthFetch, revokeRefreshToken } from '../authFetch';
import { ApiError } from '../errors';

const API = 'http://api.test';
const NOW = Date.parse('2026-11-18T10:00:00Z');

type Handler = (request: Request) => Response | Promise<Response>;

/** Fake server: records requests and answers with `handler`. */
function fakeFetch(handler: Handler) {
  const requests: Request[] = [];
  const fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request.clone());
    return handler(request);
  });
  return { fetch, requests };
}

const isRefresh = (request: Request) => request.url === `${API}/api/v1/auth/refresh`;
const bearer = (request: Request) => request.headers.get('Authorization');

async function signedInStore(expiresInMs: number): Promise<SessionStore> {
  const store = createSessionStore();
  await store.set(authResponse({ now: NOW, expiresInMs }));
  return store;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('authFetch', () => {
  it('attaches the access token', async () => {
    const store = await signedInStore(10 * 60_000);
    const server = fakeFetch(() => jsonResponse({ ok: true }));
    const authFetch = createAuthFetch({ store, apiUrl: API, fetch: server.fetch, now: () => NOW });

    const response = await authFetch(`${API}/api/v1/me`);

    expect(response.status).toBe(200);
    expect(server.requests).toHaveLength(1);
    expect(bearer(server.requests[0]!)).toBe(`Bearer ${store.getSession()!.accessToken}`);
  });

  it('sends no token when signed out, and none to /auth endpoints', async () => {
    const store = createSessionStore();
    await store.load();
    const server = fakeFetch(() => jsonResponse({}));
    const authFetch = createAuthFetch({ store, apiUrl: API, fetch: server.fetch, now: () => NOW });

    await authFetch(`${API}/api/v1/health`);
    await store.set(authResponse({ now: NOW }));
    await authFetch(`${API}/api/v1/auth/dev`, { method: 'POST', body: '{}' });

    expect(server.requests.map(bearer)).toEqual([null, null]);
  });

  it('refreshes proactively when the token is about to expire', async () => {
    const store = await signedInStore(30_000);
    const oldRefreshToken = store.getSession()!.refreshToken;
    const refreshed = authResponse({ now: NOW });
    const server = fakeFetch((request) =>
      isRefresh(request) ? jsonResponse(refreshed) : jsonResponse({ ok: true }),
    );
    const authFetch = createAuthFetch({ store, apiUrl: API, fetch: server.fetch, now: () => NOW });

    await authFetch(`${API}/api/v1/me`);

    expect(server.requests.map((r) => r.url)).toEqual([
      `${API}/api/v1/auth/refresh`,
      `${API}/api/v1/me`,
    ]);
    expect(await server.requests[0]!.json()).toEqual({ refreshToken: oldRefreshToken });
    expect(bearer(server.requests[1]!)).toBe(`Bearer ${refreshed.accessToken}`);
    expect(store.getSession()!.refreshToken).toBe(refreshed.refreshToken);
  });

  it('refreshes on a 401 and replays the request with its body', async () => {
    const store = await signedInStore(10 * 60_000);
    const staleToken = store.getSession()!.accessToken;
    const refreshed = authResponse({ now: NOW });
    const server = fakeFetch((request) => {
      if (isRefresh(request)) return jsonResponse(refreshed);
      return bearer(request) === `Bearer ${staleToken}`
        ? problemResponse(401)
        : jsonResponse({ id: 'dog-1' }, 201);
    });
    const authFetch = createAuthFetch({ store, apiUrl: API, fetch: server.fetch, now: () => NOW });

    const response = await authFetch(`${API}/api/v1/dogs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Filou' }),
    });

    expect(response.status).toBe(201);
    expect(server.requests.map((r) => r.url)).toEqual([
      `${API}/api/v1/dogs`,
      `${API}/api/v1/auth/refresh`,
      `${API}/api/v1/dogs`,
    ]);
    const replay = server.requests[2]!;
    expect(replay.method).toBe('POST');
    expect(bearer(replay)).toBe(`Bearer ${refreshed.accessToken}`);
    expect(await replay.json()).toEqual({ name: 'Filou' });
  });

  it('shares one refresh between concurrent requests', async () => {
    const store = await signedInStore(30_000);
    const refreshed = authResponse({ now: NOW });
    const refreshAnswer = deferred<Response>();
    const server = fakeFetch((request) =>
      isRefresh(request) ? refreshAnswer.promise : jsonResponse({ ok: true }),
    );
    const authFetch = createAuthFetch({ store, apiUrl: API, fetch: server.fetch, now: () => NOW });

    const calls = Promise.all([
      authFetch(`${API}/api/v1/me`),
      authFetch(`${API}/api/v1/me/dogs`),
      authFetch(`${API}/api/v1/me/walks`),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    refreshAnswer.resolve(jsonResponse(refreshed));
    const responses = await calls;

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(server.requests.filter(isRefresh)).toHaveLength(1);
    const apiCalls = server.requests.filter((r) => !isRefresh(r));
    expect(apiCalls.map(bearer)).toEqual(Array(3).fill(`Bearer ${refreshed.accessToken}`));
  });

  it('shares one refresh between concurrent 401 responses', async () => {
    const store = await signedInStore(10 * 60_000);
    const staleToken = store.getSession()!.accessToken;
    const refreshed = authResponse({ now: NOW });
    const server = fakeFetch(async (request) => {
      if (isRefresh(request)) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return jsonResponse(refreshed);
      }
      return bearer(request) === `Bearer ${staleToken}` ? problemResponse(401) : jsonResponse({});
    });
    const authFetch = createAuthFetch({ store, apiUrl: API, fetch: server.fetch, now: () => NOW });

    const responses = await Promise.all([
      authFetch(`${API}/api/v1/me`),
      authFetch(`${API}/api/v1/me/dogs`),
    ]);

    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(server.requests.filter(isRefresh)).toHaveLength(1);
  });

  it('signs out when the refresh token is rejected', async () => {
    const store = await signedInStore(10 * 60_000);
    const server = fakeFetch((request) =>
      problemResponse(401, isRefresh(request) ? 'auth.invalid' : undefined),
    );
    const authFetch = createAuthFetch({ store, apiUrl: API, fetch: server.fetch, now: () => NOW });

    const response = await authFetch(`${API}/api/v1/me`);

    expect(response.status).toBe(401);
    expect(store.getSnapshot()).toEqual({
      status: 'signedOut',
      session: null,
      endReason: 'expired',
    });
    expect(server.requests).toHaveLength(2);
  });

  it('signs out with a dedicated reason when the account is suspended', async () => {
    const store = await signedInStore(30_000);
    const server = fakeFetch((request) =>
      isRefresh(request) ? problemResponse(403, 'account.suspended') : problemResponse(401),
    );
    const authFetch = createAuthFetch({ store, apiUrl: API, fetch: server.fetch, now: () => NOW });

    await authFetch(`${API}/api/v1/me`);

    expect(store.getSnapshot()).toEqual({
      status: 'signedOut',
      session: null,
      endReason: 'suspended',
    });
  });

  it.each([
    ['a 404 from a proxy', () => new Response('Not found', { status: 404 })],
    ['a 408', () => new Response('', { status: 408 })],
    ['a 413', () => new Response('', { status: 413 })],
    [
      'a 429 from the rate limiter',
      () =>
        jsonResponse({ status: 429, title: 'Too Many Requests' }, 429, 'application/problem+json'),
    ],
    ['a 403 without the suspension code', () => problemResponse(403)],
    ['a 503', () => problemResponse(503)],
  ])('keeps the session when the refresh gets %s', async (_label, answer) => {
    const store = await signedInStore(30_000);
    const session = store.getSession();
    const server = fakeFetch((request) => (isRefresh(request) ? answer() : jsonResponse({})));
    const authFetch = createAuthFetch({ store, apiUrl: API, fetch: server.fetch, now: () => NOW });

    const response = await authFetch(`${API}/api/v1/me`);

    expect(response.status).toBe(200);
    expect(store.getSnapshot()).toEqual({ status: 'signedIn', session });
  });

  it('reports a transient refresh failure after a 401, and keeps the session', async () => {
    const store = await signedInStore(10 * 60_000);
    const server = fakeFetch((request) =>
      isRefresh(request) ? new Response('', { status: 429 }) : problemResponse(401),
    );
    const authFetch = createAuthFetch({ store, apiUrl: API, fetch: server.fetch, now: () => NOW });

    const failure = await authFetch(`${API}/api/v1/me`).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(429);
    expect((failure as ApiError).message).toBe(t.errors.tooManyRequests);
    expect(store.getSnapshot().status).toBe('signedIn');
  });

  it('ends the session when a 401 persists after a successful refresh and replay', async () => {
    const store = await signedInStore(10 * 60_000);
    const server = fakeFetch((request) =>
      isRefresh(request) ? jsonResponse(authResponse({ now: NOW })) : problemResponse(401),
    );
    const authFetch = createAuthFetch({ store, apiUrl: API, fetch: server.fetch, now: () => NOW });

    const response = await authFetch(`${API}/api/v1/me`);

    expect(response.status).toBe(401);
    expect(server.requests.map((r) => r.url)).toEqual([
      `${API}/api/v1/me`,
      `${API}/api/v1/auth/refresh`,
      `${API}/api/v1/me`,
    ]);
    expect(store.getSnapshot()).toEqual({
      status: 'signedOut',
      session: null,
      endReason: 'expired',
    });
  });

  it('keeps the session when the refresh endpoint is unreachable', async () => {
    const store = await signedInStore(30_000);
    const token = store.getSession()!.accessToken;
    const server = fakeFetch((request) => {
      if (isRefresh(request)) throw new TypeError('Network request failed');
      return jsonResponse({});
    });
    const authFetch = createAuthFetch({ store, apiUrl: API, fetch: server.fetch, now: () => NOW });

    const response = await authFetch(`${API}/api/v1/me`);

    expect(response.status).toBe(200);
    expect(bearer(server.requests[1]!)).toBe(`Bearer ${token}`);
    expect(store.getSnapshot().status).toBe('signedIn');
  });
});

/** Never answers; rejects with the abort reason when the request is aborted. */
function hang(request: Request): Promise<Response> {
  return new Promise((_resolve, reject) => {
    request.signal.addEventListener('abort', () => reject(request.signal.reason));
  });
}

const after = (ms: number, response: () => Response) =>
  new Promise<Response>((resolve) => setTimeout(() => resolve(response()), ms));

describe('authFetch time limits', () => {
  it('turns a request that takes too long into a network ApiError', async () => {
    const store = await signedInStore(10 * 60_000);
    const server = fakeFetch(hang);
    const authFetch = createAuthFetch({
      store,
      apiUrl: API,
      fetch: server.fetch,
      now: () => NOW,
      timeoutMs: 20,
    });

    const failure = await authFetch(`${API}/api/v1/me`).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ kind: 'network', timedOut: true, message: t.errors.timeout });
    expect(store.getSnapshot().status).toBe('signedIn');
  });

  it('gives photo uploads a longer limit', async () => {
    const store = await signedInStore(10 * 60_000);
    const server = fakeFetch(() => after(60, () => jsonResponse({ ok: true })));
    const authFetch = createAuthFetch({
      store,
      apiUrl: API,
      fetch: server.fetch,
      now: () => NOW,
      timeoutMs: 20,
      uploadTimeoutMs: 1000,
    });

    const form = new FormData();
    form.append('file', new Blob(['jpeg']), 'photo.jpg');
    const upload = await authFetch(`${API}/api/v1/me/photo`, { method: 'PUT', body: form });
    expect(upload.status).toBe(200);

    await expect(authFetch(`${API}/api/v1/me`)).rejects.toMatchObject({ timedOut: true });
  });

  it('keeps a cancellation by the caller (TanStack Query) apart from a timeout', async () => {
    const store = await signedInStore(10 * 60_000);
    const server = fakeFetch(hang);
    const authFetch = createAuthFetch({ store, apiUrl: API, fetch: server.fetch, now: () => NOW });
    const controller = new AbortController();

    const call = authFetch(`${API}/api/v1/me`, { signal: controller.signal });
    controller.abort();
    const failure = await call.catch((error: unknown) => error);

    expect(failure).not.toBeInstanceOf(ApiError);
    expect((failure as Error).name).toBe('AbortError');
  });

  it('limits the refresh too, and keeps the session when it times out', async () => {
    const store = await signedInStore(30_000);
    const token = store.getSession()!.accessToken;
    const server = fakeFetch((request) => (isRefresh(request) ? hang(request) : jsonResponse({})));
    const authFetch = createAuthFetch({
      store,
      apiUrl: API,
      fetch: server.fetch,
      now: () => NOW,
      timeoutMs: 20,
    });

    const response = await authFetch(`${API}/api/v1/me`);

    expect(response.status).toBe(200);
    expect(bearer(server.requests[1]!)).toBe(`Bearer ${token}`);
    expect(store.getSnapshot().status).toBe('signedIn');
  });

  it('does not send a call with an expired token when the refresh times out', async () => {
    // Expired a minute ago: the call could only be refused.
    const store = await signedInStore(-60_000);
    const server = fakeFetch((request) => (isRefresh(request) ? hang(request) : jsonResponse({})));
    const authFetch = createAuthFetch({
      store,
      apiUrl: API,
      fetch: server.fetch,
      now: () => NOW,
      timeoutMs: 20,
    });

    const failure = await authFetch(`${API}/api/v1/walks`).catch((error: unknown) => error);

    // One time limit, not two: the refresh's failure is the answer.
    expect(failure).toMatchObject({ kind: 'network', timedOut: true });
    expect(server.requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/api/v1/auth/refresh',
    ]);
    expect(store.getSnapshot().status).toBe('signedIn');
  });

  it('never lets the revocation hang or throw', async () => {
    jest.useFakeTimers();
    try {
      const server = fakeFetch(hang);
      const revoked = revokeRefreshToken(API, 'refresh-1', server.fetch);
      await jest.advanceTimersByTimeAsync(20_000);
      await expect(revoked).resolves.toBeUndefined();
      expect(server.requests[0]!.url).toBe(`${API}/api/v1/auth/logout`);
    } finally {
      jest.useRealTimers();
    }
  });
});
