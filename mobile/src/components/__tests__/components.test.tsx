import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { ApiError } from '@/api/errors';
import { t } from '@/strings';
import { renderWithTheme } from '@/test/render';

import { Avatar, Button, ChoiceGroup, ErrorState, initials, TextField } from '..';

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
