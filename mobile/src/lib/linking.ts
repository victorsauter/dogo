import { Linking } from 'react-native';

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
