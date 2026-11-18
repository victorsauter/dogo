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
}

const DEFAULT_API_URL = 'http://localhost:5080';

export function readConfig(env: {
  EXPO_PUBLIC_API_URL?: string;
  EXPO_PUBLIC_DEV_LOGIN?: string;
}): AppConfig {
  const apiUrl = (env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, '');
  return {
    apiUrl,
    devLogin: env.EXPO_PUBLIC_DEV_LOGIN?.trim().toLowerCase() === 'true',
  };
}

export const config: AppConfig = readConfig({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_DEV_LOGIN: process.env.EXPO_PUBLIC_DEV_LOGIN,
});
