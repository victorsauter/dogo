import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as Location from 'expo-location';
import { Alert } from 'react-native';

import { sessionStore } from '@/auth/sessionStore';
import { t } from '@/strings';
import {
  authResponse,
  otherDog,
  otherUser,
  participant,
  testDog,
  testUser,
  walkDetail,
  walkResult,
} from '@/test/fixtures';
import { mockApi, ok, problemResponse } from '@/test/mockApi';

const APP_DIR = './src/app';
const walk = walkDetail();
const walkPath = `/api/v1/walks/${walk.id}`;

async function signIn() {
  await sessionStore.set(authResponse());
}

afterEach(async () => {
  await act(() => sessionStore.clear());
  jest.restoreAllMocks();
});

/** Presses the destructive button of the last `Alert.alert` confirmation. */
async function confirmAlert(alert: jest.SpyInstance) {
  await waitFor(() => expect(alert).toHaveBeenCalled());
  const buttons = alert.mock.calls.at(-1)![2] as { style?: string; onPress?: () => void }[];
  await act(async () => buttons.find((b) => b.style === 'destructive')!.onPress!());
}

const searchCalls = (calls: { method: string; path: string }[]) =>
  calls.filter((c) => c.method === 'GET' && c.path.startsWith('/api/v1/walks?'));
const query = (path: string) => Object.fromEntries(new URL(`http://x${path}`).searchParams);

describe('« Balades » tab (default view: map and panel)', () => {
  it('searches around the user and lists the walks on the map and in the list', async () => {
    const { calls } = mockApi({ 'GET /api/v1/walks': () => ok([walkResult()]) });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: '/' });

    expect(await screen.findByText('Tour du lac')).toBeTruthy();
    expect(screen.getByLabelText(t.discover.mapLabel)).toBeTruthy();
    expect(screen.getAllByTestId('map-marker')).toHaveLength(1);
    const params = query(searchCalls(calls)[0]!.path);
    expect(params).toMatchObject({ lat: '47.6234', lng: '7.2376', radiusKm: '5.4', limit: '100' });
    expect(params.to).toBeDefined();
    expect(params.size).toBeUndefined();
  });

  it('follows the visible map area and the filters', async () => {
    const { calls } = mockApi({ 'GET /api/v1/walks': () => ok([]) });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await waitFor(() => expect(searchCalls(calls)).toHaveLength(1));

    await fireEvent(screen.getByTestId('walks-map'), 'regionChangeComplete', {
      latitude: 45.764,
      longitude: 4.8357,
      latitudeDelta: 2,
      longitudeDelta: 2,
    });
    await waitFor(() => expect(searchCalls(calls)).toHaveLength(2));
    expect(query(searchCalls(calls)[1]!.path)).toMatchObject({
      lat: '45.764',
      lng: '4.8357',
      radiusKm: '100',
    });

    await fireEvent.press(screen.getByTestId('filter-size'));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Grand' }));
    await waitFor(() => expect(screen.queryByTestId('menu')).toBeNull());
    await fireEvent.press(screen.getByTestId('filter-period'));
    await fireEvent.press(screen.getByRole('menuitem', { name: t.discover.periodAll }));
    await waitFor(() => {
      const last = query(searchCalls(calls).at(-1)!.path);
      expect(last.size).toBe('Large');
      expect(last.to).toBeUndefined();
    });
  });

  it('invites to widen the area or create a walk when there is none', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([]) });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: '/' });

    // The panel's handle says it too (« Aucune balade dans cette zone »): the message is unique.
    expect(await screen.findByText(t.discover.emptyMessage)).toBeTruthy();
    // The header button and the empty state's action both create a walk.
    await fireEvent.press(screen.getAllByRole('button', { name: t.discover.emptyAction }).at(-1)!);
    expect(await screen.findByLabelText(t.walk.title)).toBeTruthy();
    expect(screen).toHavePathname('/walks/new');
  });

  it('keeps working on a default centre when location is refused', async () => {
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockResolvedValueOnce({ granted: false } as never);
    const { calls } = mockApi({ 'GET /api/v1/walks': () => ok([]) });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: '/' });

    expect(await screen.findByText(t.discover.locationDenied)).toBeTruthy();
    await waitFor(() => expect(searchCalls(calls)).toHaveLength(1));
    expect(query(searchCalls(calls)[0]!.path)).toMatchObject({ lat: '47.5339', lng: '7.1844' });
  });
});

