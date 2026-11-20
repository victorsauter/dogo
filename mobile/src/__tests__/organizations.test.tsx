import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { sessionStore } from '@/auth/sessionStore';
import { enumLabel, format, plural, t } from '@/strings';
import {
  authResponse,
  membership,
  myMembership,
  orgId,
  organizationDetail,
  organizationSummary,
  otherUser,
  testUser,
  walkDetail,
  walkResult,
} from '@/test/fixtures';
import { mockApi, ok, problemResponse, screenCalls } from '@/test/mockApi';

const APP_DIR = './src/app';
const orgPath = `/api/v1/organizations/${orgId}`;
const membersPath = `${orgPath}/memberships`;
const mine = myMembership();

afterEach(async () => {
  await act(() => sessionStore.clear());
  jest.restoreAllMocks();
});

async function openAt(url: string) {
  await sessionStore.set(authResponse());
  await renderRouter(APP_DIR, { initialUrl: url });
}

/** Presses the destructive button of the last `Alert.alert` confirmation. */
async function confirmAlert(alert: jest.SpyInstance) {
  await waitFor(() => expect(alert).toHaveBeenCalled());
  const buttons = alert.mock.calls.at(-1)![2] as { style?: string; onPress?: () => void }[];
  await act(async () => buttons.find((b) => b.style === 'destructive')!.onPress!());
}

describe('my organisations (profile tab)', () => {
  it('lists them with my role and what is pending, and offers search and creation', async () => {
    mockApi({
      'GET /api/v1/me': () => ok(testUser),
      'GET /api/v1/me/dogs': () => ok([]),
      'GET /api/v1/me/organizations': () =>
        ok([
          { organization: organizationSummary(), membership: myMembership('Educator') },
          {
            organization: organizationSummary({
              id: 'org-2',
              name: 'Éducateurs de Lyon',
              status: 'Pending',
            }),
            membership: { ...mine, id: 'm2', role: 'Owner' },
          },
          {
            organization: organizationSummary({ id: 'org-3', name: 'Club du parc' }),
            membership: myMembership('Member', 'Pending'),
          },
          {
            organization: organizationSummary({ id: 'org-4', name: 'Club refusé' }),
            membership: myMembership('Member', 'Declined'),
          },
        ]),
    });
    await openAt('/profile');

    expect(await screen.findByText('Club canin du lac')).toBeTruthy();
    expect(screen.getByText(enumLabel('MembershipRole', 'Educator'))).toBeTruthy();
    expect(screen.getByText('Éducateurs de Lyon')).toBeTruthy();
    expect(screen.getByText(t.organization.pendingBadge)).toBeTruthy();
    expect(screen.getByText('Club du parc')).toBeTruthy();
    expect(screen.getByText(t.organization.requestBadge)).toBeTruthy();
    expect(screen.queryByText('Club refusé')).toBeNull();
    expect(screen.getByRole('button', { name: t.organization.find })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.organization.create })).toBeTruthy();
  });

  it('says so when there is none', async () => {
    mockApi({
      'GET /api/v1/me': () => ok(testUser),
      'GET /api/v1/me/dogs': () => ok([]),
      'GET /api/v1/me/organizations': () => ok([]),
    });
    await openAt('/profile');
    expect(await screen.findByText(t.organization.mineEmpty)).toBeTruthy();
  });
});

describe('search', () => {
  it('searches by name or city after a pause, and opens a result', async () => {
    const { calls } = mockApi({
      'GET /api/v1/organizations': ({ path }) =>
        ok(path.includes('query=lac') ? [organizationSummary()] : []),
      [`GET ${orgPath}`]: () => ok(organizationDetail()),
    });
    await openAt('/organizations');
    expect(await screen.findByText(t.organization.searchEmptyTitle)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(t.organization.searchLabel), 'lac');
    await fireEvent.changeText(screen.getByLabelText(t.organization.searchLabel), ' lac ');
    expect(await screen.findByText('Club canin du lac')).toBeTruthy();
    // One request per settled text, not one per keystroke.
    const searches = calls.filter((c) => c.path.startsWith('/api/v1/organizations?'));
    expect(searches.map((c) => c.path)).toEqual([
      '/api/v1/organizations?query=',
      '/api/v1/organizations?query=lac',
    ]);
    expect(screen.getByText(`Annecy · ${plural(t.organization.memberCount, 12)}`)).toBeTruthy();

    await fireEvent.press(screen.getByText('Club canin du lac'));
    expect(await screen.findByText(t.organization.join)).toBeTruthy();
    expect(screen).toHavePathname(`/organizations/${orgId}`);
  });

  it('shows an empty state when nothing matches', async () => {
    mockApi({ 'GET /api/v1/organizations': () => ok([]) });
    await openAt('/organizations');
    expect(await screen.findByText(t.organization.searchEmptyTitle)).toBeTruthy();
    expect(screen.getByText(t.organization.searchEmptyMessage)).toBeTruthy();
  });
});

