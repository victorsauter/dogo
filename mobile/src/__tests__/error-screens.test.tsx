import { render } from '@testing-library/react-native';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { ErrorBoundary } from '@/app/_layout';
import { sessionStore } from '@/auth/sessionStore';
import { t } from '@/strings';
import { authResponse } from '@/test/fixtures';
import { mockApi, ok } from '@/test/mockApi';

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
