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

import { sessionStore, type SessionStatus, type SessionStore } from './sessionStore';

export interface SessionContextValue {
  status: SessionStatus;
  /** Signed-in user as returned at sign-in or last refresh; `null` when signed out. */
  user: SessionUser | null;
  /** Stores the response of a sign-in endpoint (`/auth/apple`, `/auth/google`, `/auth/dev`). */
  setSession(response: AuthResponse): Promise<void>;
  /** Updates the user kept in the session after a profile change (tokens untouched). */
  updateUser(user: SessionUser): Promise<void>;
  /** Forgets the session on the device, then revokes the refresh token on the API. */
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const revokeOnApi = (refreshToken: string) => revokeRefreshToken(config.apiUrl, refreshToken);

export function SessionProvider({
  children,
  store = sessionStore,
  revoke = revokeOnApi,
  onSignedOut,
}: PropsWithChildren<{
  store?: SessionStore;
  revoke?: (refreshToken: string) => Promise<void>;
  /** Called when a signed-in session ends (sign-out or rejected refresh). */
  onSignedOut?: () => void;
}>) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    void store.load();
  }, [store]);

  const previousStatus = useRef(snapshot.status);
  useEffect(() => {
    if (previousStatus.current === 'signedIn' && snapshot.status === 'signedOut') onSignedOut?.();
    previousStatus.current = snapshot.status;
  }, [snapshot.status, onSignedOut]);

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
        await store.clear();
        if (session) void revoke(session.refreshToken);
      },
    }),
    [snapshot, store, revoke],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