describe('create', () => {
  it('validates the name before sending anything', async () => {
    const { calls } = mockApi({});
    await openAt('/organizations/new');
    expect(await screen.findByText(t.organization.createExplanation)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(t.organization.name), 'ab');
    await fireEvent.press(screen.getByRole('button', { name: t.organization.createSubmit }));

    expect(screen.getByText(format(t.organization.nameLength, { min: 3, max: 80 }))).toBeTruthy();
    expect(screenCalls(calls)).toHaveLength(0);
  });

  it('sends the request, then shows the pending organisation', async () => {
    const pending = organizationDetail({
      status: 'Pending',
      myMembership: { ...mine, role: 'Owner' },
      educators: [{ user: { ...otherUser, displayName: testUser.displayName }, role: 'Owner' }],
    });
    const { calls } = mockApi({
      'POST /api/v1/organizations': () => ok(organizationSummary({ status: 'Pending' })),
      [`GET ${orgPath}`]: () => ok(pending),
      'GET /api/v1/me/organizations': () => ok([]),
    });
    await openAt('/organizations/new');

    await fireEvent.changeText(screen.getByLabelText(t.organization.name), ' Club canin du lac ');
    await fireEvent.changeText(screen.getByLabelText(t.organization.city), 'Annecy');
    await fireEvent.press(screen.getByRole('button', { name: t.organization.createSubmit }));

    expect(await screen.findByText(t.organization.statusBanner.Pending)).toBeTruthy();
    expect(screen).toHavePathname(`/organizations/${orgId}`);
    expect(calls.find((c) => c.method === 'POST')!.json).toEqual({
      name: 'Club canin du lac',
      city: 'Annecy',
    });
  });

  it('explains organization.too_many_pending', async () => {
    mockApi({
      'POST /api/v1/organizations': () => problemResponse(409, 'organization.too_many_pending'),
    });
    await openAt('/organizations/new');
    await fireEvent.changeText(screen.getByLabelText(t.organization.name), 'Club canin');
    await fireEvent.press(screen.getByRole('button', { name: t.organization.createSubmit }));
    expect(await screen.findByText(t.errors['organization.too_many_pending'])).toBeTruthy();
  });
});

