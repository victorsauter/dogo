import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Participant } from '@/api/types';
import { format, t } from '@/strings';
import { otherDog, otherUser, participant, testDog, testUser } from '@/test/fixtures';
import { renderWithTheme } from '@/test/render';

import { ParticipantsCard, type ParticipantsCardProps } from '..';

const metrics = {
  frame: { x: 0, y: 0, width: 400, height: 800 },
  insets: { top: 60, left: 0, right: 0, bottom: 30 },
};

const pixel = participant(otherDog, 'reg-1');
const moka = participant({ ...otherDog, id: 'd3', name: 'Moka', size: 'Large' }, 'reg-2');
/** My own dog, accepted. */
const mine = participant(testDog, 'reg-me', {
  id: testUser.id,
  displayName: testUser.displayName,
  photoUrl: null,
});

function setup(overrides: Partial<ParticipantsCardProps> = {}) {
  const props = {
    walk: {
      acceptedDogsCount: 2,
      maxDogs: 6,
      participants: [pixel],
      pendingRegistrations: [],
    },
    currentUserId: testUser.id,
    organizer: false,
    open: true,
    onOpenDog: jest.fn(),
    onOpenUser: jest.fn(),
    onRemove: jest.fn(),
    onAccept: jest.fn(),
    onDecline: jest.fn(),
    ...overrides,
  } satisfies ParticipantsCardProps;
  const render = (ui: ReactElement) =>
    renderWithTheme(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);
  return { props, render: () => render(<ParticipantsCard {...props} />) };
}

const walkWith = (walk: Partial<ParticipantsCardProps['walk']>) => ({
  acceptedDogsCount: 2,
  maxDogs: 6,
  participants: [pixel],
  pendingRegistrations: [] as Participant[],
  ...walk,
});

describe('seats gauge', () => {
  it('says how many dogs are in and how many places are left, for everyone', async () => {
    const { render } = setup({ walk: walkWith({ acceptedDogsCount: 3 }) });
    await render();
    expect(screen.getByText('3 chiens sur 6')).toBeTruthy();
    expect(screen.getByText('3 places')).toBeTruthy();
    const gauge = screen.getByRole('progressbar');
    expect(gauge).toHaveProp('accessibilityValue', { min: 0, max: 6, now: 3 });
    expect(screen.getByTestId('seats-bar')).toHaveStyle({ width: '50%' });
  });

  it('says « Complet » when every place is taken', async () => {
    const { render } = setup({ walk: walkWith({ acceptedDogsCount: 6 }) });
    await render();
    expect(screen.getByText('6 chiens sur 6')).toBeTruthy();
    expect(screen.getByText(t.walk.full)).toBeTruthy();
    expect(screen.queryByText(/place/)).toBeNull();
    expect(screen.getByTestId('seats-bar')).toHaveStyle({ width: '100%' });
  });

  it('uses the singular: one dog, one place', async () => {
    const { render } = setup({ walk: walkWith({ acceptedDogsCount: 1, maxDogs: 2 }) });
    await render();
    expect(screen.getByText('1 chien sur 2')).toBeTruthy();
    expect(screen.getByText('1 place')).toBeTruthy();
  });
});

describe('a participant row', () => {
  it('shows the dog with its size in a pill, then its owner; touching it opens the dog', async () => {
    const { props, render } = setup();
    await render();
    expect(screen.getByText('Pixel')).toBeTruthy();
    expect(within(screen.getByTestId('participant-size-reg-1')).getByText('Petit')).toBeTruthy();
    expect(screen.getByText(otherUser.displayName)).toBeTruthy();
    expect(screen.queryByText(/ · Petit/)).toBeNull();

    const row = screen.getByRole('button', { name: `Pixel, petit, avec ${otherUser.displayName}` });
    await fireEvent.press(row);
    expect(props.onOpenDog).toHaveBeenCalledWith(otherDog.id);
  });

  it('says « Toi » on my own dog', async () => {
    const { render } = setup({ walk: walkWith({ participants: [pixel, mine] }) });
    await render();
    expect(screen.getByText(t.walk.you)).toBeTruthy();
    expect(screen.queryByText(testUser.displayName)).toBeNull();
    expect(screen.getByText(otherUser.displayName)).toBeTruthy();
  });

  it('opens the owner’s profile from their picture or name, for any visitor', async () => {
    const { props, render } = setup();
    await render();

    await fireEvent.press(screen.getByTestId('participant-owner-photo-reg-1'));
    await fireEvent.press(screen.getByTestId('participant-owner-name-reg-1'));
    expect(props.onOpenUser).toHaveBeenCalledTimes(2);
    expect(props.onOpenUser).toHaveBeenCalledWith(otherUser.id);
    expect(props.onOpenDog).not.toHaveBeenCalled();

    const row = screen.getByRole('button', { name: `Pixel, petit, avec ${otherUser.displayName}` });
    expect(row).toHaveProp('accessibilityActions', [
      { name: 'owner', label: `Voir ${otherUser.displayName}` },
    ]);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'owner' } });
    expect(props.onOpenUser).toHaveBeenCalledTimes(3);
  });

  it('does not open my own profile from my dog’s row', async () => {
    const { props, render } = setup({ walk: walkWith({ participants: [mine] }) });
    await render();

    await fireEvent.press(screen.getByTestId('participant-owner-photo-reg-me'));
    await fireEvent.press(screen.getByTestId('participant-owner-name-reg-me'));
    expect(props.onOpenUser).not.toHaveBeenCalled();
  });

  it('says so when no dog is registered', async () => {
    const { render } = setup({ walk: walkWith({ acceptedDogsCount: 0, participants: [] }) });
    await render();
    expect(screen.getByText(t.walk.noParticipants)).toBeTruthy();
  });
});

