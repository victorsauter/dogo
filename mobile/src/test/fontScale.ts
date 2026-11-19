import { act } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

/** Test runtime's own default (RN's jest setup says 2): tests run at the normal text size unless they ask otherwise. */
export const NORMAL_FONT_SCALE = 1;

/**
 * Sets the text size factor of the system's accessibility settings, as
 * `useWindowDimensions().fontScale` reports it. `jest.setup.ts` puts it back to 1
 * before each test.
 */
export function setFontScale(fontScale: number): void {
  const window = Dimensions.get('window');
  const screen = Dimensions.get('screen');
  Dimensions.set({ window: { ...window, fontScale }, screen: { ...screen, fontScale } });
}

/** Same, inside `act` (a mounted component re-renders). */
export async function setFontScaleLive(fontScale: number): Promise<void> {
  await act(async () => setFontScale(fontScale));
}
