import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { ApiError } from '@/api/errors';
import { t } from '@/strings';
import { renderWithTheme } from '@/test/render';

import { StyleSheet } from 'react-native';

import {
  Avatar,
  Button,
  ChoiceGroup,
  createFieldRegistry,
  ErrorState,
  initials,
  SegmentedControl,
  TextField,
} from '..';

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

describe('SegmentedControl', () => {
  const options = [
    { value: 'a', label: 'Un' },
    { value: 'b', label: 'Deux' },
  ] as const;

  it('announces a radio group, marks the chosen segment (bold too) and reports changes', async () => {
    const onChange = jest.fn();
    await renderWithTheme(
      <SegmentedControl
        accessibilityLabel="Choix"
        options={options}
        value="a"
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText('Choix').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: 'Un' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'Deux' })).not.toBeSelected();
    expect(StyleSheet.flatten(screen.getByText('Un').props.style).fontWeight).toBe('700');
    expect(StyleSheet.flatten(screen.getByText('Deux').props.style).fontWeight).toBe('400');

    await fireEvent.press(screen.getByRole('radio', { name: 'Deux' }));
    expect(onChange).toHaveBeenCalledWith('b');
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
});
