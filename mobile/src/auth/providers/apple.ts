import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Sign in with Apple, loaded lazily: the native module must never be required
 * at import time, so that the app starts where it is missing.
 * Available on iOS only (Expo Go included).
 */
type AppleModule = typeof import('expo-apple-authentication');

function loadApple(): AppleModule | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: the native module may be missing
    return require('expo-apple-authentication') as AppleModule;
  } catch {
    return null;
  }
}

/**
 * `extra.freeSigning` of the app config (`UZU_FREE_SIGNING=true`): the build is
 * signed with a free Apple ID, which cannot carry the Sign in with Apple
 * entitlement. The native module stays linked, so without this guard the button
 * would show and then fail.
 */
function isFreeSigning(): boolean {
  try {
    const extra = Constants.expoConfig?.extra as { freeSigning?: unknown } | undefined;
    return extra?.freeSigning === true;
  } catch {
    return false;
  }
}

/** True when the Apple button can be shown on this device. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (isFreeSigning()) return false;
  const apple = loadApple();
  if (!apple) return false;
  try {
    return await apple.isAvailableAsync();
  } catch {
    return false;
  }
}

export interface AppleCredential {
  identityToken: string;
  /** Only provided by Apple on the very first sign-in of this Apple ID for the app. */
  displayName?: string;
}

/** Opens the Apple sheet. Resolves `null` when the person cancels. */
export async function requestAppleCredential(): Promise<AppleCredential | null> {
  const apple = loadApple();
  if (!apple) throw new Error('Apple sign-in unavailable');
  try {
    const credential = await apple.signInAsync({
      requestedScopes: [
        apple.AppleAuthenticationScope.FULL_NAME,
        apple.AppleAuthenticationScope.EMAIL,
      ],
    });
    const name = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();
    return {
      identityToken: credential.identityToken ?? '',
      displayName: name || undefined,
    };
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw error;
  }
}
