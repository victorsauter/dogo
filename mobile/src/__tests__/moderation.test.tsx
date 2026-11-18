import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { sessionStore } from '@/auth/sessionStore';
import { enumLabel, format, t } from '@/strings';
import {
  authResponse,
  otherDog,
  otherUser,
  testUser,
  walkDetail,
  walkResult,
} from '@/test/fixtures';
import { jsonResponse, mockApi, ok, problemResponse } from '@/test/mockApi';

const APP_DIR = './src/app';
const userPath = `/api/v1/users/${otherUser.id}`;
const profile = { ...otherUser, bio: 'Marcheur', dogs: [otherDog] };
const blockedEntry = { user: otherUser, createdAt: '2026-11-10T10:00:00Z' };

afterEach(async () => {
  await act(() => sessionStore.clear());
  jest.restoreAllMocks();
});

async function openAt(url: string) {
  await sessionStore.set(authResponse());
  await renderRouter(APP_DIR, { initialUrl: url });
}

async function confirmAlert(alert: jest.SpyInstance) {
  await waitFor(() => expect(alert).toHaveBeenCalled());
  const buttons = alert.mock.calls.at(-1)![2] as { style?: string; onPress?: () => void }[];
  await act(async () => buttons.find((b) => b.style === 'destructive')!.onPress!());
}

