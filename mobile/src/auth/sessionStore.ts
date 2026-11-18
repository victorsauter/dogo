import * as SecureStore from 'expo-secure-store';

import type { AuthResponse, SessionUser } from '@/api/types';

/** What is kept on the device between launches. */
export interface Session {
  accessToken: string;
  /** Epoch milliseconds. */
  accessTokenExpiresAt: number;
  refreshToken: string;
  user: SessionUser;
}

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

export interface SessionSnapshot {
  status: SessionStatus;
  session: Session | null;
}

export interface SecureStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const SESSION_STORAGE_KEY = 'dogo.session';

export function sessionFromAuthResponse(response: AuthResponse): Session {
  const expiresAt = Date.parse(response.accessTokenExpiresAt);
  return {
    accessToken: response.accessToken,
    // An unparsable date is treated as already expired, forcing a refresh.
    accessTokenExpiresAt: Number.isNaN(expiresAt) ? 0 : expiresAt,
    refreshToken: response.refreshToken,
    user: response.user,
  };
}

function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Session>;
    if (
      typeof value.accessToken === 'string' &&
      typeof value.refreshToken === 'string' &&
      typeof value.accessTokenExpiresAt === 'number' &&
      value.user &&
      typeof value.user.id === 'string'
    ) {
      return value as Session;
    }
  } catch {
    // Corrupted entry: behave as signed out.
  }
  return null;
}

/**
 * Session store, independent of React so that the API client can read and
 * update tokens outside components. Persisted in the device secure storage.
 * React reads it through `SessionProvider` / `useSession()`.
 */
export function createSessionStore(storage: SecureStorage = SecureStore) {
  let snapshot: SessionSnapshot = { status: 'loading', session: null };
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  function emit(next: SessionSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  return {
    getSnapshot: (): SessionSnapshot => snapshot,
    getSession: (): Session | null => snapshot.session,

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Reads the persisted session once; later calls return the same promise. */
    load(): Promise<void> {
      loading ??= (async () => {
        let session: Session | null = null;
        try {
          session = parseSession(await storage.getItemAsync(SESSION_STORAGE_KEY));
        } catch {
          session = null;
        }
        // A sign-in that happened while loading wins over the stored value.
        if (snapshot.status === 'loading') {
          emit({ status: session ? 'signedIn' : 'signedOut', session });
        }
      })();
      return loading;
    },

    async set(response: AuthResponse): Promise<Session> {
      const session = sessionFromAuthResponse(response);
      emit({ status: 'signedIn', session });
      await storage.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(session));
      return session;
    },

    /** Replaces the user of the current session (profile edited); tokens are kept. */
    async updateUser(user: SessionUser): Promise<void> {
      const current = snapshot.session;
      if (!current) return;
      const session = { ...current, user };
      emit({ status: 'signedIn', session });
      await storage.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(session));
    },

    async clear(): Promise<void> {
      emit({ status: 'signedOut', session: null });
      await storage.deleteItemAsync(SESSION_STORAGE_KEY);
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;

/** The app-wide store. Tests create their own with `createSessionStore()`. */
export const sessionStore = createSessionStore();
