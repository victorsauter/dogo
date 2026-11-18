import { screen } from '@testing-library/react-native';

import { t } from '@/strings';
import { walkResult } from '@/test/fixtures';
import { renderWithTheme } from '@/test/render';

import { WalkCard } from '../WalkCard';

const cardLabel = () => screen.getByRole('button').props.accessibilityLabel as string;

describe('WalkCard', () => {
  it('shows title, day and time, distance, places, sizes and leash rule', async () => {
    await renderWithTheme(<WalkCard walk={walkResult()} onPress={() => {}} />);
    expect(screen.getByText('Tour du lac')).toBeTruthy();
    expect(screen.getByText(/ à 10:00 · 1 h 30$/)).toBeTruthy();
    expect(screen.getByText('à 1,3 km · Entrée du parc')).toBeTruthy();
    expect(screen.getByText('2/6 chiens')).toBeTruthy();
    expect(screen.getByText('Petit, Moyen')).toBeTruthy();
    expect(screen.getByText('Laisse obligatoire')).toBeTruthy();
    expect(screen.queryByText(t.walk.approval)).toBeNull();
    expect(screen.queryByText(t.walk.full)).toBeNull();
  });

  it('says « Complet » when every place is taken', async () => {
    await renderWithTheme(<WalkCard walk={walkResult({ acceptedDogsCount: 6 })} />);
    expect(screen.getByText(t.walk.full)).toBeTruthy();
    expect(screen.queryByText('6/6 chiens')).toBeNull();
  });

  it('shows the « Sur approbation » badge', async () => {
    await renderWithTheme(
      <WalkCard walk={walkResult({ access: 'Approval' })} onPress={() => {}} />,
    );
    expect(screen.getByText(t.walk.approval)).toBeTruthy();
    expect(cardLabel()).toContain(t.walk.approval);
  });

  it('marks professional walks with a badge and the organisation name', async () => {
    await renderWithTheme(
      <WalkCard
        walk={walkResult({
          isProfessional: true,
          organization: { id: 'org-1', name: 'Club canin du lac' },
        })}
        onPress={() => {}}
      />,
    );
    expect(screen.getByText('Pro · Club canin du lac')).toBeTruthy();
    expect(cardLabel()).toContain('Club canin du lac');
  });

  it('shows a discreet warning when a blocked person takes part', async () => {
    await renderWithTheme(
      <WalkCard walk={walkResult({ hasBlockedParticipant: true })} onPress={() => {}} />,
    );
    expect(screen.getByLabelText(t.walk.blockedParticipantA11y)).toBeTruthy();
  });

  it('shows cancelled walks and my pending or accepted registration', async () => {
    await renderWithTheme(
      <WalkCard
        walk={{
          ...walkResult({ status: 'Cancelled' }),
          myRegistrations: [{ id: 'r1', dogId: 'd1', status: 'Pending' }],
        }}
      />,
    );
    expect(screen.getByText(t.walk.cancelled)).toBeTruthy();
    expect(screen.getByText(t.walk.pending)).toBeTruthy();
  });

  it('measures the distance from the user when the position is known', async () => {
    await renderWithTheme(
      <WalkCard walk={walkResult()} origin={{ latitude: 48.86, longitude: 2.35 }} />,
    );
    expect(screen.getByText('à 10 m · Entrée du parc')).toBeTruthy();
  });
});
