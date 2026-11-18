import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { renderWithTheme } from '@/test/render';
import { darkColors, lightColors } from '@/theme/tokens';

import { WalkPin } from '..';

function pinStyle() {
  return StyleSheet.flatten(
    screen.getByTestId('walk-pin', { includeHiddenElements: true }).props.style,
  );
}

describe('WalkPin', () => {
  it('is fawn for a walk, in the strong colour of the coat for a professional one', async () => {
    await renderWithTheme(<WalkPin />);
    expect(pinStyle().backgroundColor).toBe(lightColors.primary);

    await renderWithTheme(<WalkPin professional />);
    expect(pinStyle().backgroundColor).toBe(lightColors.pro);
  });

  it('turns professional walks off-white in the dark theme', async () => {
    await renderWithTheme(<WalkPin professional />, 'dark');
    expect(pinStyle().backgroundColor).toBe(darkColors.pro);
  });

  it('is larger when selected, not only differently coloured', async () => {
    await renderWithTheme(<WalkPin />);
    const size = pinStyle().width as number;
    await renderWithTheme(<WalkPin selected />);
    expect(pinStyle().width).toBeGreaterThan(size);
  });
});
