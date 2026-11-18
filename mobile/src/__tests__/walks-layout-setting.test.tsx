import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { router } from 'expo-router';

import { sessionStore } from '@/auth/sessionStore';
import { DISCOVER_LAYOUT_STORAGE_KEY, resetDiscoverLayout } from '@/discover/layoutPreference';
import { t } from '@/strings';
import { authResponse, testUser, walkResult } from '@/test/fixtures';
import { mockApi, ok } from '@/test/mockApi';

const APP_DIR = './src/app';
const lake = walkResult();

const stored = () =>
  (jest.requireMock('expo-secure-store') as { __store: Map<string, string> }).__store.get(
    DISCOVER_LAYOUT_STORAGE_KEY,
  );

beforeEach(() => {
  resetDiscoverLayout();
  mockApi({
    'GET /api/v1/me/organizations': () => ok([]),
    'GET /api/v1/me': () => ok(testUser),
    'GET /api/v1/me/dogs': () => ok([]),
    'GET /api/v1/walks': () => ok([lake]),
  });
});

afterEach(async () => {
  await act(() => sessionStore.clear());
});

async function open(url: '/' | '/profile') {
  await sessionStore.set(authResponse());
  await renderRouter(APP_DIR, { initialUrl: url });
}

const group = () => screen.findByLabelText(t.discoverLayout.title);

describe('« Affichage des balades » setting', () => {
  it('offers the two views in a radio group, the panel being checked by default', async () => {
    await open('/profile');

    const choices = await group();
    const panel = within(choices).getByRole('radio', { name: t.discoverLayout.panel });
    const list = within(choices).getByRole('radio', { name: t.discoverLayout.list });
    expect(within(choices).getAllByRole('radio')).toHaveLength(2);
    expect(panel).toBeChecked();
    expect(list).not.toBeChecked();
    // The checked card carries a tick as well as its border: not colour alone.
    expect(within(panel).getByTestId('layout-checked')).toBeTruthy();
    expect(within(list).queryByTestId('layout-checked')).toBeNull();
    // Each card explains its view.
    expect(panel.props.accessibilityHint).toBe(t.discoverLayout.panelHint);
    expect(choices.props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByText(t.discoverLayout.listHint)).toBeTruthy();
  });

  it('keeps the cards at least 44 points tall', async () => {
    await open('/profile');
    const choices = await group();
    for (const radio of within(choices).getAllByRole('radio')) {
      const style = Object.assign({}, ...[radio.props.style].flat(Infinity).filter(Boolean));
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it('chooses « Liste »: the card is checked and the choice is remembered', async () => {
    await open('/profile');
    const choices = await group();

    await fireEvent.press(within(choices).getByRole('radio', { name: t.discoverLayout.list }));

    expect(within(choices).getByRole('radio', { name: t.discoverLayout.list })).toBeChecked();
    expect(within(choices).getByRole('radio', { name: t.discoverLayout.panel })).not.toBeChecked();
    await waitFor(() => expect(stored()).toBe('list'));
  });

  it('shows the stored choice as checked', async () => {
    (jest.requireMock('expo-secure-store') as { __store: Map<string, string> }).__store.set(
      DISCOVER_LAYOUT_STORAGE_KEY,
      'list',
    );
    await open('/profile');

    const choices = await group();
    await waitFor(() =>
      expect(within(choices).getByRole('radio', { name: t.discoverLayout.list })).toBeChecked(),
    );
  });

  it('changes the « Balades » tab at once, without a restart', async () => {
    await open('/');
    expect(await screen.findByTestId('bottom-sheet')).toBeTruthy();

    await act(() => router.navigate('/profile'));
    await fireEvent.press(
      within(await group()).getByRole('radio', { name: t.discoverLayout.list }),
    );
    await act(() => router.navigate('/'));

    expect(await screen.findByRole('button', { name: t.discover.showMapA11y })).toBeTruthy();
    expect(screen.queryByTestId('bottom-sheet')).toBeNull();

    await act(() => router.navigate('/profile'));
    await fireEvent.press(
      within(await group()).getByRole('radio', { name: t.discoverLayout.panel }),
    );
    await act(() => router.navigate('/'));
    expect(await screen.findByTestId('bottom-sheet')).toBeTruthy();
  });
});