describe('walk detail and registration', () => {
  function routes(detail = walk, myDogs = [testDog]) {
    return {
      [`GET ${walkPath}`]: () => ok(detail),
      'GET /api/v1/me/dogs': () => ok(myDogs),
    };
  }

  async function openWalk() {
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: `/walks/${walk.id}` });
    await screen.findByText(walk.title);
  }

  it('shows everything about the walk, with the organizer and the participants', async () => {
    mockApi(routes(walkDetail({ participants: [participant(otherDog, 'reg-1')] })));
    await openWalk();

    expect(screen.getByText(walk.locationLabel)).toBeTruthy();
    expect(screen.getByText(walk.description)).toBeTruthy();
    expect(screen.getByText(walk.rules)).toBeTruthy();
    expect(screen.getByText(otherUser.displayName)).toBeTruthy();
    expect(screen.getByText('Pixel')).toBeTruthy();
    // One row per dog: its owner and size under its name, touching it opens the dog.
    expect(screen.getByText(`${otherUser.displayName} · Petit`)).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: `Pixel, avec ${otherUser.displayName}` }),
    );
    expect(screen).toHavePathname(`/dogs/${otherDog.id}`);
  });

  it('registers on an open walk: « Inscrit »', async () => {
    let detail = walk;
    const { calls } = mockApi({
      ...routes(),
      [`GET ${walkPath}`]: () => ok(detail),
      [`POST ${walkPath}/registrations`]: () => {
        detail = walkDetail({
          acceptedDogsCount: 3,
          participants: [participant(testDog, 'reg-1', { ...otherUser, id: testUser.id })],
          myRegistrations: [{ id: 'reg-1', dogId: testDog.id, status: 'Accepted' }],
        });
        return ok([
          {
            id: 'reg-1',
            walkId: walk.id,
            dogId: testDog.id,
            userId: testUser.id,
            status: 'Accepted',
            createdAt: '',
          },
        ]);
      },
    });
    await openWalk();

    await fireEvent.press(await screen.findByRole('checkbox', { name: testDog.name }));
    await fireEvent.press(screen.getByRole('button', { name: 'Inscrire 1 chien' }));

    expect(await screen.findByText(t.walk.registeredOpen)).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST')!.json).toEqual({ dogIds: [testDog.id] });
    expect(await screen.findByText(t.walk.myRegistrations)).toBeTruthy();
    expect(screen.getByText('Acceptée')).toBeTruthy();
    expect(
      screen.getByRole('checkbox', { name: `${testDog.name}, ${t.walk.alreadyRegistered}` }),
    ).toBeDisabled();
  });

  it('registers on an approval walk: « En attente de validation »', async () => {
    mockApi({
      ...routes(walkDetail({ access: 'Approval' })),
      [`POST ${walkPath}/registrations`]: () =>
        ok([
          {
            id: 'reg-1',
            walkId: walk.id,
            dogId: testDog.id,
            userId: testUser.id,
            status: 'Pending',
            createdAt: '',
          },
        ]),
    });
    await openWalk();
    await fireEvent.press(await screen.findByRole('checkbox', { name: testDog.name }));
    await fireEvent.press(screen.getByRole('button', { name: 'Inscrire 1 chien' }));
    expect(await screen.findByText(t.walk.registeredApproval)).toBeTruthy();
  });

  it('shows the organizer’s decision when I pull the page', async () => {
    let detail = walkDetail({
      access: 'Approval',
      myRegistrations: [{ id: 'reg-1', dogId: testDog.id, status: 'Pending' }],
    });
    mockApi({ ...routes(), [`GET ${walkPath}`]: () => ok(detail) });
    await openWalk();
    expect(await screen.findByText('En attente')).toBeTruthy();

    // Accepted by the organizer, elsewhere.
    detail = {
      ...detail,
      myRegistrations: [{ ...detail.myRegistrations[0]!, status: 'Accepted' }],
    };
    const { refreshControl } = screen.getByTestId('walk-detail').props as {
      refreshControl: { props: { onRefresh: () => Promise<void> } };
    };
    await act(() => refreshControl.props.onRefresh());
    expect(await screen.findByText('Acceptée')).toBeTruthy();
    expect(screen.queryByText('En attente')).toBeNull();
  });

  it('disables dogs whose size is not allowed, with the reason', async () => {
    mockApi(routes(walkDetail({ allowedSizes: ['Small'] })));
    await openWalk();
    const choice = await screen.findByRole('checkbox', {
      name: `${testDog.name}, Gabarit non admis (Moyen)`,
    });
    expect(choice).toBeDisabled();
    expect(screen.getByRole('button', { name: t.walk.registerPick })).toBeDisabled();
  });

  it('says the walk is full instead of offering to register', async () => {
    mockApi(routes(walkDetail({ acceptedDogsCount: 6 })));
    await openWalk();
    expect(await screen.findByText(t.walk.fullHint)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it.each([
    ['registration.duplicate', 409],
    ['walk.full', 409],
    ['walk.size_not_allowed', 409],
    ['walk.not_open', 409],
  ])('explains the refusal %s in French', async (code, status) => {
    mockApi({
      ...routes(),
      [`POST ${walkPath}/registrations`]: () => problemResponse(status, code),
    });
    await openWalk();
    await fireEvent.press(await screen.findByRole('checkbox', { name: testDog.name }));
    await fireEvent.press(screen.getByRole('button', { name: 'Inscrire 1 chien' }));
    expect(await screen.findByText(t.errors[code as 'walk.full'])).toBeTruthy();
  });

  it('a refusal tells the screen it is out of date: the walk is read again', async () => {
    const { calls } = mockApi({
      ...routes(),
      [`POST ${walkPath}/registrations`]: () => problemResponse(409, 'walk.not_open'),
    });
    await openWalk();
    await fireEvent.press(await screen.findByRole('checkbox', { name: testDog.name }));
    await fireEvent.press(screen.getByRole('button', { name: 'Inscrire 1 chien' }));
    expect(await screen.findByText(t.errors['walk.not_open'])).toBeTruthy();
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'GET' && c.path === walkPath)).toHaveLength(2),
    );
  });

  it('a blocked person gets the very same refusal as for a full walk (ADR 0037)', async () => {
    mockApi({
      ...routes(),
      [`POST ${walkPath}/registrations`]: () => problemResponse(409, 'walk.full'),
    });
    await openWalk();
    await fireEvent.press(await screen.findByRole('checkbox', { name: testDog.name }));
    await fireEvent.press(screen.getByRole('button', { name: 'Inscrire 1 chien' }));
    expect(await screen.findByText('Cette balade est complète.')).toBeTruthy();
  });

  it('offers to add a dog when I have none', async () => {
    mockApi(routes(walk, []));
    await openWalk();
    expect(await screen.findByText(t.walk.noDogTitle)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: t.walk.addDog }));
    expect(await screen.findByLabelText(t.dog.name)).toBeTruthy();
    expect(screen).toHavePathname('/dogs/new');
  });

  it('cancels my registration after confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { calls } = mockApi({
      ...routes(
        walkDetail({ myRegistrations: [{ id: 'reg-9', dogId: testDog.id, status: 'Pending' }] }),
      ),
      [`DELETE ${walkPath}/registrations/reg-9`]: () => new Response(null, { status: 204 }),
    });
    await openWalk();
    expect(await screen.findByText('En attente')).toBeTruthy();
    await fireEvent.press(
      await screen.findByRole('button', { name: `${t.walk.cancelRegistration} : ${testDog.name}` }),
    );
    expect(alert.mock.calls[0]![0]).toBe(`Annuler l’inscription de ${testDog.name} ?`);
    await confirmAlert(alert);
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
  });

  it('shows cancelled and past walks with a banner and no registration', async () => {
    mockApi(routes(walkDetail({ status: 'Cancelled' })));
    await openWalk();
    expect(screen.getByText(t.walk.cancelledBanner)).toBeTruthy();
    expect(screen.queryByText(t.walk.registerTitle)).toBeNull();
  });
});

