import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { sessionStore } from '@/auth/sessionStore';
import { t } from '@/strings';
import { authResponse, testUser, walkDetail } from '@/test/fixtures';
import { mockApi, ok, problemResponse } from '@/test/mockApi';

const APP_DIR = './src/app';
const walkId = 'a1a1a1a1-0000-4000-8000-000000000001';
const walkPath = `/api/v1/walks/${walkId}`;
const mine = {
  isOrganizer: true,
  organizer: { id: testUser.id, displayName: testUser.displayName, photoUrl: null },
};

afterEach(async () => {
  await act(() => sessionStore.clear());
  jest.restoreAllMocks();
});

async function fillNewWalk() {
  await sessionStore.set(authResponse());
  await renderRouter(APP_DIR, { initialUrl: '/walks/new' });
  await screen.findByLabelText(t.walk.title);
  await fireEvent.changeText(screen.getByLabelText(t.walk.title), 'Balade du dimanche');
  await fireEvent.changeText(screen.getByLabelText(t.walk.locationLabel), 'Fontaine');
  // The meeting point must be placed by the person.
  await fireEvent(screen.getByTestId('meeting-point-map'), 'press', {
    nativeEvent: { coordinate: { latitude: 47.5287, longitude: 7.1912 } },
  });
}

describe('weekly repeat in the walk form', () => {
  const created = walkDetail({ ...mine, id: 'new-walk-id', repeatsWeekly: true });
  const routes = {
    'POST /api/v1/walks': () => ok(created),
    'GET /api/v1/walks/new-walk-id': () => ok(created),
    'GET /api/v1/me/dogs': () => ok([]),
  };

  it('explains the repetition and sends repeatWeekly when it is switched on', async () => {
    const { calls } = mockApi(routes);
    await fillNewWalk();
    expect(screen.getByText(t.walk.repeatWeeklyHint)).toBeTruthy();

    await fireEvent(screen.getByRole('switch', { name: t.walk.repeatWeekly }), 'valueChange', true);
    await fireEvent.press(screen.getByRole('button', { name: t.walk.create }));

    await screen.findByText(t.walk.cancelWalk);
    expect(calls.find((c) => c.method === 'POST')!.json).toMatchObject({ repeatWeekly: true });
  });

  it('sends repeatWeekly false by default', async () => {
    const { calls } = mockApi(routes);
    await fillNewWalk();
    await fireEvent.press(screen.getByRole('button', { name: t.walk.create }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.json).toMatchObject({ repeatWeekly: false });
  });

  it('is not offered when editing a walk, and the update does not carry it', async () => {
    const { calls } = mockApi({
      [`GET ${walkPath}`]: () => ok(walkDetail({ ...mine, repeatsWeekly: true })),
      [`PATCH ${walkPath}`]: () => ok(walkDetail({ ...mine, repeatsWeekly: true })),
    });
    await sessionStore.set(authResponse());
    await renderRouter(APP_DIR, { initialUrl: `/walks/${walkId}/edit` });
    await screen.findByLabelText(t.walk.title);
    expect(screen.queryByText(t.walk.repeatWeekly)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: t.common.save }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')!.json).not.toHaveProperty('repeatWeekly');
  });
});

describe('« Chaque semaine » badge', () => {
  it('shows on the detail, without the stop action for a visitor', async () => {
    mockApi({
      [`GET ${walkPath}`]: () => ok(walkDetail({ repeatsWeekly: true })),
      'GET /api/v1/me/dogs': () => ok([]),
    });
    await sessionStore.set(authResponse());
    await renderRouter(APP_DIR, { initialUrl: `/walks/${walkId}` });
    expect(await screen.findByText(t.walk.weekly)).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.walk.stopSeries })).toBeNull();
  });
});

describe('stopping the series', () => {
  async function openDetail(repeats = true) {
    let detail = walkDetail({ ...mine, repeatsWeekly: repeats });
    const { calls } = mockApi({
      [`GET ${walkPath}`]: () => ok(detail),
      [`POST ${walkPath}/stop-series`]: () => {
        detail = { ...detail, repeatsWeekly: false };
        return ok(detail);
      },
      'GET /api/v1/me/dogs': () => ok([]),
    });
    await sessionStore.set(authResponse());
    await renderRouter(APP_DIR, { initialUrl: `/walks/${walkId}` });
    return calls;
  }

  it('asks for confirmation, then calls stop-series and drops the badge', async () => {
    const calls = await openDetail();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await fireEvent.press(await screen.findByRole('button', { name: t.walk.stopSeries }));

    expect(alert).toHaveBeenCalledWith(
      t.walk.stopSeriesTitle,
      t.walk.stopSeriesMessage,
      expect.any(Array),
    );
    expect(calls.some((c) => c.path.endsWith('/stop-series'))).toBe(false);

    const buttons = alert.mock.calls[0]![2] as { style?: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.style === 'destructive')!.onPress!());

    await waitFor(() => expect(screen.queryByText(t.walk.weekly)).toBeNull());
    expect(calls.find((c) => c.path.endsWith('/stop-series'))!.method).toBe('POST');
    expect(screen.queryByRole('button', { name: t.walk.stopSeries })).toBeNull();
  });

  it('does nothing when the organizer keeps the series', async () => {
    const calls = await openDetail();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await fireEvent.press(await screen.findByRole('button', { name: t.walk.stopSeries }));
    const buttons = alert.mock.calls[0]![2] as { style?: string }[];
    expect(buttons.find((b) => b.style === 'cancel')).toBeDefined();
    expect(calls.some((c) => c.path.endsWith('/stop-series'))).toBe(false);
  });

  it('is not offered on a walk that is not in a series', async () => {
    await openDetail(false);
    await screen.findByText(t.walk.cancelWalk);
    expect(screen.queryByRole('button', { name: t.walk.stopSeries })).toBeNull();
  });

  it('shows the error when the walk is not in a series', async () => {
    mockApi({
      [`GET ${walkPath}`]: () => ok(walkDetail({ ...mine, repeatsWeekly: true })),
      [`POST ${walkPath}/stop-series`]: () => problemResponse(409, 'walk.not_in_series'),
      'GET /api/v1/me/dogs': () => ok([]),
    });
    await sessionStore.set(authResponse());
    await renderRouter(APP_DIR, { initialUrl: `/walks/${walkId}` });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await fireEvent.press(await screen.findByRole('button', { name: t.walk.stopSeries }));
    const buttons = alert.mock.calls[0]![2] as { style?: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.style === 'destructive')!.onPress!());
    expect(await screen.findByText(t.errors['walk.not_in_series'])).toBeTruthy();
  });
});
