import { Platform } from 'react-native';

import { config } from '@/lib/config';

/**
 * Google sign-in with `@react-native-google-signin/google-signin`, the library
 * the Expo documentation recommends. It needs custom native code: it is not
 * available in Expo Go, only in a development build. The module is required
 * lazily and guarded, so the app still starts without it.
 */
type GoogleModule = typeof import('@react-native-google-signin/google-signin');

let configured = false;

function loadGoogle(): GoogleModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: the native module may be missing
    return require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch {
    return null;
  }
}

/** Client IDs required on this platform (web client always, iOS client on iOS). */
export function isGoogleConfigured(): boolean {
  const { googleWebClientId, googleIosClientId } = config;
  if (!googleWebClientId) return false;
  return Platform.OS !== 'ios' || Boolean(googleIosClientId);
}

/** True when the Google button can be shown: configured and native module present. */
export function isGoogleSignInAvailable(): boolean {
  return isGoogleConfigured() && loadGoogle() !== null;
}

/** Opens the Google sheet. Resolves the ID token, or `null` when the person cancels. */
export async function requestGoogleIdToken(): Promise<string | null> {
  const google = loadGoogle();
  if (!google) throw new Error('Google sign-in unavailable');
  if (!configured) {
    google.GoogleSignin.configure({
      webClientId: config.googleWebClientId,
      iosClientId: config.googleIosClientId,
    });
    configured = true;
  }
  try {
    if (Platform.OS === 'android') await google.GoogleSignin.hasPlayServices();
    const response = await google.GoogleSignin.signIn();
    if (response.type !== 'success') return null;
    return response.data.idToken;
  } catch (error) {
    if ((error as { code?: string }).code === google.statusCodes.SIGN_IN_CANCELLED) return null;
    throw error;
  }
}