describe('organizer tools', () => {
  const mine = (overrides = {}) =>
    walkDetail({
      isOrganizer: true,
      organizer: { id: testUser.id, displayName: testUser.displayName, photoUrl: null },
      ...overrides,
    });

  async function openMine(detail: ReturnType<typeof mine>, extra = {}) {
    const result = mockApi({
      [`GET ${walkPath}`]: () => ok(detail),
      'GET /api/v1/me/dogs': () => ok([testDog]),
      ...extra,
    });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: `/walks/${walk.id}` });
    await screen.findByText(walk.title);
    return result;
  }

  it('accepts and declines pending requests', async () => {
    const pending = [
      participant(otherDog, 'reg-1'),
      participant({ ...otherDog, id: 'd3', name: 'Moka' }, 'reg-2'),
    ];
    const { calls } = await openMine(mine({ access: 'Approval', pendingRegistrations: pending }), {
      [`POST ${walkPath}/registrations/reg-1/accept`]: () => ok({}),
      [`POST ${walkPath}/registrations/reg-2/decline`]: () => ok({}),
    });

    await fireEvent.press(
      screen.getByRole('button', { name: `Accepter Pixel de ${otherUser.displayName}` }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: `Refuser Moka de ${otherUser.displayName}` }),
    );
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([
        `${walkPath}/registrations/reg-1/accept`,
        `${walkPath}/registrations/reg-2/decline`,
      ]),
    );
  });

  it('shows the API refusal of an acceptance (walk full)', async () => {
    await openMine(mine({ pendingRegistrations: [participant(otherDog, 'reg-1')] }), {
      [`POST ${walkPath}/registrations/reg-1/accept`]: () => problemResponse(409, 'walk.full'),
    });
    await fireEvent.press(
      screen.getByRole('button', { name: `Accepter Pixel de ${otherUser.displayName}` }),
    );
    expect(await screen.findByText(t.errors['walk.full'])).toBeTruthy();
  });

  it('explains an acceptance refused because the author left the organisation, and refreshes the request list', async () => {
    let detail = mine({ pendingRegistrations: [participant(otherDog, 'reg-1')] });
    const { calls } = await openMine(detail, {
      [`GET ${walkPath}`]: () => ok(detail),
      [`POST ${walkPath}/registrations/reg-1/accept`]: () => {
        // The author's registration was cancelled when they left.
        detail = mine({ pendingRegistrations: [] });
        return problemResponse(409, 'walk.members_only');
      },
    });
    await fireEvent.press(
      screen.getByRole('button', { name: `Accepter Pixel de ${otherUser.displayName}` }),
    );
    expect(await screen.findByText(t.walk.acceptNotMember)).toBeTruthy();
    // The refusal says the screen was out of date: the walk is read again and the request is gone.
    await waitFor(() => expect(screen.queryByText('Pixel')).toBeNull());
    expect(calls.filter((c) => c.method === 'GET' && c.path === walkPath).length).toBeGreaterThan(
      1,
    );
  });

  it('shows « registration.not_active » when the request was cancelled meanwhile', async () => {
    await openMine(mine({ pendingRegistrations: [participant(otherDog, 'reg-1')] }), {
      [`POST ${walkPath}/registrations/reg-1/accept`]: () =>
        problemResponse(409, 'registration.not_active'),
    });
    await fireEvent.press(
      screen.getByRole('button', { name: `Accepter Pixel de ${otherUser.displayName}` }),
    );
    expect(await screen.findByText(t.errors['registration.not_active'])).toBeTruthy();
  });

  it('removes a participant after confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { calls } = await openMine(mine({ participants: [participant(otherDog, 'reg-1')] }), {
      [`POST ${walkPath}/registrations/reg-1/decline`]: () => ok({}),
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Actions pour Pixel' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: t.walk.removeFromWalk }));
    expect(alert.mock.calls[0]![0]).toBe('Retirer Pixel de la balade ?');
    await confirmAlert(alert);
    await waitFor(() =>
      expect(calls.some((c) => c.path === `${walkPath}/registrations/reg-1/decline`)).toBe(true),
    );
  });

  it('can register their own dogs and cancel the walk after confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let detail = mine();
    const { calls } = await openMine(detail, {
      [`GET ${walkPath}`]: () => ok(detail),
      [`POST ${walkPath}/cancel`]: () => {
        detail = mine({ status: 'Cancelled' });
        return ok(detail);
      },
    });
    expect(await screen.findByRole('checkbox', { name: testDog.name })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: t.walk.cancelWalk }));
    expect(alert.mock.calls[0]![1]).toBe(t.walk.cancelWalkMessage);
    await confirmAlert(alert);
    expect(await screen.findByText(t.walk.cancelledBanner)).toBeTruthy();
    expect(calls.some((c) => c.path === `${walkPath}/cancel`)).toBe(true);
    expect(screen.queryByRole('button', { name: t.walk.editWalk })).toBeNull();
  });
});

