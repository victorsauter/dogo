/**
 * Typed access to the app configuration.
 *
 * Expo inlines `EXPO_PUBLIC_*` variables at build time, which only works with a
 * literal `process.env.EXPO_PUBLIC_NAME` access: keep these reads as they are.
 * See `.env.example` for the available variables.
 */
import Constants from 'expo-constants';

import type { GeoPoint } from '@/api/types';

export interface AppConfig {
  /** Base URL of the dogo API, without a trailing slash (e.g. `http://localhost:5080`). */
  apiUrl: string;
  /** Shows the test sign-in button (`POST /auth/dev`) on the sign-in screen. */
  devLogin: boolean;
  /** Google OAuth web client ID (audience of the ID token); the Google button needs it. */
  googleWebClientId?: string;
  /** Google OAuth iOS client ID; also required on iOS. */
  googleIosClientId?: string;
  /**
   * EAS project ID (`EXPO_PUBLIC_EAS_PROJECT_ID`, exposed through the app config
   * `extra.eas.projectId`). Without it no push token can be obtained: notifications
   * are treated as unavailable, silently.
   */
  easProjectId?: string;
  /**
   * Map centre when the position is unknown (`EXPO_PUBLIC_DEFAULT_LATITUDE` and
   * `EXPO_PUBLIC_DEFAULT_LONGITUDE`, both needed); Seppois-le-Haut by default.
   */
  defaultCenter: GeoPoint;
}

const DEFAULT_API_URL = 'http://localhost:5080';

/** Seppois-le-Haut (Haut-Rhin), where the pilot starts: 47°32′02″ N, 7°11′04″ E. */
export const PILOT_CENTER: GeoPoint = { latitude: 47.5339, longitude: 7.1844 };

/** A valid latitude and longitude from the environment, or the pilot centre. */
function readDefaultCenter(latitude?: string, longitude?: string): GeoPoint {
  const lat = Number(latitude?.trim() || Number.NaN);
  const lng = Number(longitude?.trim() || Number.NaN);
  const valid =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return valid ? { latitude: lat, longitude: lng } : PILOT_CENTER;
}

/** `extra.eas.projectId` of the app config, set by `app.config.ts` from the environment. */
function readEasProjectId(): string | undefined {
  try {
    const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
    const id = extra?.eas?.projectId;
    return typeof id === 'string' && id.trim() ? id.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function readConfig(env: {
  EXPO_PUBLIC_API_URL?: string;
  EXPO_PUBLIC_DEV_LOGIN?: string;
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?: string;
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?: string;
  EXPO_PUBLIC_DEFAULT_LATITUDE?: string;
  EXPO_PUBLIC_DEFAULT_LONGITUDE?: string;
}): AppConfig {
  const apiUrl = (env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, '');
  return {
    apiUrl,
    devLogin: env.EXPO_PUBLIC_DEV_LOGIN?.trim().toLowerCase() === 'true',
    googleWebClientId: env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || undefined,
    googleIosClientId: env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || undefined,
    easProjectId: readEasProjectId(),
    defaultCenter: readDefaultCenter(
      env.EXPO_PUBLIC_DEFAULT_LATITUDE,
      env.EXPO_PUBLIC_DEFAULT_LONGITUDE,
    ),
  };
}

export const config: AppConfig = readConfig({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_DEV_LOGIN: process.env.EXPO_PUBLIC_DEV_LOGIN,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  EXPO_PUBLIC_DEFAULT_LATITUDE: process.env.EXPO_PUBLIC_DEFAULT_LATITUDE,
  EXPO_PUBLIC_DEFAULT_LONGITUDE: process.env.EXPO_PUBLIC_DEFAULT_LONGITUDE,
});