describe('detail', () => {
  const route = (detail = organizationDetail()) => ({
    [`GET ${orgPath}`]: () => ok(detail),
  });

  it('shows name, city, description, educators with their role, member count and walks', async () => {
    mockApi(
      route(
        organizationDetail({
          educators: [
            { user: otherUser, role: 'Owner' },
            { user: { ...otherUser, id: 'u3', displayName: 'Inès Roux' }, role: 'Educator' },
          ],
          upcomingWalks: [walkResult({ title: 'Cours collectif', isProfessional: true })],
        }),
      ),
    );
    await openAt(`/organizations/${orgId}`);

    expect(await screen.findByText('Club canin du lac')).toBeTruthy();
    expect(screen.getByText(`Annecy · ${plural(t.organization.memberCount, 12)}`)).toBeTruthy();
    expect(screen.getByText('Éducation positive, cours collectifs.')).toBeTruthy();
    expect(screen.getByText(otherUser.displayName)).toBeTruthy();
    expect(screen.getByText('Inès Roux')).toBeTruthy();
    expect(screen.getByText(enumLabel('MembershipRole', 'Educator'))).toBeTruthy();
    expect(screen.getByText('Cours collectif')).toBeTruthy();
  });

  it('opens an educator profile', async () => {
    mockApi({
      ...route(),
      [`GET /api/v1/users/${otherUser.id}`]: () => ok({ ...otherUser, bio: '', dogs: [] }),
      'GET /api/v1/me/blocks': () => ok([]),
    });
    await openAt(`/organizations/${orgId}`);
    await fireEvent.press(await screen.findByText(otherUser.displayName));
    expect(await screen.findByText(t.profile.noBio)).toBeTruthy();
    expect(screen).toHavePathname(`/users/${otherUser.id}`);
  });

  it('shows a banner when the organisation is not approved', async () => {
    mockApi(
      route(organizationDetail({ status: 'Pending', myMembership: { ...mine, role: 'Owner' } })),
    );
    await openAt(`/organizations/${orgId}`);
    expect(await screen.findByText(t.organization.statusBanner.Pending)).toBeTruthy();
    // Nothing to join, and no walks of a pending organisation.
    expect(screen.queryByRole('button', { name: t.organization.join })).toBeNull();
    expect(screen.queryByText(t.organization.upcomingWalks)).toBeNull();
  });

  it('does not show the organisation to someone who may not see it', async () => {
    mockApi({ [`GET ${orgPath}`]: () => problemResponse(404, 'organization.not_found') });
    await openAt(`/organizations/${orgId}`);
    expect(await screen.findByText(t.errors['organization.not_found'])).toBeTruthy();
    expect(screen.getByText(t.organization.notFoundTitle)).toBeTruthy();
    expect(screen.queryByText(t.states.errorTitle)).toBeNull();
  });

  describe('my membership', () => {
    it('non-member: asks to join, then shows « Demande envoyée »', async () => {
      let detail = organizationDetail();
      const { calls } = mockApi({
        [`GET ${orgPath}`]: () => ok(detail),
        [`POST ${membersPath}`]: () => {
          detail = organizationDetail({ myMembership: myMembership('Member', 'Pending') });
          return ok(membership({ status: 'Pending' }));
        },
      });
      await openAt(`/organizations/${orgId}`);

      await fireEvent.press(await screen.findByRole('button', { name: t.organization.join }));

      expect(await screen.findByText(t.organization.requested)).toBeTruthy();
      expect(screen.getByText(t.organization.requestedHint)).toBeTruthy();
      expect(calls.some((c) => c.method === 'POST' && c.path === membersPath)).toBe(true);
      expect(screen.queryByRole('button', { name: t.organization.join })).toBeNull();
    });

    it('pending request: can be withdrawn after a confirmation', async () => {
      const alert = jest.spyOn(Alert, 'alert');
      let detail = organizationDetail({ myMembership: myMembership('Member', 'Pending') });
      const { calls } = mockApi({
        [`GET ${orgPath}`]: () => ok(detail),
        [`DELETE ${membersPath}/${mine.id}`]: () => {
          detail = organizationDetail();
          return new Response(null, { status: 204 });
        },
      });
      await openAt(`/organizations/${orgId}`);

      await fireEvent.press(await screen.findByRole('button', { name: t.organization.withdraw }));
      await confirmAlert(alert);

      expect(await screen.findByRole('button', { name: t.organization.join })).toBeTruthy();
      expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
    });

    it('a declined request can be made again', async () => {
      mockApi({
        [`GET ${orgPath}`]: () =>
          ok(organizationDetail({ myMembership: myMembership('Member', 'Declined') })),
      });
      await openAt(`/organizations/${orgId}`);
      expect(await screen.findByText(t.organization.declinedHint)).toBeTruthy();
      expect(screen.getByRole('button', { name: t.organization.join })).toBeTruthy();
    });

    it('member: leaves after a confirmation, with no staff tools', async () => {
      const alert = jest.spyOn(Alert, 'alert');
      let detail = organizationDetail({ myMembership: mine });
      const { calls } = mockApi({
        [`GET ${orgPath}`]: () => ok(detail),
        [`DELETE ${membersPath}/${mine.id}`]: () => {
          detail = organizationDetail();
          return new Response(null, { status: 204 });
        },
      });
      await openAt(`/organizations/${orgId}`);

      expect(await screen.findByText(t.organization.joined)).toBeTruthy();
      expect(screen.queryByRole('button', { name: t.organization.openMembers })).toBeNull();
      expect(screen.queryByRole('button', { name: t.organization.edit })).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: t.organization.leave }));
      expect(alert.mock.calls.at(-1)![0]).toBe(
        format(t.organization.leaveTitle, { name: 'Club canin du lac' }),
      );
      expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
      await confirmAlert(alert);

      expect(await screen.findByRole('button', { name: t.organization.join })).toBeTruthy();
    });

    it('educator: reaches the members, cannot edit the organisation', async () => {
      mockApi({
        [`GET ${orgPath}`]: () =>
          ok(organizationDetail({ myMembership: myMembership('Educator') })),
      });
      await openAt(`/organizations/${orgId}`);
      expect(await screen.findByRole('button', { name: t.organization.openMembers })).toBeTruthy();
      expect(screen.queryByRole('button', { name: t.organization.edit })).toBeNull();
    });

    it('owner: reaches the members and the edit screen', async () => {
      mockApi({
        [`GET ${orgPath}`]: () => ok(organizationDetail({ myMembership: myMembership('Owner') })),
      });
      await openAt(`/organizations/${orgId}`);
      expect(await screen.findByRole('button', { name: t.organization.openMembers })).toBeTruthy();
      expect(screen.getByRole('button', { name: t.organization.edit })).toBeTruthy();
    });

    it('the sole owner cannot leave: the API refusal is explained', async () => {
      const alert = jest.spyOn(Alert, 'alert');
      mockApi({
        [`GET ${orgPath}`]: () => ok(organizationDetail({ myMembership: myMembership('Owner') })),
        [`DELETE ${membersPath}/${mine.id}`]: () => problemResponse(409, 'membership.sole_owner'),
      });
      await openAt(`/organizations/${orgId}`);
      await fireEvent.press(await screen.findByRole('button', { name: t.organization.leave }));
      await confirmAlert(alert);
      expect(await screen.findByText(t.errors['membership.sole_owner'])).toBeTruthy();
    });

    it('shows membership.duplicate when the request already exists', async () => {
      mockApi({
        [`GET ${orgPath}`]: () => ok(organizationDetail()),
        [`POST ${membersPath}`]: () => problemResponse(409, 'membership.duplicate'),
      });
      await openAt(`/organizations/${orgId}`);
      await fireEvent.press(await screen.findByRole('button', { name: t.organization.join }));
      expect(await screen.findByText(t.errors['membership.duplicate'])).toBeTruthy();
    });
  });

  it('edits the organisation (owner), clearing the city with an empty string', async () => {
    const detail = organizationDetail({ myMembership: myMembership('Owner') });
    const { calls } = mockApi({
      [`GET ${orgPath}`]: () => ok(detail),
      [`PATCH ${orgPath}`]: () => ok(organizationSummary()),
    });
    await openAt(`/organizations/${orgId}`);
    await fireEvent.press(await screen.findByRole('button', { name: t.organization.edit }));
    await fireEvent.changeText(await screen.findByDisplayValue('Annecy'), '');
    await fireEvent.changeText(screen.getByDisplayValue('Club canin du lac'), 'Club canin');
    await fireEvent.press(screen.getByRole('button', { name: t.common.save }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')!.json).toEqual({
      name: 'Club canin',
      city: '',
      description: 'Éducation positive, cours collectifs.',
    });
    // Back on the organisation.
    await waitFor(() => expect(screen).toHavePathname(`/organizations/${orgId}`));
  });
});

