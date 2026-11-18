import { createSessionStore, type SessionStore } from '@/auth/sessionStore';
import { authResponse, jsonResponse, problemResponse } from '@/test/fixtures';

import { createAuthFetch } from '../authFetch';

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
    expect(store.getSnapshot()).toEqual({ status: 'signedOut', session: null });
    expect(server.requests).toHaveLength(2);
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
