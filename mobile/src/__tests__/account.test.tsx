import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

import { sessionStore } from '@/auth/sessionStore';
import { config } from '@/lib/config';
import { setSignInNotice } from '@/lib/signInNotice';
import { format, t } from '@/strings';
import { authResponse, testUser } from '@/test/fixtures';
import { mockApi, ok, problemResponse, screenCalls } from '@/test/mockApi';

const APP_DIR = './src/app';

type NotificationsMock = {
  __reset(): void;
  __state: { permission: { granted: boolean; status: string; canAskAgain: boolean } };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the mock of jest.setup.ts
const notifications = require('expo-notifications') as NotificationsMock;

beforeEach(() => notifications.__reset());
afterEach(async () => {
  config.easProjectId = undefined;
  setSignInNotice(null);
  await act(() => sessionStore.clear());
  jest.restoreAllMocks();
});

const profileRoutes = (user = testUser) => ({
  'GET /api/v1/me': () => ok(user),
  'GET /api/v1/me/dogs': () => ok([]),
  'GET /api/v1/me/organizations': () => ok([]),
});

async function openAt(url: string, user: Partial<typeof testUser> = {}) {
  await sessionStore.set(authResponse({ user }));
  await renderRouter(APP_DIR, { initialUrl: url });
}

describe('« Réglages » in the profile tab', () => {
  it('gathers notifications, blocked people, legal texts and account deletion, then sign-out', async () => {
    mockApi(profileRoutes());
    await openAt('/profile');

    await screen.findByText(t.settings.title);
    for (const label of [
      t.notifications.open,
      t.settings.blocked,
      t.settings.terms,
      t.settings.privacy,
      t.settings.deleteAccount,
      t.auth.signOut,
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    // « Mes chiens » and the organisations stay above the settings.
    expect(screen.getByText(t.profile.myDogs)).toBeTruthy();
    expect(screen.getByRole('button', { name: t.organization.find })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.organization.create })).toBeTruthy();
  });

  it.each([
    [t.settings.blocked, '/blocked'],
    [t.settings.terms, '/terms'],
    [t.settings.privacy, '/privacy'],
    [t.settings.deleteAccount, '/delete-account'],
    [t.organization.find, '/organizations'],
    [t.organization.create, '/organizations/new'],
  ])('opens « %s »', async (label, pathname) => {
    mockApi({ ...profileRoutes(), 'GET /api/v1/me/blocks': () => ok([]) });
    await openAt('/profile');
    await fireEvent.press(await screen.findByRole('button', { name: label }));
    await waitFor(() => expect(screen).toHavePathname(pathname));
  });
});

describe('suspended account', () => {
  it('shows a banner in the profile tab', async () => {
    mockApi(profileRoutes({ ...testUser, status: 'Suspended' }));
    await openAt('/profile', { status: 'Suspended' });
    expect(await screen.findByText(t.settings.suspendedTitle)).toBeTruthy();
    expect(screen.getByText(t.settings.suspendedMessage)).toBeTruthy();
  });

  it('shows no banner for an active account', async () => {
    mockApi(profileRoutes());
    await openAt('/profile');
    await screen.findByText(t.settings.title);
    expect(screen.queryByText(t.settings.suspendedTitle)).toBeNull();
  });

  it('follows the server at start: a stored suspended user is lifted when GET /me says active', async () => {
    mockApi(profileRoutes(testUser));
    await openAt('/profile', { status: 'Suspended' });
    await waitFor(() => expect(sessionStore.getSession()?.user.status).toBe('Active'));
    await screen.findByText(t.settings.title);
    expect(screen.queryByText(t.settings.suspendedTitle)).toBeNull();
  });

  it('reads GET /me again when the app returns to the foreground', async () => {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'change') listeners.push(listener as (state: AppStateStatus) => void);
      return { remove: () => {} };
    });
    let status: 'Active' | 'Suspended' = 'Suspended';
    mockApi({ ...profileRoutes(), 'GET /api/v1/me': () => ok({ ...testUser, status }) });
    await openAt('/profile', { status: 'Suspended' });
    expect(await screen.findByText(t.settings.suspendedTitle)).toBeTruthy();
    expect(sessionStore.getSession()?.user.status).toBe('Suspended');

    // The team lifts the suspension while the app is in the background.
    status = 'Active';
    await act(async () => listeners.forEach((listener) => listener('active')));
    await waitFor(() => expect(sessionStore.getSession()?.user.status).toBe('Active'));
    expect(screen.queryByText(t.settings.suspendedTitle)).toBeNull();
  });

  it('refreshes the session user when a request answers account.suspended', async () => {
    let status: 'Active' | 'Suspended' = 'Active';
    const { calls } = mockApi({
      ...profileRoutes(),
      'GET /api/v1/me': () => ok({ ...testUser, status }),
      'POST /api/v1/organizations': () => problemResponse(403, 'account.suspended'),
    });
    await openAt('/organizations/new');
    await waitFor(() => expect(calls.some((c) => c.path === '/api/v1/me')).toBe(true));

    status = 'Suspended';
    await fireEvent.changeText(await screen.findByLabelText(t.organization.name), 'Club canin');
    await fireEvent.press(screen.getByRole('button', { name: t.organization.createSubmit }));
    expect(await screen.findByText(t.errors['account.suspended'])).toBeTruthy();
    await waitFor(() => expect(sessionStore.getSession()?.user.status).toBe('Suspended'));
  });

  it('explains account.suspended when an action is refused', async () => {
    mockApi({
      ...profileRoutes({ ...testUser, status: 'Suspended' }),
      'POST /api/v1/organizations': () => problemResponse(403, 'account.suspended'),
    });
    await openAt('/organizations/new');
    await fireEvent.changeText(await screen.findByLabelText(t.organization.name), 'Club canin');
    await fireEvent.press(screen.getByRole('button', { name: t.organization.createSubmit }));
    expect(await screen.findByText(t.errors['account.suspended'])).toBeTruthy();
  });
});

