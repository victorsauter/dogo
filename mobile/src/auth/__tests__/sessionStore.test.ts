import * as SecureStore from 'expo-secure-store';

import { authResponse } from '@/test/fixtures';

import { createSessionStore, SESSION_STORAGE_KEY } from '../sessionStore';

describe('session store', () => {
  it('starts loading, then is signed out when nothing is stored', async () => {
    const store = createSessionStore();
    expect(store.getSnapshot().status).toBe('loading');
    await store.load();
    expect(store.getSnapshot()).toEqual({ status: 'signedOut', session: null });
  });

  it('persists the session in secure storage and restores it', async () => {
    const response = authResponse();
    const first = createSessionStore();
    await first.load();
    await first.set(response);

    expect(first.getSnapshot().status).toBe('signedIn');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SESSION_STORAGE_KEY, expect.any(String));

    const second = createSessionStore();
    await second.load();
    expect(second.getSession()).toEqual({
      accessToken: response.accessToken,
      accessTokenExpiresAt: Date.parse(response.accessTokenExpiresAt),
      refreshToken: response.refreshToken,
      user: response.user,
    });
  });

  it('clears the session from memory and storage', async () => {
    const store = createSessionStore();
    await store.set(authResponse());
    await store.clear();
    expect(store.getSnapshot()).toEqual({ status: 'signedOut', session: null });
    expect(await SecureStore.getItemAsync(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('ignores a corrupted stored value', async () => {
    await SecureStore.setItemAsync(SESSION_STORAGE_KEY, '{not json');
    const store = createSessionStore();
    await store.load();
    expect(store.getSnapshot().status).toBe('signedOut');
  });

  it('keeps a sign-in that happens while the stored session is loading', async () => {
    const store = createSessionStore();
    const loading = store.load();
    await store.set(authResponse());
    await loading;
    expect(store.getSnapshot().status).toBe('signedIn');
  });

  it('notifies subscribers of every change', async () => {
    const store = createSessionStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    await store.load();
    await store.set(authResponse());
    unsubscribe();
    await store.clear();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
