import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

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

function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
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
    const position =
      (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        timeout(POSITION_TIMEOUT_MS),
      ]));
    if (!position) return { status: 'unavailable', coords: null };
    const { latitude, longitude } = position.coords;
    return { status: 'granted', coords: { latitude, longitude } };
  } catch {
    return { status: 'unavailable', coords: null };
  }
}

/** The user's position for a screen, requested on mount. */
export function useUserLocation(): UserLocation {
  const [location, setLocation] = useState<UserLocation>({ status: 'pending', coords: null });
  useEffect(() => {
    let active = true;
    void requestUserLocation().then((result) => {
      if (active) setLocation(result);
    });
    return () => {
      active = false;
    };
  }, []);
  return location;
}