describe('delete my account', () => {
  it('lists the consequences in plain French', async () => {
    mockApi({});
    await openAt('/delete-account');
    expect(await screen.findByText(t.deleteAccount.intro)).toBeTruthy();
    for (const consequence of t.deleteAccount.consequences) {
      expect(screen.getByText(consequence)).toBeTruthy();
    }
  });

  it('requires the confirmation word before anything is sent', async () => {
    const { calls } = mockApi({});
    await openAt('/delete-account');
    const button = await screen.findByRole('button', { name: t.deleteAccount.submit });
    expect(button.props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByLabelText(t.deleteAccount.confirmField), 'oups');
    await fireEvent.press(button);
    expect(screenCalls(calls)).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: t.deleteAccount.submit }).props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it('deletes, clears the session without logout nor device removal, and returns to sign-in', async () => {
    // A device is registered, so a normal sign-out would remove it (see the control test).
    config.easProjectId = 'project-id';
    notifications.__state.permission = { granted: true, status: 'granted', canAskAgain: true };
    const { calls } = mockApi({
      'DELETE /api/v1/me': () => new Response(null, { status: 204 }),
      'PUT /api/v1/me/devices': () => ok({}),
    });
    await openAt('/delete-account');
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));

    await fireEvent.changeText(
      await screen.findByLabelText(t.deleteAccount.confirmField),
      ' supprimer ',
    );
    await fireEvent.press(screen.getByRole('button', { name: t.deleteAccount.submit }));

    expect(await screen.findByText(t.auth.accountDeleted)).toBeTruthy();
    expect(screen).toHavePathname('/sign-in');
    expect(sessionStore.getSnapshot().status).toBe('signedOut');
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual(['/api/v1/me']);
    expect(calls.some((c) => c.path.includes('/auth/logout'))).toBe(false);
    expect(calls.some((c) => c.path.includes('/me/devices') && c.method === 'DELETE')).toBe(false);
  });

  it('control: a normal sign-out does remove the device and call logout', async () => {
    config.easProjectId = 'project-id';
    notifications.__state.permission = { granted: true, status: 'granted', canAskAgain: true };
    const { calls } = mockApi({
      ...profileRoutes(),
      'PUT /api/v1/me/devices': () => ok({}),
      'DELETE /api/v1/me/devices/ExponentPushToken%5Btest-token%5D': () =>
        new Response(null, { status: 204 }),
    });
    await openAt('/profile');
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    await fireEvent.press(await screen.findByRole('button', { name: t.auth.signOut }));
    await screen.findByText(t.app.tagline);
    expect(calls.some((c) => c.path.includes('/auth/logout'))).toBe(true);
    expect(calls.some((c) => c.path.includes('/me/devices') && c.method === 'DELETE')).toBe(true);
  });

  it('keeps the session and explains the refusal when the server says no', async () => {
    mockApi({ 'DELETE /api/v1/me': () => problemResponse(500, 'server.error') });
    await openAt('/delete-account');
    await fireEvent.changeText(
      await screen.findByLabelText(t.deleteAccount.confirmField),
      t.deleteAccount.confirmWord,
    );
    await fireEvent.press(screen.getByRole('button', { name: t.deleteAccount.submit }));
    expect(await screen.findByText(t.errors.server)).toBeTruthy();
    // The lead sentence says what did not happen; the reason follows.
    expect(screen.getByText(t.deleteAccount.failed)).toBeTruthy();
    expect(sessionStore.getSnapshot().status).toBe('signedIn');
    expect(screen).toHavePathname('/delete-account');
  });

  describe('a suspended account (ADR 0036: the only write it may do)', () => {
    it('reaches the profile entry, then the screen, which offers the deletion', async () => {
      mockApi({
        ...profileRoutes({ ...testUser, status: 'Suspended' }),
        'GET /api/v1/me/blocks': () => ok([]),
      });
      await openAt('/profile', { status: 'Suspended' });
      expect(await screen.findByText(t.settings.suspendedTitle)).toBeTruthy();
      const entry = await screen.findByRole('button', { name: t.settings.deleteAccount });
      expect(entry.props.accessibilityState?.disabled).not.toBe(true);
      await fireEvent.press(entry);
      await waitFor(() => expect(screen).toHavePathname('/delete-account'));
      expect(await screen.findByText(t.deleteAccount.intro)).toBeTruthy();
    });

    it('deletes the account (204) and returns to sign-in', async () => {
      const { calls } = mockApi({
        ...profileRoutes({ ...testUser, status: 'Suspended' }),
        'DELETE /api/v1/me': () => new Response(null, { status: 204 }),
      });
      await openAt('/delete-account', { status: 'Suspended' });
      const button = await screen.findByRole('button', { name: t.deleteAccount.submit });
      expect(button.props.accessibilityState.disabled).toBe(true);
      await fireEvent.changeText(
        screen.getByLabelText(t.deleteAccount.confirmField),
        t.deleteAccount.confirmWord,
      );
      expect(
        screen.getByRole('button', { name: t.deleteAccount.submit }).props.accessibilityState
          .disabled,
      ).toBe(false);
      await fireEvent.press(screen.getByRole('button', { name: t.deleteAccount.submit }));

      expect(await screen.findByText(t.auth.accountDeleted)).toBeTruthy();
      expect(screen).toHavePathname('/sign-in');
      expect(sessionStore.getSnapshot().status).toBe('signedOut');
      expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual(['/api/v1/me']);
    });

    it('says in the profile banner that deleting the account stays possible', async () => {
      mockApi(profileRoutes({ ...testUser, status: 'Suspended' }));
      await openAt('/profile', { status: 'Suspended' });
      expect(await screen.findByText(t.settings.suspendedMessage)).toBeTruthy();
      expect(t.settings.suspendedMessage).toMatch(/supprimer ton compte/);
    });
  });
});

