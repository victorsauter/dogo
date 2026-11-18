import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { sessionStore } from '@/auth/sessionStore';
import { config } from '@/lib/config';
import { t } from '@/strings';
import { authResponse } from '@/test/fixtures';
import { jsonResponse, mockApi, ok, problemResponse } from '@/test/mockApi';

const APP_DIR = './src/app';
const prefs = { registrations: true, walkChanges: true, messages: true, reminders: true };

type NotificationsMock = {
  __reset(): void;
  __state: { permission: { granted: boolean; status: string; canAskAgain: boolean } };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the mock of jest.setup.ts
const notifications = require('expo-notifications') as NotificationsMock;

beforeEach(() => notifications.__reset());

afterEach(async () => {
  config.easProjectId = undefined;
  await act(() => sessionStore.clear());
  jest.restoreAllMocks();
});

async function open() {
  await sessionStore.set(authResponse());
  await renderRouter(APP_DIR, { initialUrl: '/notifications' });
}

const toggleOf = (label: string) => screen.getByRole('switch', { name: label });

describe('notification settings', () => {
  it('is reachable from the profile tab', async () => {
    mockApi({
      'GET /api/v1/me/dogs': () => ok([]),
      'GET /api/v1/me/notification-preferences': () => ok(prefs),
    });
    await sessionStore.set(authResponse());
    await renderRouter(APP_DIR, { initialUrl: '/profile' });
    await fireEvent.press(await screen.findByRole('button', { name: t.notifications.open }));
    expect(await screen.findByText(t.notifications.messagesHint)).toBeTruthy();
    expect(screen).toHavePathname('/notifications');
  });

  it('shows the four preferences with a description each', async () => {
    mockApi({
      'GET /api/v1/me/notification-preferences': () => ok({ ...prefs, messages: false }),
    });
    await open();
    await screen.findByText(t.notifications.registrationsHint);
    for (const hint of [
      t.notifications.walkChangesHint,
      t.notifications.messagesHint,
      t.notifications.remindersHint,
    ]) {
      expect(screen.getByText(hint)).toBeTruthy();
    }
    expect(toggleOf(t.notifications.messages).props.value).toBe(false);
    expect(toggleOf(t.notifications.reminders).props.value).toBe(true);
  });

  it('saves at once, with the four values (all required)', async () => {
    let saved = prefs;
    const { calls } = mockApi({
      'GET /api/v1/me/notification-preferences': () => ok(saved),
      'PUT /api/v1/me/notification-preferences': ({ json }) => {
        saved = json as typeof prefs;
        return ok(saved);
      },
    });
    await open();
    await screen.findByText(t.notifications.remindersHint);

    await fireEvent(toggleOf(t.notifications.reminders), 'valueChange', false);

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT')!.json).toEqual({ ...prefs, reminders: false });
    await waitFor(() => expect(toggleOf(t.notifications.reminders).props.value).toBe(false));
  });

  it('puts the switch back and says so when saving fails', async () => {
    let release: (response: Response) => void = () => {};
    mockApi({
      'GET /api/v1/me/notification-preferences': () => ok(prefs),
      'PUT /api/v1/me/notification-preferences': () =>
        new Promise<Response>((resolve) => (release = resolve)),
    });
    await open();
    await screen.findByText(t.notifications.remindersHint);

    await fireEvent(toggleOf(t.notifications.messages), 'valueChange', false);
    await waitFor(() => expect(toggleOf(t.notifications.messages).props.value).toBe(false));

    await act(async () => release(problemResponse(500)));
    await waitFor(() => expect(toggleOf(t.notifications.messages).props.value).toBe(true));
    expect(screen.getByText(t.notifications.saveFailed)).toBeTruthy();
  });

  it('keeps its own value when the server answers differently', async () => {
    mockApi({
      'GET /api/v1/me/notification-preferences': () => ok(prefs),
      'PUT /api/v1/me/notification-preferences': () =>
        jsonResponse({ ...prefs, walkChanges: false }),
    });
    await open();
    await screen.findByText(t.notifications.remindersHint);
    await fireEvent(toggleOf(t.notifications.walkChanges), 'valueChange', false);
    await waitFor(() => expect(toggleOf(t.notifications.walkChanges).props.value).toBe(false));
  });
});

describe('system permission', () => {
  const routes = { 'GET /api/v1/me/notification-preferences': () => ok(prefs) };

  it('says notifications are unavailable on this build, without any button', async () => {
    mockApi(routes);
    await open();
    expect(await screen.findByText(t.notifications.systemUnavailable)).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.notifications.openSettings })).toBeNull();
  });

  it('offers the system settings when the permission is denied', async () => {
    config.easProjectId = 'project-id';
    notifications.__state.permission = { granted: false, status: 'denied', canAskAgain: false };
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    mockApi(routes);
    await open();
    expect(await screen.findByText(t.notifications.systemDenied)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: t.notifications.openSettings }));
    expect(openSettings).toHaveBeenCalled();
  });

  it('shows the granted state', async () => {
    config.easProjectId = 'project-id';
    notifications.__state.permission = { granted: true, status: 'granted', canAskAgain: true };
    mockApi({ ...routes, 'PUT /api/v1/me/devices': () => ok({}) });
    await open();
    expect(await screen.findByText(t.notifications.systemGranted)).toBeTruthy();
  });

  it('lets the person enable notifications when not asked yet', async () => {
    config.easProjectId = 'project-id';
    mockApi({ ...routes, 'PUT /api/v1/me/devices': () => ok({}) });
    await open();
    await fireEvent.press(await screen.findByRole('button', { name: t.notifications.enable }));
    expect(await screen.findByText(t.notifications.systemGranted)).toBeTruthy();
  });
});