describe('the organizer’s tools on a row', () => {
  const actionsOf = (name: string) =>
    screen.queryByRole('button', { name: format(t.walk.participantActionsA11y, { dog: name }) });

  const both = walkWith({ participants: [pixel, mine] });

  it('has no « … » button for a visitor', async () => {
    await setup({ walk: both }).render();
    expect(actionsOf('Pixel')).toBeNull();
    expect(screen.queryByTestId('participant-swipe-reg-1')).toBeNull();
  });

  it('has none either once the walk is no longer open', async () => {
    await setup({ walk: both, organizer: true, open: false }).render();
    expect(actionsOf('Pixel')).toBeNull();
    expect(screen.queryByTestId('participant-swipe-reg-1')).toBeNull();
  });

  it('has it for the organizer on an open walk, but not on their own dog', async () => {
    await setup({ walk: both, organizer: true }).render();
    expect(actionsOf('Pixel')).toBeTruthy();
    expect(actionsOf(testDog.name)).toBeNull();
    expect(screen.queryByTestId('participant-swipe-reg-me')).toBeNull();
    expect(screen.getByTestId('participant-swipe-reg-1')).toBeTruthy();
  });

  it('opens the dog, the owner, or removes, from the menu', async () => {
    const { props, render } = setup({ organizer: true });
    await render();

    await fireEvent.press(actionsOf('Pixel')!);
    expect(screen.getByRole('menuitem', { name: 'Voir Pixel' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: `Voir ${otherUser.displayName}` })).toBeTruthy();
    await fireEvent.press(screen.getByRole('menuitem', { name: `Voir ${otherUser.displayName}` }));
    expect(props.onOpenUser).toHaveBeenCalledWith(otherUser.id);
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());

    await fireEvent.press(actionsOf('Pixel')!);
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Voir Pixel' }));
    expect(props.onOpenDog).toHaveBeenCalledWith(otherDog.id);
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());

    await fireEvent.press(actionsOf('Pixel')!);
    await fireEvent.press(screen.getByRole('menuitem', { name: t.walk.removeFromWalk }));
    expect(props.onRemove).toHaveBeenCalledWith(pixel);
  });

  it('removes with the swipe action and with the screen reader action', async () => {
    const { props, render } = setup({ organizer: true });
    await render();

    await fireEvent.press(
      screen.getByTestId('participant-swipe-remove-reg-1', { includeHiddenElements: true }),
    );
    expect(props.onRemove).toHaveBeenCalledTimes(1);

    const row = screen.getByRole('button', { name: `Pixel, petit, avec ${otherUser.displayName}` });
    expect(row).toHaveProp('accessibilityActions', [
      { name: 'owner', label: `Voir ${otherUser.displayName}` },
      { name: 'remove', label: t.walk.remove },
    ]);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'remove' } });
    expect(props.onRemove).toHaveBeenCalledTimes(2);
  });

  it('shows a spinner on the row being removed, in place of the menu', async () => {
    const { render } = setup({ organizer: true, decliningId: 'reg-1' });
    await render();
    expect(actionsOf('Pixel')).toBeNull();
    expect(screen.queryByTestId('participant-swipe-reg-1')).toBeNull();
  });
});

describe('requests to validate', () => {
  const pending = walkWith({ pendingRegistrations: [moka] });
  const accept = `Accepter Moka de ${otherUser.displayName}`;
  const decline = `Refuser Moka de ${otherUser.displayName}`;

  it('lists them for the organizer, with a round accept and a round decline button', async () => {
    const { props, render } = setup({ organizer: true, walk: pending });
    await render();
    expect(screen.getByText('1 demande à valider')).toBeTruthy();
    expect(screen.getByText(t.walk.registeredTitle)).toBeTruthy();
    expect(screen.getAllByText(otherUser.displayName).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Grand').length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByRole('button', { name: accept }));
    expect(props.onAccept).toHaveBeenCalledWith('reg-2');
    await fireEvent.press(screen.getByRole('button', { name: decline }));
    expect(props.onDecline).toHaveBeenCalledWith('reg-2');
  });

  it('counts several requests', async () => {
    const { render } = setup({
      organizer: true,
      walk: walkWith({ pendingRegistrations: [moka, pixel] }),
    });
    await render();
    expect(screen.getByText('2 demandes à valider')).toBeTruthy();
  });

  it('shows a spinner in place of the icon while a request is being handled', async () => {
    const { render } = setup({ organizer: true, walk: pending, acceptingId: 'reg-2' });
    await render();
    const button = screen.getByRole('button', { name: accept });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: decline })).not.toBeBusy();
  });

  it('shows nothing when there is no request, and no heading for the registered dogs', async () => {
    const { render } = setup({ organizer: true });
    await render();
    expect(screen.queryByTestId('pending-requests')).toBeNull();
    expect(screen.queryByText(/à valider/)).toBeNull();
    expect(screen.queryByText(t.walk.registeredTitle)).toBeNull();
    expect(screen.queryByText('Aucune demande en attente.')).toBeNull();
  });

  it('are for the organizer only', async () => {
    const { render } = setup({ walk: pending });
    await render();
    expect(screen.queryByText(/à valider/)).toBeNull();
    expect(screen.queryByRole('button', { name: accept })).toBeNull();
  });

  it('have no button once the walk is no longer open', async () => {
    const { render } = setup({ organizer: true, walk: pending, open: false });
    await render();
    expect(screen.getByText('1 demande à valider')).toBeTruthy();
    expect(screen.queryByRole('button', { name: accept })).toBeNull();
    expect(screen.queryByRole('button', { name: decline })).toBeNull();
  });
});