describe('members screen', () => {
  const pendingRequest = membership({
    id: 'req-1',
    user: { ...otherUser, id: 'u-req', displayName: 'Paul Petit' },
    status: 'Pending',
  });
  const simpleMember = membership({
    id: 'mem-1',
    user: { ...otherUser, id: 'u-mem', displayName: 'Léo Vidal' },
  });
  const educator = membership({
    id: 'edu-1',
    user: { ...otherUser, id: 'u-edu', displayName: 'Inès Roux' },
    role: 'Educator',
  });
  const owner = membership({ id: 'own-1', role: 'Owner' });

  function open(role: 'Owner' | 'Educator' | 'Member', extra: Record<string, never> = {}) {
    return mockApi({
      [`GET ${orgPath}`]: () => ok(organizationDetail({ myMembership: myMembership(role) })),
      [`GET ${membersPath}`]: () =>
        role === 'Member'
          ? problemResponse(403, 'organization.forbidden')
          : ok({ members: [owner, educator, simpleMember], requests: [pendingRequest] }),
      ...extra,
    });
  }

  it('is refused to a simple member, with an explanation', async () => {
    open('Member');
    await openAt(`/organizations/${orgId}/members`);
    expect(await screen.findByText(t.organization.membersForbidden)).toBeTruthy();
  });

  it('educator: answers requests and removes simple members, but cannot change roles', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const { calls } = open('Educator', {
      [`POST ${membersPath}/req-1/accept`]: () => ok({}),
      [`DELETE ${membersPath}/mem-1`]: () => new Response(null, { status: 204 }),
    } as never);
    await openAt(`/organizations/${orgId}/members`);

    expect(await screen.findByText('Paul Petit')).toBeTruthy();
    expect(screen.getByText('Léo Vidal')).toBeTruthy();
    // No role change for an educator; no « Retirer » for the owner or another educator.
    expect(
      screen.queryByRole('button', {
        name: format(t.organization.promoteA11y, { name: 'Léo Vidal' }),
      }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: format(t.organization.demoteA11y, { name: 'Inès Roux' }),
      }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: format(t.organization.removeA11y, { name: 'Inès Roux' }),
      }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: format(t.organization.removeA11y, { name: otherUser.displayName }),
      }),
    ).toBeNull();

    await fireEvent.press(
      screen.getByRole('button', {
        name: format(t.organization.acceptA11y, { name: 'Paul Petit' }),
      }),
    );
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('/req-1/accept'))).toBe(true));

    await fireEvent.press(
      screen.getByRole('button', {
        name: format(t.organization.removeA11y, { name: 'Léo Vidal' }),
      }),
    );
    expect(alert.mock.calls.at(-1)![0]).toBe(
      format(t.organization.removeTitle, { name: 'Léo Vidal' }),
    );
    await confirmAlert(alert);
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
  });

  it('educator: declines a request', async () => {
    const { calls } = open('Educator', {
      [`POST ${membersPath}/req-1/decline`]: () => ok({}),
    } as never);
    await openAt(`/organizations/${orgId}/members`);
    await fireEvent.press(
      await screen.findByRole('button', {
        name: format(t.organization.declineA11y, { name: 'Paul Petit' }),
      }),
    );
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('/req-1/decline'))).toBe(true));
  });

  it('owner: promotes a member, brings an educator back, and removes an educator', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const { calls } = open('Owner', {
      [`PATCH ${membersPath}/mem-1`]: () => ok({}),
      [`PATCH ${membersPath}/edu-1`]: () => ok({}),
      [`DELETE ${membersPath}/edu-1`]: () => new Response(null, { status: 204 }),
    } as never);
    await openAt(`/organizations/${orgId}/members`);

    await fireEvent.press(
      await screen.findByRole('button', {
        name: format(t.organization.promoteA11y, { name: 'Léo Vidal' }),
      }),
    );
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('/mem-1'))).toBe(true));
    expect(calls.find((c) => c.path.endsWith('/mem-1'))!.json).toEqual({ role: 'Educator' });

    await fireEvent.press(
      screen.getByRole('button', {
        name: format(t.organization.demoteA11y, { name: 'Inès Roux' }),
      }),
    );
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('/edu-1'))).toBe(true));
    expect(calls.find((c) => c.path.endsWith('/edu-1'))!.json).toEqual({ role: 'Member' });

    await fireEvent.press(
      screen.getByRole('button', {
        name: format(t.organization.removeA11y, { name: 'Inès Roux' }),
      }),
    );
    await confirmAlert(alert);
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    // The owner has no action on their own row.
    expect(
      screen.queryByRole('button', {
        name: format(t.organization.removeA11y, { name: otherUser.displayName }),
      }),
    ).toBeNull();
  });

  it('asks for 100 people per list, not the default 50', async () => {
    const { calls } = open('Owner');
    await openAt(`/organizations/${orgId}/members`);
    await screen.findByText('Paul Petit');
    expect(calls.find((c) => c.path.startsWith(membersPath))!.path).toBe(
      `${membersPath}?limit=100`,
    );
    expect(screen.queryByText(/la liste est partielle/)).toBeNull();
  });

  it('says the lists are partial when the API stopped at 100', async () => {
    const many = (prefix: string, status: 'Accepted' | 'Pending') =>
      Array.from({ length: 100 }, (_, index) =>
        membership({
          id: `${prefix}-${index}`,
          status,
          user: { ...otherUser, id: `u-${prefix}-${index}`, displayName: `${prefix} ${index}` },
        }),
      );
    mockApi({
      [`GET ${orgPath}`]: () => ok(organizationDetail({ myMembership: myMembership('Owner') })),
      [`GET ${membersPath}`]: () =>
        ok({ members: many('Membre', 'Accepted'), requests: many('Demande', 'Pending') }),
    });
    await openAt(`/organizations/${orgId}/members`);
    expect(
      await screen.findByText(format(t.organization.membersPartial, { count: 100 })),
    ).toBeTruthy();
    expect(screen.getByText(format(t.organization.requestsPartial, { count: 100 }))).toBeTruthy();
  });

  it('a membership gone meanwhile (membership.not_found) is explained and the lists are read again', async () => {
    let requests = [pendingRequest];
    const { calls } = mockApi({
      [`GET ${orgPath}`]: () => ok(organizationDetail({ myMembership: myMembership('Owner') })),
      [`GET ${membersPath}`]: () => ok({ members: [owner], requests }),
      [`POST ${membersPath}/req-1/accept`]: () => {
        // The person withdrew their request while the screen was open.
        requests = [];
        return problemResponse(404, 'membership.not_found');
      },
    });
    await openAt(`/organizations/${orgId}/members`);
    await fireEvent.press(
      await screen.findByRole('button', {
        name: format(t.organization.acceptA11y, { name: 'Paul Petit' }),
      }),
    );
    expect(await screen.findByText(t.errors['membership.not_found'])).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Paul Petit')).toBeNull());
    expect(calls.filter((c) => c.method === 'GET' && c.path.startsWith(membersPath))).toHaveLength(
      2,
    );
  });

  it('shows an API refusal of a role change', async () => {
    open('Owner', {
      [`PATCH ${membersPath}/mem-1`]: () => problemResponse(409, 'membership.not_accepted'),
    } as never);
    await openAt(`/organizations/${orgId}/members`);
    await fireEvent.press(
      await screen.findByRole('button', {
        name: format(t.organization.promoteA11y, { name: 'Léo Vidal' }),
      }),
    );
    expect(await screen.findByText(t.errors['membership.not_accepted'])).toBeTruthy();
  });
});

