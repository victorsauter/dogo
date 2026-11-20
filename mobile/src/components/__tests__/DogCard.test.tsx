import { fireEvent, screen } from '@testing-library/react-native';

import type { DogMember } from '@/api/types';
import { testDog, testUser } from '@/test/fixtures';
import { renderWithTheme } from '@/test/render';

import { DogCard } from '..';

const human = (id: string, displayName: string): DogMember => ({
  user: { id, displayName, photoUrl: null },
  role: 'Owner',
});
const me = human(testUser.id, testUser.displayName);
const camille = human('c', 'Camille');
const lea = human('l', 'Léa');
const marc = human('m', 'Marc');

const dogWith = (...members: DogMember[]) => ({ ...testDog, members });

describe('DogCard', () => {
  it('shows no « aussi avec » line when the profile’s human is the only one', async () => {
    await renderWithTheme(<DogCard dog={dogWith(me)} profileUserId={testUser.id} />);
    expect(screen.getByText('Biscotte')).toBeTruthy();
    expect(screen.queryByText(/aussi avec/)).toBeNull();
    expect(screen.queryByTestId('dog-also-with')).toBeNull();
  });

  it('shows no line without a profile’s human', async () => {
    await renderWithTheme(<DogCard dog={dogWith(me, camille)} />);
    expect(screen.queryByText(/aussi avec/)).toBeNull();
  });

  it('names the other human, with a small picture', async () => {
    await renderWithTheme(<DogCard dog={dogWith(me, camille)} profileUserId={testUser.id} />);
    expect(screen.getByText('aussi avec Camille')).toBeTruthy();
    expect(screen.getByLabelText('Photo de Camille')).toBeTruthy();
  });

  it('names two other humans', async () => {
    await renderWithTheme(<DogCard dog={dogWith(me, camille, lea)} profileUserId={testUser.id} />);
    expect(screen.getByText('aussi avec Camille et Léa')).toBeTruthy();
  });

  it('counts the rest past two', async () => {
    await renderWithTheme(
      <DogCard dog={dogWith(me, camille, lea, marc)} profileUserId={testUser.id} />,
    );
    expect(screen.getByText('aussi avec Camille et 2 autres')).toBeTruthy();
  });

  it('says it in the accessible label and stays pressable', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <DogCard dog={dogWith(me, camille)} profileUserId={testUser.id} onPress={onPress} />,
    );
    await fireEvent.press(screen.getByLabelText(/^Biscotte, .*, aussi avec Camille$/));
    expect(onPress).toHaveBeenCalled();
  });
});
