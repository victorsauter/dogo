import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { GeoPoint } from '@/api/types';

/**
 * `pending`: still asking; `granted`: `coords` is the device position;
 * `denied`: permission refused; `unavailable`: no position (services off, timeout).
 */
export type LocationStatus = 'pending' | 'granted' | 'denied' | 'unavailable';

export interface UserLocation {
  status: LocationStatus;
  coords: GeoPoint | null;
}

/** Longest wait for a fresh position before falling back to the default centre. */
const POSITION_TIMEOUT_MS = 8000;

/** `promise`, or `null` after `ms`; the timer never outlives the answer. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** The position, once the permission is granted (last known first, fresh otherwise). */
async function readPosition(): Promise<UserLocation> {
  const position =
    (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ??
    (await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      POSITION_TIMEOUT_MS,
    ));
  if (!position) return { status: 'unavailable', coords: null };
  const { latitude, longitude } = position.coords;
  return { status: 'granted', coords: { latitude, longitude } };
}

/**
 * Asks once for the « when in use » location permission, then reads the
 * position (last known first, fresh otherwise). Never throws: on refusal or
 * failure the screen keeps working with a default centre.
 */
export async function requestUserLocation(): Promise<UserLocation> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return { status: 'denied', coords: null };
    return await readPosition();
  } catch {
    return { status: 'unavailable', coords: null };
  }
}

/**
 * Like `requestUserLocation`, but never asks: it reads the permission as it is
 * now. For when the app comes back to the foreground, after the person may
 * have allowed the location in the system settings.
 */
export async function refreshUserLocation(): Promise<UserLocation> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return { status: 'denied', coords: null };
    return await readPosition();
  } catch {
    return { status: 'unavailable', coords: null };
  }
}

/**
 * The user's position for a screen, requested on mount. A refusal (or no
 * position) is read again each time the app returns to the foreground, so
 * allowing the location in the settings takes effect without restarting.
 */
export function useUserLocation(): UserLocation {
  const [location, setLocation] = useState<UserLocation>({ status: 'pending', coords: null });
  const statusRef = useRef<LocationStatus>('pending');
  useEffect(() => {
    statusRef.current = location.status;
  }, [location.status]);

  useEffect(() => {
    let active = true;
    let refreshing = false;
    void requestUserLocation().then((result) => {
      if (active) setLocation(result);
    });
    const subscription = AppState.addEventListener('change', (state) => {
      const status = statusRef.current;
      if (state !== 'active' || refreshing || status === 'pending' || status === 'granted') return;
      refreshing = true;
      void refreshUserLocation()
        .then((result) => {
          // Nothing new (still refused): keep the same state, no re-render.
          if (active && result.status !== status) setLocation(result);
        })
        .finally(() => {
          refreshing = false;
        });
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return location;
}