/** The person touches the map: the meeting point is a deliberate choice. */
async function placePin() {
  await fireEvent(screen.getByTestId('meeting-point-map'), 'press', {
    nativeEvent: { coordinate: { latitude: 47.5287, longitude: 7.1912 } },
  });
}

describe('professional walks', () => {
  const approvedOwner = {
    organization: organizationSummary(),
    membership: myMembership('Owner'),
  };

  async function openForm(mineOrganizations: unknown[]) {
    const result = mockApi({
      'GET /api/v1/me/organizations': () => ok(mineOrganizations),
      'POST /api/v1/walks': () => ok(walkDetail({ id: 'pro-walk', isOrganizer: true })),
      'GET /api/v1/walks/pro-walk': () => ok(walkDetail({ id: 'pro-walk', isOrganizer: true })),
      'GET /api/v1/me/dogs': () => ok([]),
    });
    await openAt('/walks/new');
    await screen.findByLabelText(t.walk.title);
    return result;
  }

  it('offers « Organiser pour » and sends organizationId when I am owner or educator of an approved organisation', async () => {
    const { calls } = await openForm([
      approvedOwner,
      {
        organization: organizationSummary({ id: 'org-e', name: 'Éducateurs du Nord' }),
        membership: myMembership('Educator'),
      },
    ]);
    expect(await screen.findByRole('radio', { name: t.walk.organizeForMe })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Éducateurs du Nord' })).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(t.walk.title), 'Cours collectif');
    await fireEvent.changeText(screen.getByLabelText(t.walk.locationLabel), 'Pâquier');
    await placePin();
    await fireEvent.press(screen.getByRole('radio', { name: 'Club canin du lac' }));
    await fireEvent.press(screen.getByRole('button', { name: t.walk.create }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.json).toMatchObject({ organizationId: orgId });
  });

  it('sends no organizationId for « Moi »', async () => {
    const { calls } = await openForm([approvedOwner]);
    await screen.findByRole('radio', { name: t.walk.organizeForMe });
    await fireEvent.changeText(screen.getByLabelText(t.walk.title), 'Balade perso');
    await fireEvent.changeText(screen.getByLabelText(t.walk.locationLabel), 'Parc');
    await placePin();
    await fireEvent.press(screen.getByRole('button', { name: t.walk.create }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.json).not.toHaveProperty('organizationId');
  });

  it.each([
    [
      'a simple member',
      [{ organization: organizationSummary(), membership: myMembership('Member') }],
    ],
    [
      'an owner of a pending organisation',
      [
        {
          organization: organizationSummary({ status: 'Pending' }),
          membership: myMembership('Owner'),
        },
      ],
    ],
    [
      'an educator whose request is pending',
      [{ organization: organizationSummary(), membership: myMembership('Educator', 'Pending') }],
    ],
    ['nobody', []],
  ])('does not offer the field to %s', async (_label, mineOrganizations) => {
    await openForm(mineOrganizations);
    await waitFor(() => expect(screen.queryByText(t.walk.organizeFor)).toBeNull());
  });

  it('explains walk.organization_forbidden on the field', async () => {
    mockApi({
      'GET /api/v1/me/organizations': () => ok([approvedOwner]),
      'POST /api/v1/walks': () => problemResponse(403, 'walk.organization_forbidden'),
    });
    await openAt('/walks/new');
    await screen.findByRole('radio', { name: 'Club canin du lac' });
    await fireEvent.changeText(screen.getByLabelText(t.walk.title), 'Cours');
    await fireEvent.changeText(screen.getByLabelText(t.walk.locationLabel), 'Parc');
    await placePin();
    await fireEvent.press(screen.getByRole('radio', { name: 'Club canin du lac' }));
    await fireEvent.press(screen.getByRole('button', { name: t.walk.create }));
    expect(await screen.findAllByText(t.errors['walk.organization_forbidden'])).toHaveLength(2);
  });

  describe('on the walk detail', () => {
    const pro = walkDetail({
      isProfessional: true,
      organization: { id: orgId, name: 'Club canin du lac' },
    });
    const walkPath = `/api/v1/walks/${pro.id}`;
    const dogs = [
      {
        id: 'dog-1',
        members: [{ user: testUser, role: 'Owner' }],
        name: 'Biscotte',
        photoUrl: null,
        size: 'Small',
        birthDate: null,
        breed: null,
        sociability: 'Easygoing',
        reactivity: 'None',
        leashHabit: 'OnLeash',
        description: '',
        createdAt: '2026-11-02T10:00:00Z',
      },
    ];

    it('links the organisation name to its page', async () => {
      mockApi({
        [`GET ${walkPath}`]: () => ok(pro),
        [`GET ${orgPath}`]: () => ok(organizationDetail()),
      });
      await openAt(`/walks/${pro.id}`);
      await fireEvent.press(await screen.findByText('Club canin du lac'));
      expect(await screen.findByText(t.organization.join)).toBeTruthy();
      expect(screen).toHavePathname(`/organizations/${orgId}`);
    });

    it('says the walk is reserved to members when registration is refused, and offers the organisation', async () => {
      mockApi({
        [`GET ${walkPath}`]: () => ok(pro),
        'GET /api/v1/me/dogs': () => ok(dogs),
        [`POST ${walkPath}/registrations`]: () => problemResponse(403, 'walk.members_only'),
        [`GET ${orgPath}`]: () => ok(organizationDetail()),
      });
      await openAt(`/walks/${pro.id}`);

      await fireEvent.press(await screen.findByRole('checkbox', { name: 'Biscotte' }));
      await fireEvent.press(screen.getByRole('button', { name: /Inscrire 1 chien/ }));

      expect(await screen.findByText(t.walk.membersOnlyTitle)).toBeTruthy();
      expect(screen.getByText(t.walk.membersOnlyMessage)).toBeTruthy();
      // The name stays on the « Organisation » line only (badge « Pro », no third mention).
      expect(screen.getAllByText(/Club canin du lac/)).toHaveLength(1);
      await fireEvent.press(screen.getByRole('button', { name: t.walk.membersOnlyAction }));
      expect(await screen.findByText(t.organization.join)).toBeTruthy();
      expect(screen).toHavePathname(`/organizations/${orgId}`);
    });
  });
});