describe('legal texts', () => {
  it.each([
    ['/terms', t.legal.terms],
    ['/privacy', t.legal.privacy],
  ])('%s renders with the provisional notice and its sections', async (url, document) => {
    await renderRouter(APP_DIR, { initialUrl: url });
    expect(await screen.findByText(t.legal.provisionalNotice)).toBeTruthy();
    expect(screen.getAllByText(document.title).length).toBeGreaterThan(0);
    expect(screen.getByText(document.intro)).toBeTruthy();
    expect(screen.getByText(`1. ${document.sections[0]!.title}`)).toBeTruthy();
    expect(screen.getByText(document.sections[0]!.paragraphs[0]!)).toBeTruthy();
    expect(screen).toHavePathname(url);
  });

  it('keeps clearly marked placeholders instead of inventing a company, address or e-mail', () => {
    const everything = JSON.stringify([t.legal.terms, t.legal.privacy]);
    expect(everything).toContain('[NOM DE L’ÉDITEUR]');
    expect(everything).toContain('[ADRESSE]');
    expect(everything).toContain('[E-MAIL DE CONTACT]');
    expect(everything).not.toMatch(/[\w.-]+@[\w-]+\.\w+/);
  });

  it('describes the data the app really handles', () => {
    const privacy = JSON.stringify(t.legal.privacy);
    for (const word of [
      'Apple ou Google',
      'adresse e-mail',
      'chiens',
      'messages',
      'signalements',
      'notification',
      'position',
      'n’est pas enregistrée sur nos serveurs',
    ]) {
      expect(privacy).toContain(word);
    }
    expect(JSON.stringify(t.legal.terms)).toContain('seul responsable de son chien');
  });

  it('opens from the sign-in screen and comes back to it', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });
    expect(await screen.findByText(t.auth.legalIntro, { exact: false })).toBeTruthy();

    await fireEvent.press(screen.getByText(t.auth.legalTerms));
    expect(await screen.findByText(t.legal.provisionalNotice)).toBeTruthy();
    expect(screen).toHavePathname('/terms');
  });

  it('has a « Retour » that brings back to the screen it came from', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });
    await fireEvent.press(await screen.findByText(t.auth.legalTerms));
    await screen.findByText(t.legal.provisionalNotice);

    await fireEvent.press(screen.getByRole('button', { name: t.common.back }));
    expect(await screen.findByText(t.app.tagline)).toBeTruthy();
    expect(screen).toHavePathname('/sign-in');
  });

  it('opens the privacy policy from the sign-in screen', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });
    await fireEvent.press(await screen.findByText(t.auth.legalPrivacy));
    expect(await screen.findByText(t.legal.provisionalNotice)).toBeTruthy();
    expect(screen).toHavePathname('/privacy');
  });

  it('opens from « Réglages » while signed in', async () => {
    mockApi(profileRoutes());
    await openAt('/profile');
    await fireEvent.press(await screen.findByRole('button', { name: t.settings.privacy }));
    expect(await screen.findByText(t.legal.provisionalNotice)).toBeTruthy();
    expect(screen).toHavePathname('/privacy');
  });
});

describe('sign-in notice', () => {
  it('shows the account-deleted sentence once', async () => {
    setSignInNotice(format(t.auth.accountDeleted, {}));
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });
    expect(await screen.findByText(t.auth.accountDeleted)).toBeTruthy();
  });
});
