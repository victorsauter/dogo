import { config } from '@/lib/config';

/**
 * `expo-notifications`, loaded lazily and only when an EAS project ID is
 * configured. Without a project ID no push token can ever be obtained (Expo Go
 * in the simulator, a build without EAS project), so the module is not even
 * required: nothing can crash, warn or show an error. Same approach as the
 * sign-in modules (ADR 0018).
 */
export type NotificationsModule = typeof import('expo-notifications');

let loaded: NotificationsModule | null = null;

export function loadNotifications(): NotificationsModule | null {
  if (!config.easProjectId) return null;
  if (loaded) return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: the native module may be missing
    loaded = require('expo-notifications') as NotificationsModule;
    return loaded;
  } catch (error) {
    devLog('expo-notifications cannot be loaded', error);
    return null;
  }
}

/** True when this build can receive push notifications (module present and EAS project configured). */
export function notificationsAvailable(): boolean {
  return loadNotifications() !== null;
}

/** Development-only log: a user never sees anything about notifications being unavailable. */
export function devLog(message: string, detail?: unknown) {
  if (__DEV__) console.info(`[notifications] ${message}`, detail ?? '');
}
