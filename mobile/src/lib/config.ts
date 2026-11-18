/**
 * Typed access to the app configuration.
 *
 * Expo inlines `EXPO_PUBLIC_*` variables at build time, which only works with a
 * literal `process.env.EXPO_PUBLIC_NAME` access: keep these reads as they are.
 * See `.env.example` for the available variables.
 */
export interface AppConfig {
  /** Base URL of the dogo API, without a trailing slash (e.g. `http://localhost:5080`). */
  apiUrl: string;
  /** Shows the test sign-in button (`POST /auth/dev`) on the sign-in screen. */
  devLogin: boolean;
  /** Google OAuth web client ID (audience of the ID token); the Google button needs it. */
  googleWebClientId?: string;
  /** Google OAuth iOS client ID; also required on iOS. */
  googleIosClientId?: string;
}

const DEFAULT_API_URL = 'http://localhost:5080';

export function readConfig(env: {
  EXPO_PUBLIC_API_URL?: string;
  EXPO_PUBLIC_DEV_LOGIN?: string;
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?: string;
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?: string;
}): AppConfig {
  const apiUrl = (env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, '');
  return {
    apiUrl,
    devLogin: env.EXPO_PUBLIC_DEV_LOGIN?.trim().toLowerCase() === 'true',
    googleWebClientId: env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || undefined,
    googleIosClientId: env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || undefined,
  };
}

export const config: AppConfig = readConfig({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_DEV_LOGIN: process.env.EXPO_PUBLIC_DEV_LOGIN,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});
