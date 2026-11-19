import { render } from '@testing-library/react-native';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { ErrorBoundary } from '@/app/_layout';
import { sessionStore } from '@/auth/sessionStore';
import { t } from '@/strings';
import { authResponse } from '@/test/fixtures';
import { mockApi, ok, problemResponse } from '@/test/mockApi';

describe('root error boundary', () => {
  it('shows a French message and renders the route again on « Réessayer »', async () => {
    const retry = jest.fn(async () => undefined);
    await render(<ErrorBoundary error={new Error('boom')} retry={retry} />);

    expect(screen.getByText(t.states.crashTitle)).toBeTruthy();
    expect(screen.queryByText('boom')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: t.common.retry }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('a walk that does not exist, opened by a link', () => {
  afterEach(async () => {
    await act(() => sessionStore.clear());
  });

  it('says so with the warning, no « Réessayer », and leads back to the home screen', async () => {
    const { fetchMock } = mockApi({
      'GET /api/v1/me': () => ok({}),
      'GET /api/v1/walks/unknown': () => problemResponse(404, 'walk.not_found'),
    });
    await sessionStore.set(authResponse());
    await renderRouter('./src/app', { initialUrl: '/walks/unknown' });

    expect(await screen.findByText(t.errors['walk.not_found'])).toBeTruthy();
    // A 404 is not « a problem »: the title says the walk cannot be found.
    expect(screen.getByText(t.walk.notFoundTitle)).toBeTruthy();
    expect(screen.queryByText(t.states.errorTitle)).toBeNull();
    expect(screen.queryByRole('button', { name: t.common.retry })).toBeNull();
    const calls = fetchMock.mock.calls.length;

    // A deep link has no screen behind it: « Retour » goes to the home screen.
    await fireEvent.press(screen.getByRole('button', { name: t.common.back }));
    expect(await screen.findByLabelText(t.discover.mapLabel)).toBeTruthy();
    expect(screen).toHavePathname('/');
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(calls);
  });
});

describe('unknown route', () => {
  beforeEach(() => {
    mockApi({ 'GET /api/v1/me': () => ok({}) });
  });
  afterEach(async () => {
    await act(() => sessionStore.clear());
  });

  it('shows the French not-found screen and goes back to the home screen', async () => {
    await sessionStore.set(authResponse());
    await renderRouter('./src/app', { initialUrl: '/nimporte' });

    expect(await screen.findByText(t.states.notFoundTitle)).toBeTruthy();
    expect(screen.queryByText(/unmatched/i)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: t.states.notFoundHome }));
    expect(await screen.findByLabelText(t.discover.mapLabel)).toBeTruthy();
    expect(screen).toHavePathname('/');
  });
});
