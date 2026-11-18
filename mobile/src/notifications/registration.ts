import * as SecureStore from 'expo-secure-store';
import { Alert, Platform } from 'react-native';

import { deleteDevice, putDevice } from '@/api/notifications';
import { config } from '@/lib/config';
import { t } from '@/strings';

import { devLog, loadNotifications, notificationsAvailable } from './native';

/** `unavailable`: no push on this build (no module or no EAS project). */
export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

const ASKED_KEY = 'dogo.notifications.asked';
const ANDROID_CHANNEL = 'default';

/** Token registered by this process, so sign-out can remove it without asking again. */
let registeredToken: string | null = null;

/** System permission of this device for notifications. Never prompts. */
export async function getPermissionState(): Promise<PermissionState> {
  const notifications = loadNotifications();
  if (!notifications) return 'unavailable';
  try {
    const permission = await notifications.getPermissionsAsync();
    if (permission.granted) return 'granted';
    return permission.status === 'undetermined' ? 'undetermined' : 'denied';
  } catch (error) {
    devLog('cannot read the permission', error);
    return 'unavailable';
  }
}

/** Android needs a channel before the permission prompt and any token. */
async function ensureAndroidChannel(
  notifications: NonNullable<ReturnType<typeof loadNotifications>>,
) {
  if (Platform.OS !== 'android') return;
  await notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: t.notifications.channelName,
    importance: notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * The Expo push token of this device, or `null` when there is none: no module,
 * no EAS project, permission not granted, or the token request failed (Expo Go,
 * simulators without push). Never throws.
 */
export async function getPushToken(): Promise<string | null> {
  const notifications = loadNotifications();
  const projectId = config.easProjectId;
  if (!notifications || !projectId) return null;
  try {
    if ((await getPermissionState()) !== 'granted') return null;
    await ensureAndroidChannel(notifications);
    const { data } = await notifications.getExpoPushTokenAsync({ projectId });
    return data || null;
  } catch (error) {
    devLog('no push token', error);
    return null;
  }
}

/** Registers this device for the signed-in user when permission is granted and a token exists. Best effort. */
export async function registerDevice(): Promise<void> {
  try {
    const token = await getPushToken();
    if (!token) return;
    await putDevice(token, Platform.OS === 'ios' ? 'Ios' : 'Android');
    registeredToken = token;
  } catch (error) {
    devLog('device registration failed', error);
  }
}

/** Removes this device from the signed-in user (call before the session is cleared). Best effort. */
export async function unregisterDevice(): Promise<void> {
  try {
    const token = registeredToken ?? (await getPushToken());
    registeredToken = null;
    if (token) await deleteDevice(token);
  } catch (error) {
    devLog('device removal failed', error);
  }
}

/** Asks the system for permission, then registers the device. Returns the new state. */
export async function enableNotifications(): Promise<PermissionState> {
  const notifications = loadNotifications();
  if (!notifications) return 'unavailable';
  try {
    await ensureAndroidChannel(notifications);
    await notifications.requestPermissionsAsync();
  } catch (error) {
    devLog('permission request failed', error);
  }
  const state = await getPermissionState();
  if (state === 'granted') await registerDevice();
  return state;
}

/**
 * After a meaningful action (first registration to a walk, creating a walk):
 * explains in the app why notifications help, once, then asks the system. Does
 * nothing when push is unavailable, already decided, or already offered.
 */
export async function offerNotifications(): Promise<void> {
  if (!notificationsAvailable()) return;
  try {
    if (await SecureStore.getItemAsync(ASKED_KEY)) return;
    if ((await getPermissionState()) !== 'undetermined') return;
    await SecureStore.setItemAsync(ASKED_KEY, '1');
    Alert.alert(t.notifications.title, t.permissions.notifications, [
      { text: t.notifications.later, style: 'cancel' },
      { text: t.notifications.allow, onPress: () => void enableNotifications() },
    ]);
  } catch (error) {
    devLog('cannot offer notifications', error);
  }
}
