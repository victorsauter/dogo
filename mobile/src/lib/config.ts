/**
 * Typed access to the app configuration.
 *
 * Expo inlines `EXPO_PUBLIC_*` variables at build time, which only works with a
 * literal `process.env.EXPO_PUBLIC_NAME` access: keep these reads as they are.
 * See `.env.example` for the available variables.
 */
import Constants from 'expo-constants';

import type { GeoPoint } from '@/api/types';

/**
 * A distribution build that cannot work: API address missing (`missingApiUrl`)
 * or not `https` (`insecureApiUrl`). The app shows a configuration error
 * screen instead of failing every request.
 */
export type ConfigError = 'missingApiUrl' | 'insecureApiUrl';

export interface AppConfig {
  /**
   * Base URL of the Uzu API, without a trailing slash (e.g. `http://localhost:5080`).
   * Falls back to the local API in development only; empty when `error` is `missingApiUrl`.
   */
  apiUrl: string;
  /**
   * Shows the test sign-in (`POST /auth/dev`) and the demo data on the sign-in
   * screen: a demo build (`demo`) or `EXPO_PUBLIC_DEV_LOGIN=true` **and** a
   * development build (`__DEV__`). This is the only place where that rule lives.
   */
  devLogin: boolean;
  /**
   * Demo build (`EXPO_PUBLIC_DEMO_MODE=true`): a Release build installed on the
   * developer's own phone, talking to the hosted demo API (ADR 0043). The API
   * address must still be `https`.
   */
  demo: boolean;
  /** Set when a distribution build is misconfigured (see `ConfigError`). */
  error?: ConfigError;
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

/**
 * The API address. In development, a missing value falls back to the local
 * API and any scheme is accepted (simulator, emulator, phone on the Wi-Fi).
 * In a distribution build, it must be given and use `https`.
 */
function readApiUrl(
  value: string | undefined,
  dev: boolean,
): { apiUrl: string; error?: ConfigError } {
  const given = value?.trim().replace(/\/+$/, '') ?? '';
  if (dev) return { apiUrl: given || DEFAULT_API_URL };
  if (!given) return { apiUrl: '', error: 'missingApiUrl' };
  if (!/^https:\/\/[^/\s]+/i.test(given)) return { apiUrl: given, error: 'insecureApiUrl' };
  return { apiUrl: given };
}

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function readConfig(
  env: {
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_DEV_LOGIN?: string;
    EXPO_PUBLIC_DEMO_MODE?: string;
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?: string;
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?: string;
    EXPO_PUBLIC_DEFAULT_LATITUDE?: string;
    EXPO_PUBLIC_DEFAULT_LONGITUDE?: string;
  },
  /** Development build (`__DEV__`); injected in tests. */
  dev: boolean = __DEV__,
): AppConfig {
  const { apiUrl, error } = readApiUrl(env.EXPO_PUBLIC_API_URL, dev);
  const demo = isTrue(env.EXPO_PUBLIC_DEMO_MODE);
  return {
    apiUrl,
    ...(error ? { error } : {}),
    demo,
    devLogin: demo || (dev && isTrue(env.EXPO_PUBLIC_DEV_LOGIN)),
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
  EXPO_PUBLIC_DEMO_MODE: process.env.EXPO_PUBLIC_DEMO_MODE,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  EXPO_PUBLIC_DEFAULT_LATITUDE: process.env.EXPO_PUBLIC_DEFAULT_LATITUDE,
  EXPO_PUBLIC_DEFAULT_LONGITUDE: process.env.EXPO_PUBLIC_DEFAULT_LONGITUDE,
});
