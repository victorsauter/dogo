import {
  createContext,
  use,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';

import { revokeRefreshToken } from '@/api/authFetch';
import type { AuthResponse, SessionUser } from '@/api/types';
import { config } from '@/lib/config';

import { setSignInNotice } from '@/lib/signInNotice';
import { t } from '@/strings';

import {
  sessionStore,
  type SessionEndReason,
  type SessionStatus,
  type SessionStore,
} from './sessionStore';

const endOfSessionNotice: Record<SessionEndReason, string> = {
  expired: t.auth.sessionExpired,
  suspended: t.auth.accountSuspended,
};

export interface SessionContextValue {
  status: SessionStatus;
  /** Signed-in user as returned at sign-in or last refresh; `null` when signed out. */
  user: SessionUser | null;
  /** Stores the response of a sign-in endpoint (`/auth/apple`, `/auth/google`, `/auth/dev`). */
  setSession(response: AuthResponse): Promise<void>;
  /** Updates the user kept in the session after a profile change (tokens untouched). */
  updateUser(user: SessionUser): Promise<void>;
  /**
   * Removes the push device, then revokes the refresh token on the API (in the
   * background) and forgets the session: signed out in memory even if the
   * device storage fails.
   */
  signOut(): Promise<void>;
  /**
   * Forgets the session on this device only, with no call to the API: for a
   * deleted account, whose devices and tokens the server already removed.
   */
  endSession(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const BEFORE_SIGN_OUT_TIMEOUT_MS = 3000;

/** Runs `task`, giving up after `ms` and ignoring its failure: signing out must never hang. */
async function bestEffort(task: () => Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
    ]);
  } catch {
    // best effort
  } finally {
    clearTimeout(timer);
  }
}

const revokeOnApi = (refreshToken: string) => revokeRefreshToken(config.apiUrl, refreshToken);

export function SessionProvider({
  children,
  store = sessionStore,
  revoke = revokeOnApi,
  onBeforeSignOut,
  onSignedOut,
}: PropsWithChildren<{
  store?: SessionStore;
  revoke?: (refreshToken: string) => Promise<void>;
  /**
   * Awaited (at most `BEFORE_SIGN_OUT_TIMEOUT_MS`, failures ignored) while the
   * session still exists, to undo what needs it: removing the push device.
   */
  onBeforeSignOut?: () => Promise<void>;
  /** Called when a signed-in session ends (sign-out or rejected refresh). */
  onSignedOut?: () => void;
}>) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    void store.load();
  }, [store]);

  const previousStatus = useRef(snapshot.status);
  useEffect(() => {
    if (previousStatus.current === 'signedIn' && snapshot.status === 'signedOut') {
      // An end of session the person did not ask for is explained on the sign-in screen.
      if (snapshot.endReason) setSignInNotice(endOfSessionNotice[snapshot.endReason]);
      onSignedOut?.();
    }
    previousStatus.current = snapshot.status;
  }, [snapshot.status, snapshot.endReason, onSignedOut]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status: snapshot.status,
      user: snapshot.session?.user ?? null,
      async setSession(response) {
        await store.set(response);
      },
      async updateUser(user) {
        await store.updateUser(user);
      },
      async signOut() {
        const session = store.getSession();
        if (session && onBeforeSignOut)
          await bestEffort(onBeforeSignOut, BEFORE_SIGN_OUT_TIMEOUT_MS);
        // Revoked whatever happens to the local erase: even if the keychain
        // keeps the entry, the server no longer accepts its refresh token.
        if (session) void revoke(session.refreshToken).catch(() => {});
        await store.clear();
      },
      async endSession() {
        await store.clear();
      },
    }),
    [snapshot, store, revoke, onBeforeSignOut],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