describe('blocking', () => {
  function blockRoutes() {
    let blocked = false;
    const result = mockApi({
      [`GET ${userPath}`]: () => ok(profile),
      'GET /api/v1/me/blocks': () => ok(blocked ? [blockedEntry] : []),
      'POST /api/v1/blocks': () => {
        blocked = true;
        return ok(blockedEntry);
      },
      [`DELETE /api/v1/blocks/${otherUser.id}`]: () => {
        blocked = false;
        return new Response(null, { status: 204 });
      },
    });
    return result;
  }

  it('blocks from a public profile after a confirmation that explains the effect', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const { calls } = blockRoutes();
    await openAt(`/users/${otherUser.id}`);

    await fireEvent.press(
      await screen.findByRole('button', {
        name: format(t.block.actionA11y, { name: otherUser.displayName }),
      }),
    );

    const [title, message] = alert.mock.calls.at(-1)!;
    expect(title).toBe(format(t.block.confirmTitle, { name: otherUser.displayName }));
    expect(message).toContain('ne pourra plus inscrire de chien à tes balades');
    expect(message).toContain('Tu seras prévenu');
    expect(message).toContain('Elle n’est pas prévenue');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await confirmAlert(alert);

    expect(
      await screen.findByRole('button', {
        name: format(t.block.unblockA11y, { name: otherUser.displayName }),
      }),
    ).toBeTruthy();
    expect(screen.getByText(t.block.blockedNote)).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST')!.json).toEqual({ userId: otherUser.id });
  });

  it('unblocks a person who is already blocked', async () => {
    const { calls } = mockApi({
      [`GET ${userPath}`]: () => ok(profile),
      'GET /api/v1/me/blocks': () => ok([blockedEntry]),
      [`DELETE /api/v1/blocks/${otherUser.id}`]: () => new Response(null, { status: 204 }),
    });
    await openAt(`/users/${otherUser.id}`);

    await fireEvent.press(await screen.findByRole('button', { name: new RegExp(t.block.unblock) }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
  });

  it('offers neither block nor report on my own profile', async () => {
    mockApi({
      [`GET /api/v1/users/${testUser.id}`]: () => ok({ ...profile, id: testUser.id }),
      'GET /api/v1/me/blocks': () => ok([]),
    });
    await openAt(`/users/${testUser.id}`);
    await screen.findByText('Marcheur');
    expect(screen.queryByRole('button', { name: t.report.action })).toBeNull();
    expect(screen.queryByRole('button', { name: /Bloquer/ })).toBeNull();
  });

  it('shows block.self if the API refuses', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    mockApi({
      [`GET ${userPath}`]: () => ok(profile),
      'GET /api/v1/me/blocks': () => ok([]),
      'POST /api/v1/blocks': () => problemResponse(400, 'block.self'),
    });
    await openAt(`/users/${otherUser.id}`);
    await fireEvent.press(await screen.findByRole('button', { name: /Bloquer/ }));
    await confirmAlert(alert);
    expect(await screen.findByText(t.errors['block.self'])).toBeTruthy();
  });

  it('lists blocked people and unblocks one', async () => {
    let list = [blockedEntry];
    const { calls } = mockApi({
      'GET /api/v1/me/blocks': () => ok(list),
      [`DELETE /api/v1/blocks/${otherUser.id}`]: () => {
        list = [];
        return new Response(null, { status: 204 });
      },
    });
    await openAt('/blocked');
    expect(await screen.findByText(otherUser.displayName)).toBeTruthy();
    expect(screen.getByText(t.block.listIntro)).toBeTruthy();

    await fireEvent.press(
      screen.getByRole('button', {
        name: format(t.block.unblockA11y, { name: otherUser.displayName }),
      }),
    );

    expect(await screen.findByText(t.block.emptyTitle)).toBeTruthy();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('refreshes the walk (« Participant bloqué ») after blocking and unblocking', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const walk = walkDetail();
    let flagged = false;
    let blocked = false;
    const { calls } = mockApi({
      [`GET /api/v1/walks/${walk.id}`]: () => ok({ ...walk, hasBlockedParticipant: flagged }),
      [`GET ${userPath}`]: () => ok(profile),
      'GET /api/v1/me/blocks': () => ok(blocked ? [blockedEntry] : []),
      'POST /api/v1/blocks': () => {
        blocked = flagged = true;
        return ok(blockedEntry);
      },
      [`DELETE /api/v1/blocks/${otherUser.id}`]: () => {
        blocked = flagged = false;
        return new Response(null, { status: 204 });
      },
      'GET /api/v1/me/dogs': () => ok([]),
    });
    await openAt(`/walks/${walk.id}`);
    await fireEvent.press(await screen.findByText(otherUser.displayName));
    await fireEvent.press(await screen.findByRole('button', { name: /Bloquer/ }));
    await confirmAlert(alert);
    await screen.findByRole('button', { name: new RegExp(t.block.unblock) });

    await act(async () => router.back());
    expect(await screen.findByText(t.walk.blockedWarning)).toBeTruthy();
    expect(screen.getAllByText(t.walk.blockedParticipant).length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByText(otherUser.displayName));
    await fireEvent.press(await screen.findByRole('button', { name: new RegExp(t.block.unblock) }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    await act(async () => router.back());
    await waitFor(() => expect(screen.queryByText(t.walk.blockedWarning)).toBeNull());
  });

  it('explains the warning on the walk detail with one sentence', async () => {
    const walk = walkDetail({ hasBlockedParticipant: true });
    mockApi({
      [`GET /api/v1/walks/${walk.id}`]: () => ok(walk),
      'GET /api/v1/me/dogs': () => ok([]),
    });
    await openAt(`/walks/${walk.id}`);
    expect(await screen.findByText(t.walk.blockedWarning)).toBeTruthy();
    expect(screen.getByLabelText(t.walk.blockedParticipantA11y)).toBeTruthy();
  });
});

describe('reporting', () => {
  const walk = walkDetail({ title: 'Tour du lac' });
  const facts = 'Son chien a mordu le mien près de la fontaine, vers dix heures.';

  const routes = () => ({
    [`GET ${userPath}`]: () => ok(profile),
    'GET /api/v1/me/blocks': () => ok([]),
    [`GET /api/v1/dogs/${otherDog.id}`]: () => ok(otherDog),
    [`GET /api/v1/walks/${walk.id}`]: () => ok(walk),
    'GET /api/v1/me/dogs': () => ok([]),
    'POST /api/v1/reports': () =>
      jsonResponse({ id: 'r1', createdAt: '2026-11-18T10:00:00Z' }, 201),
  });

  async function fill(type: 'Altercation' | 'BiteOrInjury' = 'BiteOrInjury') {
    await fireEvent.press(
      await screen.findByRole('radio', { name: enumLabel('ReportType', type) }),
    );
    await fireEvent.changeText(screen.getByLabelText(t.report.facts), facts);
  }

  it('is reachable from a public profile and sends the person as the target', async () => {
    const { calls } = mockApi(routes());
    await openAt(`/users/${otherUser.id}`);
    await fireEvent.press(await screen.findByRole('button', { name: t.report.action }));

    expect(
      await screen.findByText(format(t.report.subjectUser, { name: otherUser.displayName })),
    ).toBeTruthy();
    expect(screen.getByText(t.report.explanation)).toBeTruthy();
    await fill('Altercation');
    await fireEvent.press(screen.getByRole('button', { name: t.report.submit }));

    expect(await screen.findByText(t.report.sentTitle)).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST')!.json).toEqual({
      type: 'Altercation',
      facts,
      targetUserId: otherUser.id,
    });
  });

  it('is reachable from a dog and sends the dog as the target', async () => {
    const { calls } = mockApi(routes());
    await openAt(`/dogs/${otherDog.id}`);
    await fireEvent.press(await screen.findByRole('button', { name: t.report.action }));

    expect(
      await screen.findByText(format(t.report.subjectDog, { name: otherDog.name })),
    ).toBeTruthy();
    await fill();
    await fireEvent.press(screen.getByRole('button', { name: t.report.submit }));
    expect(await screen.findByText(t.report.sentTitle)).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST')!.json).toEqual({
      type: 'BiteOrInjury',
      facts,
      targetDogId: otherDog.id,
    });
  });

  it('is reachable from a walk and sends the walk as the target', async () => {
    const { calls } = mockApi(routes());
    await openAt(`/walks/${walk.id}`);
    await fireEvent.press(await screen.findByRole('button', { name: t.report.action }));

    expect(
      await screen.findByText(format(t.report.subjectWalk, { name: 'Tour du lac' })),
    ).toBeTruthy();
    await fill();
    await fireEvent.press(screen.getByRole('button', { name: t.report.submit }));
    expect(await screen.findByText(t.report.sentTitle)).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST')!.json).toEqual({
      type: 'BiteOrInjury',
      facts,
      walkId: walk.id,
    });
  });

  it('offers the four types of the specification', async () => {
    mockApi(routes());
    await openAt(`/report?kind=user&id=${otherUser.id}&name=Hugo`);
    for (const label of [
      'Incident sans blessure',
      'Altercation',
      'Morsure ou blessure',
      'Comportement d’un humain',
    ]) {
      expect(await screen.findByRole('radio', { name: label })).toBeTruthy();
    }
  });

  it('validates the type and the facts (10 to 4 000 characters) before sending', async () => {
    const { calls } = mockApi(routes());
    await openAt(`/report?kind=user&id=${otherUser.id}&name=Hugo`);
    await screen.findByText(t.report.explanation);

    await fireEvent.press(screen.getByRole('button', { name: t.report.submit }));
    expect(screen.getByText(t.report.typeRequired)).toBeTruthy();
    expect(screen.getByText(format(t.report.factsLength, { min: 10, max: 4000 }))).toBeTruthy();

    await fireEvent.press(screen.getByRole('radio', { name: 'Altercation' }));
    await fireEvent.changeText(screen.getByLabelText(t.report.facts), 'court');
    await fireEvent.press(screen.getByRole('button', { name: t.report.submit }));
    expect(screen.getByText(format(t.report.factsLength, { min: 10, max: 4000 }))).toBeTruthy();
    expect(screen.queryByText(t.report.typeRequired)).toBeNull();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    expect(screen.getByLabelText(t.report.facts).props.maxLength).toBe(4000);
  });

  it('explains report.self', async () => {
    mockApi({ ...routes(), 'POST /api/v1/reports': () => problemResponse(400, 'report.self') });
    await openAt(`/report?kind=user&id=${testUser.id}&name=Moi`);
    await fill('Altercation');
    await fireEvent.press(screen.getByRole('button', { name: t.report.submit }));
    expect(await screen.findByText(t.errors['report.self'])).toBeTruthy();
  });

  it('shows the success state with what happens next', async () => {
    mockApi(routes());
    await openAt(`/report?kind=walk&id=${walk.id}&name=Tour`);
    await fill();
    await fireEvent.press(screen.getByRole('button', { name: t.report.submit }));
    expect(await screen.findByText(t.report.sentMessage)).toBeTruthy();
    expect(screen.getByRole('button', { name: t.report.done })).toBeTruthy();
  });

  it('is not offered to the organiser of the walk', async () => {
    mockApi({
      ...routes(),
      [`GET /api/v1/walks/${walk.id}`]: () => ok({ ...walk, isOrganizer: true }),
    });
    await openAt(`/walks/${walk.id}`);
    await screen.findByText(t.walk.editWalk);
    expect(screen.queryByRole('button', { name: t.report.action })).toBeNull();
  });
});

describe('a walk whose organiser deleted their account', () => {
  it('shows « Compte supprimé » on the detail, with no link', async () => {
    const walk = walkDetail({ organizer: null });
    mockApi({
      [`GET /api/v1/walks/${walk.id}`]: () => ok(walk),
      'GET /api/v1/me/dogs': () => ok([]),
    });
    await openAt(`/walks/${walk.id}`);
    expect(await screen.findByText(t.walk.organizerDeleted)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: format(t.walk.organizerA11y, { name: '' }).trim() }),
    ).toBeNull();
    // Still reportable and registrable, and nothing navigates when the line is pressed.
    await fireEvent.press(screen.getByText(t.walk.organizerDeleted));
    expect(screen).toHavePathname(`/walks/${walk.id}`);
  });

  it('lists such a walk among my walks', async () => {
    mockApi({
      'GET /api/v1/me/walks': () =>
        ok([walkResult({ organizer: null, title: 'Sans organisateur' })]),
    });
    await openAt('/mine');
    expect(await screen.findByText('Sans organisateur')).toBeTruthy();
  });
});
