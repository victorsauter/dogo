import { useMutation } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import { ApiError } from '@/api/errors';
import { t } from '@/strings';

import { useSession } from './SessionProvider';
import { requestAppleCredential } from './providers/apple';
import { requestGoogleIdToken } from './providers/google';

/** Result of a sign-in attempt: `cancelled` when the person closed the provider sheet. */
type Outcome = 'signedIn' | 'cancelled';

/** `POST /auth/dev` (test accounts), then stores the session. */
export function useDevSignIn() {
  const { setSession } = useSession();
  return useMutation({
    mutationFn: async (body: { subject: string; displayName: string }): Promise<Outcome> => {
      await setSession(await unwrap(api.POST('/api/v1/auth/dev', { body })));
      return 'signedIn';
    },
  });
}

export function useAppleSignIn() {
  const { setSession } = useSession();
  return useMutation({
    mutationFn: async (): Promise<Outcome> => {
      const credential = await requestAppleCredential();
      if (!credential) return 'cancelled';
      if (!credential.identityToken) throw new Error('Apple returned no identity token');
      const response = await unwrap(
        api.POST('/api/v1/auth/apple', {
          body: { identityToken: credential.identityToken, displayName: credential.displayName },
        }),
      );
      await setSession(response);
      return 'signedIn';
    },
  });
}

export function useGoogleSignIn() {
  const { setSession } = useSession();
  return useMutation({
    mutationFn: async (): Promise<Outcome> => {
      const idToken = await requestGoogleIdToken();
      if (idToken === null) return 'cancelled';
      if (!idToken) throw new Error('Google returned no ID token');
      await setSession(await unwrap(api.POST('/api/v1/auth/google', { body: { idToken } })));
      return 'signedIn';
    },
  });
}

/** French message for a failed sign-in: API errors keep theirs, provider failures are generic. */
export function signInErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : t.auth.providerFailed;
}
