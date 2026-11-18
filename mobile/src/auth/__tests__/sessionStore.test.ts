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

  it('updates the user and keeps the tokens, in memory and in storage', async () => {
    const response = authResponse();
    const store = createSessionStore();
    await store.load();
    await store.updateUser({ ...response.user, displayName: 'Nouveau nom' });

    expect(store.getSession()).toBeNull(); // nothing to update when signed out

    await store.set(response);
    await store.updateUser({ ...response.user, displayName: 'Nouveau nom' });
    expect(store.getSession()?.user.displayName).toBe('Nouveau nom');
    expect(store.getSession()?.refreshToken).toBe(response.refreshToken);

    const restored = createSessionStore();
    await restored.load();
    expect(restored.getSession()?.user.displayName).toBe('Nouveau nom');
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

  it('records why a session was ended, only when it was imposed', async () => {
    const store = createSessionStore();
    await store.set(authResponse());
    await store.clear('suspended');
    expect(store.getSnapshot()).toEqual({
      status: 'signedOut',
      session: null,
      endReason: 'suspended',
    });
    await store.set(authResponse());
    await store.clear();
    expect(store.getSnapshot().endReason).toBeUndefined();
  });
});

/** In-memory secure storage whose operations can be made to fail. */
function flakyStorage() {
  const values = new Map<string, string>();
  const failures = { set: 0, delete: 0 };
  const storage = {
    values,
    failures,
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      if (failures.set > 0) {
        failures.set -= 1;
        throw new Error('Keychain unavailable');
      }
      values.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      if (failures.delete > 0) {
        failures.delete -= 1;
        throw new Error('Keychain unavailable');
      }
      values.delete(key);
    }),
  };
  return storage;
}

const storedRefreshToken = (storage: ReturnType<typeof flakyStorage>) => {
  const raw = storage.values.get(SESSION_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as { refreshToken: string }).refreshToken : null;
};

describe('session store persistence failures', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('retries a failed write of the renewed session', async () => {
    const storage = flakyStorage();
    const store = createSessionStore(storage);
    await store.set(authResponse());
    const renewed = authResponse();
    storage.failures.set = 2;

    await store.set(renewed);

    expect(storage.setItemAsync).toHaveBeenCalledTimes(4);
    expect(storedRefreshToken(storage)).toBe(renewed.refreshToken);
  });

  it('never leaves the old refresh token stored when the write keeps failing', async () => {
    const storage = flakyStorage();
    const store = createSessionStore(storage);
    await store.set(authResponse());
    const renewed = authResponse();
    storage.failures.set = 10;

    await expect(store.set(renewed)).resolves.toMatchObject({
      refreshToken: renewed.refreshToken,
    });

    // Kept in memory for this launch; the stale entry is gone, so the next
    // launch is signed out instead of presenting a revoked token (ADR 0009).
    expect(store.getSession()?.refreshToken).toBe(renewed.refreshToken);
    expect(storage.values.has(SESSION_STORAGE_KEY)).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it('signs out in memory even when the stored session cannot be deleted', async () => {
    const storage = flakyStorage();
    const store = createSessionStore(storage);
    await store.set(authResponse());
    storage.failures.delete = 10;

    await expect(store.clear()).resolves.toBeUndefined();

    expect(store.getSnapshot().status).toBe('signedOut');
    // Fallback: the entry is overwritten with an empty, signed-out value.
    const restored = createSessionStore(storage);
    await restored.load();
    expect(restored.getSnapshot().status).toBe('signedOut');
  });

  it('applies storage writes in call order: a sign-out during a refresh write wins', async () => {
    const storage = flakyStorage();
    const store = createSessionStore(storage);
    await store.set(authResponse());
    let releaseWrite!: () => void;
    storage.setItemAsync.mockImplementationOnce(
      (key, value) =>
        new Promise<void>((resolve) => {
          releaseWrite = () => {
            storage.values.set(key, value);
            resolve();
          };
        }),
    );

    const refreshing = store.set(authResponse());
    const clearing = store.clear();
    expect(store.getSnapshot().status).toBe('signedOut');
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseWrite();
    await Promise.all([refreshing, clearing]);

    expect(store.getSnapshot().status).toBe('signedOut');
    expect(storage.values.has(SESSION_STORAGE_KEY)).toBe(false);
  });
});
