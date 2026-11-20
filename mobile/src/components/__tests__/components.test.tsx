import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { ApiError } from '@/api/errors';
import { t } from '@/strings';
import { renderWithTheme } from '@/test/render';

import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  Avatar,
  Button,
  ChoiceGroup,
  createFieldRegistry,
  ErrorState,
  initials,
  MenuPill,
  placeMenu,
  TextField,
  WalksMap,
} from '..';
import { errorIcon } from '../ErrorState';

describe('Button', () => {
  it('calls onPress', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Button label="Valider" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Valider' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses while loading or disabled', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <>
        <Button label="Envoyer" loading onPress={onPress} />
        <Button label="Supprimer" variant="danger" disabled onPress={onPress} />
      </>,
    );
    const loading = screen.getByRole('button', { name: 'Envoyer' });
    expect(loading).toBeBusy();
    expect(screen.queryByText('Envoyer')).toBeNull();
    await fireEvent.press(loading);
    await fireEvent.press(screen.getByRole('button', { name: 'Supprimer' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeDisabled();
  });
});

describe('TextField', () => {
  it('is labelled and shows its error', async () => {
    const onChangeText = jest.fn();
    await renderWithTheme(
      <TextField label="Nom du chien" error={t.common.required} onChangeText={onChangeText} />,
    );
    await fireEvent.changeText(screen.getByLabelText('Nom du chien'), 'Filou');
    expect(onChangeText).toHaveBeenCalledWith('Filou');
    expect(screen.getByText(t.common.required)).toBeTruthy();
  });
});

describe('MenuPill', () => {
  const metrics = {
    frame: { x: 0, y: 0, width: 400, height: 800 },
    insets: { top: 60, left: 0, right: 0, bottom: 30 },
  };
  const renderPill = (onChange: (value: 'a' | 'b') => void) =>
    renderWithTheme(
      <SafeAreaProvider initialMetrics={metrics}>
        <MenuPill label="Choix" text="Un" options={options} value="a" onChange={onChange} />
      </SafeAreaProvider>,
    );
  const options = [
    { value: 'a', label: 'Un' },
    { value: 'b', label: 'Deux' },
  ] as const;

  it('is a button named by its label and value, opening a menu with the choice checked', async () => {
    const onChange = jest.fn();
    await renderPill(onChange);
    const pill = screen.getByRole('button', { name: 'Choix, Un' });
    expect(pill).toBeCollapsed();

    await fireEvent.press(pill);
    expect(pill).toBeExpanded();
    expect(screen.getByRole('menuitem', { name: 'Un' })).toBeSelected();
    expect(screen.getByRole('menuitem', { name: 'Deux' })).not.toBeSelected();

    await fireEvent.press(screen.getByRole('menuitem', { name: 'Deux' }));
    expect(onChange).toHaveBeenCalledWith('b');
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Un' })).toBeNull());
  });

  it('does not report the choice already made', async () => {
    const onChange = jest.fn();
    await renderPill(onChange);
    await fireEvent.press(screen.getByRole('button', { name: 'Choix, Un' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Un' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('placeMenu', () => {
  const window = { width: 400, height: 800 };
  const insets = { top: 60, bottom: 30 };
  const place = (anchor: { x: number; y: number; width: number; height: number }) =>
    placeMenu({ anchor, window, insets, margin: 16, gap: 4, height: 150 });

  it('opens under the pill, aligned with it, growing from its centre', () => {
    expect(place({ x: 16, y: 100, width: 80, height: 36 })).toEqual({
      top: 140,
      left: 16,
      width: 224,
      opensUp: false,
      originX: 40,
    });
  });

  it('moves back inside the screen when the pill is near the right edge', () => {
    const { left, width, originX } = place({ x: 300, y: 100, width: 80, height: 36 });
    expect(left + width).toBe(400 - 16);
    expect(originX).toBe(300 + 40 - left);
  });

  it('opens above the pill when there is no room below', () => {
    const { top, opensUp } = place({ x: 16, y: 700, width: 80, height: 36 });
    expect(opensUp).toBe(true);
    expect(top).toBe(700 - 4 - 150);
  });

  it('never gets wider than the screen allows', () => {
    const narrow = placeMenu({
      anchor: { x: 16, y: 100, width: 80, height: 36 },
      window: { width: 220, height: 800 },
      insets,
      margin: 16,
      gap: 4,
      height: 150,
    });
    expect(narrow.width).toBe(220 - 32);
    expect(narrow.left).toBe(16);
  });
});

describe('ChoiceGroup', () => {
  const options = [
    { value: 'Small', label: 'Petit' },
    { value: 'Large', label: 'Grand' },
  ] as const;

  it('selects a single value', async () => {
    function Single() {
      const [value, setValue] = useState<'Small' | 'Large' | null>(null);
      return (
        <ChoiceGroup
          accessibilityLabel="Gabarit"
          options={options}
          value={value}
          onChange={setValue}
        />
      );
    }
    await renderWithTheme(<Single />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Grand' }));
    expect(screen.getByRole('radio', { name: 'Grand' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Petit' })).not.toBeChecked();
  });

  it('toggles several values', async () => {
    const onChange = jest.fn();
    await renderWithTheme(
      <ChoiceGroup
        multiple
        accessibilityLabel="Gabarits admis"
        options={options}
        value={['Small']}
        onChange={onChange}
      />,
    );
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Grand' }));
    expect(onChange).toHaveBeenLastCalledWith(['Small', 'Large']);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Petit' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe('Avatar', () => {
  it('shows initials without a photo', async () => {
    await renderWithTheme(<Avatar name="Léa Martin" />);
    expect(screen.getByText('LM')).toBeTruthy();
    expect(screen.getByLabelText('Photo de Léa Martin')).toBeTruthy();
    expect(initials('  rex ')).toBe('R');
  });

  it.each([48, 64, 112, 120])(
    'gives the initials a line height that fits the font at size %i (defect D2)',
    async (size) => {
      await renderWithTheme(<Avatar name="Rex" size={size} />);
      const style = StyleSheet.flatten(screen.getByText('R').props.style);
      expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize);
      expect(style.includeFontPadding).toBe(false);
    },
  );

  it('fills the circle with primarySoft by default, or with the colour asked for', async () => {
    const { lightColors } = jest.requireActual<typeof import('@/theme/tokens')>('@/theme/tokens');
    const fill = () =>
      StyleSheet.flatten(screen.getByLabelText('Photo de Rex').props.style).backgroundColor;
    await renderWithTheme(<Avatar name="Rex" />);
    expect(fill()).toBe(lightColors.primarySoft);
    await renderWithTheme(<Avatar name="Rex" background="surface" />);
    expect(fill()).toBe(lightColors.surface);
  });

  it('shows a placeholder icon instead of initials while there is no name (defect D3)', async () => {
    await renderWithTheme(<Avatar name="  " placeholderIcon="paw" />);
    expect(screen.getByLabelText(t.a11y.photo)).toBeTruthy();
    expect(screen.queryByText(/\S/)).toBeNull();
  });
});

describe('createFieldRegistry (scroll to the first error, defect D4)', () => {
  it('picks the highest field in error, with a margin', async () => {
    const registry = createFieldRegistry();
    registry.register('title', async () => 40);
    registry.register('sizes', async () => 600);
    registry.register('label', async () => 300);
    expect(await registry.firstErrorOffset({ sizes: 'x', label: 'y', title: undefined })).toBe(276);
    expect(await registry.firstErrorOffset({ title: 'x', sizes: 'y' })).toBe(16);
  });

  it('returns null when no field in error is known', async () => {
    const registry = createFieldRegistry();
    const unregister = registry.register('title', async () => 40);
    unregister();
    expect(await registry.firstErrorOffset({ title: 'x', other: 'y' })).toBeNull();
    expect(await registry.firstErrorOffset({})).toBeNull();
  });
});

describe('ErrorState', () => {
  it('explains the error and retries', async () => {
    const onRetry = jest.fn();
    await renderWithTheme(
      <ErrorState error={new ApiError({ kind: 'network' })} onRetry={onRetry} />,
      'dark',
    );
    expect(screen.getByText(t.errors.network)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: t.common.retry }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('titles a 404 with what cannot be found, not « un problème »', async () => {
    const notFound = new ApiError({ kind: 'http', status: 404 });
    await renderWithTheme(<ErrorState error={notFound} notFoundTitle={t.walk.notFoundTitle} />);
    expect(screen.getByText(t.walk.notFoundTitle)).toBeTruthy();
    expect(screen.queryByText(t.states.errorTitle)).toBeNull();
  });

  it('gives a 404 without a precise title a generic « Introuvable »', async () => {
    await renderWithTheme(<ErrorState error={new ApiError({ kind: 'http', status: 404 })} />);
    expect(screen.getByText(t.states.missingTitle)).toBeTruthy();
  });

  it('keeps the « problème » title for any other error', async () => {
    const error = new ApiError({ kind: 'http', status: 500 });
    await renderWithTheme(<ErrorState error={error} notFoundTitle={t.walk.notFoundTitle} />);
    expect(screen.getByText(t.states.errorTitle)).toBeTruthy();
    expect(screen.queryByText(t.walk.notFoundTitle)).toBeNull();
  });
});

describe('ErrorState: retry or leave', () => {
  it.each([404, 403, 409])(
    'offers « Retour », not « Réessayer », for a definitive %s',
    async (status) => {
      const onRetry = jest.fn();
      await renderWithTheme(
        <ErrorState error={new ApiError({ kind: 'http', status })} onRetry={onRetry} />,
      );
      expect(screen.queryByRole('button', { name: t.common.retry })).toBeNull();
      expect(screen.getByRole('button', { name: t.common.back })).toBeTruthy();
    },
  );

  it.each([
    ['a network failure', new ApiError({ kind: 'network' })],
    ['a server fault', new ApiError({ kind: 'http', status: 503 })],
    ['a timeout', new ApiError({ kind: 'http', status: 408 })],
    ['rate limiting', new ApiError({ kind: 'http', status: 429 })],
  ])('keeps « Réessayer » for %s', async (_name, error) => {
    const onRetry = jest.fn();
    await renderWithTheme(<ErrorState error={error} onRetry={onRetry} />);
    await fireEvent.press(screen.getByRole('button', { name: t.common.retry }));
    expect(onRetry).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: t.common.back })).toBeNull();
  });
});

describe('ErrorState icon', () => {
  it('shows « hors ligne » only when the server could not be reached', () => {
    expect(errorIcon(new ApiError({ kind: 'network' }))).toBe('offline');
    expect(errorIcon(new ApiError({ kind: 'http', status: 404 }))).toBe('warning');
    expect(errorIcon(new ApiError({ kind: 'http', status: 500 }))).toBe('warning');
    expect(errorIcon(new ApiError({ kind: 'client' }))).toBe('warning');
    expect(errorIcon(undefined)).toBe('warning');
  });
});

describe('WalksMap', () => {
  it.each(['light', 'dark'] as const)(
    'draws the map in the %s theme (Android stayed light without it)',
    async (scheme) => {
      await renderWithTheme(
        <WalksMap
          initialRegion={{
            latitude: 47.5,
            longitude: 7.2,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          }}
          walks={[]}
          onRegionChange={() => {}}
          onOpenWalk={() => {}}
        />,
        scheme,
      );
      expect(screen.getByTestId('walks-map').props.userInterfaceStyle).toBe(scheme);
    },
  );
});
