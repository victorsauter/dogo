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

/**
 * Why a session ended without the person asking for it: the API refused the
 * session (`expired`: refresh token invalid or revoked, or a 401 that persists
 * after a refresh) or the account is suspended (`suspended`). Absent for a
 * sign-out or an account deletion.
 */
export type SessionEndReason = 'expired' | 'suspended';

export interface SessionSnapshot {
  status: SessionStatus;
  session: Session | null;
  /** Set only on the signed-out snapshot that follows an imposed end of session. */
  endReason?: SessionEndReason;
}

export interface SecureStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

// Storage keys start with `uzu.` (ADR 0041). The old `dogo.` keys are not migrated: no build was ever distributed, and the new bundle identifier makes a new app anyway.
export const SESSION_STORAGE_KEY = 'uzu.session';

/** Attempts of a secure storage operation before giving up (the keychain can fail transiently). */
const STORAGE_ATTEMPTS = 3;

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

/** Runs `task` up to `STORAGE_ATTEMPTS` times; true when one attempt succeeded. */
async function withRetry(what: string, task: () => Promise<void>): Promise<boolean> {
  for (let attempt = 1; attempt <= STORAGE_ATTEMPTS; attempt += 1) {
    try {
      await task();
      return true;
    } catch (error) {
      if (attempt === STORAGE_ATTEMPTS && __DEV__) {
        console.warn(`Secure storage: ${what} failed after ${STORAGE_ATTEMPTS} attempts`, error);
      }
    }
  }
  return false;
}

/**
 * Session store, independent of React so that the API client can read and
 * update tokens outside components. Persisted in the device secure storage.
 * React reads it through `SessionProvider` / `useSession()`.
 *
 * The in-memory snapshot is the truth and is published first, synchronously:
 * concurrent requests use new tokens at once, and a sign-out takes effect
 * even if the keychain is slow or failing. Storage operations then run one
 * at a time, in call order, so the stored value always ends up matching the
 * last published state (a sign-out during a refresh write can never bring
 * the session back at the next launch). They never reject: a failure is
 * retried, then reported in development, and the session stays in memory.
 */
export function createSessionStore(storage: SecureStorage = SecureStore) {
  let snapshot: SessionSnapshot = { status: 'loading', session: null };
  let loading: Promise<void> | null = null;
  let queue: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();

  function emit(next: SessionSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  /** Runs a storage operation after the previous ones. */
  function enqueue(operation: () => Promise<void>): Promise<void> {
    queue = queue.then(operation, operation);
    return queue;
  }

  /** Removes the stored session; falls back to overwriting it with an empty (signed-out) value. */
  async function erase(): Promise<void> {
    if (await withRetry('delete', () => storage.deleteItemAsync(SESSION_STORAGE_KEY))) return;
    await withRetry('overwrite', () => storage.setItemAsync(SESSION_STORAGE_KEY, ''));
  }

  /**
   * Stores `session`. When the write keeps failing, the stored entry may still
   * hold an older refresh token, and presenting it at the next launch would
   * revoke every session of the user (ADR 0009): it is erased instead, so the
   * next launch is simply signed out. This launch keeps the session in memory.
   */
  function persist(session: Session): Promise<void> {
    return enqueue(async () => {
      const value = JSON.stringify(session);
      if (await withRetry('write', () => storage.setItemAsync(SESSION_STORAGE_KEY, value))) return;
      await erase();
    });
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

    /** Publishes a session (sign-in or refresh), then stores it. Never rejects. */
    async set(response: AuthResponse): Promise<Session> {
      const session = sessionFromAuthResponse(response);
      emit({ status: 'signedIn', session });
      await persist(session);
      return session;
    },

    /** Replaces the user of the current session (profile edited); tokens are kept. */
    async updateUser(user: SessionUser): Promise<void> {
      const current = snapshot.session;
      if (!current) return;
      const session = { ...current, user };
      emit({ status: 'signedIn', session });
      await persist(session);
    },

    /**
     * Signs out in memory at once, then erases the stored session. Never
     * rejects. `reason` explains an end of session the person did not ask for.
     */
    async clear(reason?: SessionEndReason): Promise<void> {
      emit(
        reason
          ? { status: 'signedOut', session: null, endReason: reason }
          : { status: 'signedOut', session: null },
      );
      await enqueue(erase);
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;

/** The app-wide store. Tests create their own with `createSessionStore()`. */
export const sessionStore = createSessionStore();
