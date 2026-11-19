import { Linking, Platform } from 'react-native';

import type { GeoPoint } from '@/api/types';

/**
 * Opens the system settings of the app (where a refused permission can be
 * allowed). Never throws: some devices and simulators cannot open them, and a
 * rejected promise from a button would surface as an unhandled error.
 * Resolves `true` when the settings opened.
 */
export async function openAppSettings(): Promise<boolean> {
  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
  }
}

/**
 * Addresses that open a place in a maps app, best first: the device's own
 * (Apple Plans through its web address on iOS, the `geo:` scheme on Android),
 * then Google Maps on the web, which any browser opens.
 */
export function mapUrls(point: GeoPoint, label: string, os: string = Platform.OS): string[] {
  const { latitude, longitude } = point;
  const name = encodeURIComponent(label);
  const native =
    os === 'ios'
      ? `https://maps.apple.com/?ll=${latitude},${longitude}&q=${name}`
      : `geo:${latitude},${longitude}?q=${latitude},${longitude}(${name})`;
  const web = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  return [native, web];
}

/**
 * Opens a place in the device's maps app, falling back to a web address when
 * the native one cannot be opened (no maps app for the `geo:` scheme).
 * Never throws; resolves `false` when nothing could be opened.
 */
export async function openMapsAt(point: GeoPoint, label: string): Promise<boolean> {
  for (const url of mapUrls(point, label)) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // try the next address
    }
  }
  return false;
}