describe('« Mes balades » tab', () => {
  it('switches between organised / joined and upcoming / past', async () => {
    const { calls } = mockApi({
      'GET /api/v1/me/walks': (req) => {
        const { role, when } = query(req.path);
        if (role === 'Participant' && when === 'Upcoming') {
          return ok([
            {
              ...walkResult({ title: 'Balade rejointe' }),
              myRegistrations: [{ id: 'r', dogId: 'd', status: 'Pending' }],
            },
          ]);
        }
        return ok([]);
      },
    });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: '/mine' });

    expect(await screen.findByText(t.myWalks.emptyOrganizedTitle)).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: t.myWalks.joined }));
    expect(await screen.findByText('Balade rejointe')).toBeTruthy();
    expect(screen.getByText(t.walk.pending)).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: t.myWalks.past }));
    expect(await screen.findByText(t.myWalks.emptyPastTitle)).toBeTruthy();

    const asked = calls
      .filter((c) => c.path.startsWith('/api/v1/me/walks'))
      .map((c) => query(c.path));
    expect(asked).toEqual([
      { role: 'Organizer', when: 'Upcoming' },
      { role: 'Participant', when: 'Upcoming' },
      { role: 'Participant', when: 'Past' },
    ]);
  });

  it('shows cancelled walks and invites to create one when none is organised', async () => {
    mockApi({ 'GET /api/v1/me/walks': () => ok([walkResult({ status: 'Cancelled' })]) });
    await signIn();
    await renderRouter(APP_DIR, { initialUrl: '/mine' });
    expect(await screen.findByText(t.walk.cancelled)).toBeTruthy();
  });
});
