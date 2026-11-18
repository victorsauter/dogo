import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';

import { sessionStore } from '@/auth/sessionStore';
import { DISCOVER_LAYOUT_STORAGE_KEY, resetDiscoverLayout } from '@/discover/layoutPreference';
import { config } from '@/lib/config';
import { t } from '@/strings';
import { authResponse, testUser, walkResult } from '@/test/fixtures';
import { mockApi, ok } from '@/test/mockApi';

const APP_DIR = './src/app';
const devLogin = config.devLogin;

const searchCalls = (calls: { method: string; path: string }[]) =>
  calls.filter((c) => c.method === 'GET' && c.path.startsWith('/api/v1/walks?'));
const query = (path: string) => Object.fromEntries(new URL(`http://x${path}`).searchParams);
const lastSearch = (calls: { method: string; path: string }[]) =>
  query(searchCalls(calls).at(-1)!.path);

const lake = walkResult();
const forest = walkResult({
  id: 'a1a1a1a1-0000-4000-8000-000000000002',
  title: 'Forêt du Hardt',
  location: { latitude: 47.54, longitude: 7.19 },
});

async function open(layout?: string) {
  if (layout) await SecureStore.setItemAsync(DISCOVER_LAYOUT_STORAGE_KEY, layout);
  await sessionStore.set(authResponse());
  await renderRouter(APP_DIR, { initialUrl: '/' });
}

beforeEach(() => {
  resetDiscoverLayout();
});

afterEach(async () => {
  config.devLogin = devLogin;
  await act(() => sessionStore.clear());
  jest.restoreAllMocks();
});

describe('which view the tab shows', () => {
  it('opens on the panel by default', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open();

    expect(await screen.findByTestId('bottom-sheet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.discover.showMapA11y })).toBeNull();
  });

  it('opens on the list when it is the remembered choice', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open('list');

    expect(await screen.findByRole('button', { name: t.discover.showMapA11y })).toBeTruthy();
    expect(screen.queryByTestId('bottom-sheet')).toBeNull();
  });

  it('falls back to the panel for the retired « current » value', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open('current');

    expect(await screen.findByTestId('bottom-sheet')).toBeTruthy();
  });

  it('does not depend on EXPO_PUBLIC_DEV_LOGIN', async () => {
    config.devLogin = false;
    mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open('list');

    expect(await screen.findByRole('button', { name: t.discover.showMapA11y })).toBeTruthy();
  });
});

describe('« Liste » view — list first, map on demand', () => {
  it('searches around the user within the chosen radius, soonest walks first', async () => {
    const later = walkResult({
      ...forest,
      startsAt: new Date(Date.now() + 9 * 86400_000).toISOString(),
    });
    const { calls } = mockApi({ 'GET /api/v1/walks': () => ok([later, lake]) });
    await open('list');

    expect(await screen.findByText(lake.title)).toBeTruthy();
    expect(lastSearch(calls)).toMatchObject({ lat: '47.6234', lng: '7.2376', radiusKm: '10' });
    const titles = screen
      .getAllByText(/Tour du lac|Forêt du Hardt/)
      .map((node) => node.props.children);
    expect(titles).toEqual([lake.title, later.title]);

    await fireEvent.press(screen.getByRole('radio', { name: '25 km' }));
    await waitFor(() => expect(lastSearch(calls).radiusKm).toBe('25'));
    expect(lastSearch(calls)).toMatchObject({ lat: '47.6234', lng: '7.2376' });
  });

  it('switches to the full-screen map and back, keeping the filters', async () => {
    const { calls } = mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open('list');
    await screen.findByText(lake.title);
    await fireEvent.press(screen.getByRole('radio', { name: '5 km' }));
    await fireEvent.press(screen.getByRole('radio', { name: t.discover.periodAll }));

    await fireEvent.press(screen.getByRole('button', { name: t.discover.showMapA11y }));
    expect(await screen.findByLabelText(t.discover.mapLabel)).toBeTruthy();
    // The map searches its visible area (a 5 km circle around the user) with the same period.
    await waitFor(() => expect(lastSearch(calls).radiusKm).not.toBe('5'));
    expect(lastSearch(calls).to).toBeUndefined();

    // A filter changed on the map is the list's filter too.
    await fireEvent.press(screen.getAllByRole('radio', { name: 'Grand' }).at(-1)!);
    await waitFor(() => expect(lastSearch(calls).size).toBe('Large'));

    await fireEvent.press(screen.getByRole('button', { name: t.discover.showListA11y }));
    await waitFor(() => expect(screen.queryByLabelText(t.discover.mapLabel)).toBeNull());
    await waitFor(() => expect(lastSearch(calls)).toMatchObject({ radiusKm: '5', size: 'Large' }));
    expect(screen.getByRole('radio', { name: '5 km' })).toBeSelected();
    expect(screen.getByRole('radio', { name: t.discover.periodAll })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'Grand' })).toBeSelected();
  });

  it('shows the walk of a tapped pin at the bottom of the map, to open or dismiss', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake, forest]) });
    await open('list');
    await screen.findByText(lake.title);
    await fireEvent.press(screen.getByRole('button', { name: t.discover.showMapA11y }));
    await waitFor(() => expect(screen.getAllByTestId('map-marker')).toHaveLength(2));
    expect(screen.getByText(t.discover.mapHint)).toBeTruthy();

    await fireEvent.press(screen.getAllByTestId('map-marker')[1]!);
    const card = await screen.findByTestId('selected-walk');
    expect(within(card).getByText(forest.title)).toBeTruthy();

    await fireEvent.press(within(card).getByRole('button', { name: t.discover.closeWalkA11y }));
    expect(screen.queryByTestId('selected-walk')).toBeNull();

    await fireEvent.press(screen.getAllByTestId('map-marker')[0]!);
    await fireEvent.press(within(await screen.findByTestId('selected-walk')).getByText(lake.title));
    await waitFor(() => expect(screen).toHavePathname(`/walks/${lake.id}`));
  });
});

describe('« Panneau » view — map and sliding panel', () => {
  const handle = () => screen.getByTestId('panel-handle');
  const sheetPosition = () => screen.getByTestId('bottom-sheet').props.accessibilityValue.now;

  it('lists the walks of the map area in the panel, with their number on the handle', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake, forest]) });
    await open('panel');

    expect(await screen.findByText(forest.title)).toBeTruthy();
    expect(screen.getByText(lake.title)).toBeTruthy();
    expect(screen.getByText('2 balades')).toBeTruthy();
    expect(screen.getAllByTestId('map-marker')).toHaveLength(2);
  });

  it('moves through its three positions with the handle button', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open('panel');
    await screen.findByText(lake.title);

    expect(sheetPosition()).toBe(1);
    expect(handle()).toHaveAccessibleName(`1 balade. ${t.discover.panelExpand}`);
    await fireEvent.press(handle());
    expect(sheetPosition()).toBe(2);
    expect(handle()).toHaveAccessibleName(`1 balade. ${t.discover.panelShowMap}`);
    await fireEvent.press(handle());
    expect(sheetPosition()).toBe(0);
    expect(handle()).toHaveAccessibleName(`1 balade. ${t.discover.panelShowList}`);
    await fireEvent.press(handle());
    expect(sheetPosition()).toBe(1);
  });

  it('brings the walk of a tapped pin into view, highlighted', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake, forest]) });
    await open('panel');
    await screen.findByText(forest.title);
    await fireEvent.press(handle());
    await fireEvent.press(handle());
    expect(sheetPosition()).toBe(0);

    await fireEvent.press(screen.getAllByTestId('map-marker')[1]!);
    expect(sheetPosition()).toBe(1);
    expect(
      screen.getByRole('button', { name: new RegExp(`^${t.walk.selected}, ${forest.title}`) }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: new RegExp(`^${t.walk.selected}, ${lake.title}`) }),
    ).toBeNull();
  });
});

describe('refreshing the walks', () => {
  const profileRoutes = {
    'GET /api/v1/me/organizations': () => ok([]),
    'GET /api/v1/me': () => ok(testUser),
    'GET /api/v1/me/dogs': () => ok([]),
  };
  // Lets pending promises (a request started by a focus) run: timers do not advance here.
  const settle = async () => {
    for (let i = 0; i < 20; i += 1) await act(async () => {});
  };
  const refreshButton = () => screen.getByRole('button', { name: t.discover.refresh });

  /** Leaves the tab and comes back to it, `secondsAway` later. */
  async function leaveAndReturn(secondsAway: number, clock: { offsetMs: number }) {
    await act(() => router.navigate('/profile'));
    await screen.findByLabelText(t.discoverLayout.title);
    clock.offsetMs += secondsAway * 1000;
    await act(() => router.navigate('/'));
    await settle();
  }

  function fakeClock() {
    const real = Date.now.bind(Date);
    const clock = { offsetMs: 0 };
    jest.spyOn(Date, 'now').mockImplementation(() => real() + clock.offsetMs);
    return clock;
  }

  describe.each(['panel', 'list'] as const)('« %s » view, on regaining focus', (view) => {
    it('does not search twice on the first display', async () => {
      const { calls } = mockApi({
        ...profileRoutes,
        'GET /api/v1/walks': () => ok([lake]),
      });
      await open(view);
      await screen.findByText(lake.title);
      await settle();

      expect(searchCalls(calls)).toHaveLength(1);
    });

    it('does not search again when coming back within 30 seconds', async () => {
      const { calls } = mockApi({
        ...profileRoutes,
        'GET /api/v1/walks': () => ok([lake]),
      });
      await open(view);
      await screen.findByText(lake.title);
      // After rendering: the router's test helper swaps the global clock when it starts.
      const clock = fakeClock();

      await leaveAndReturn(20, clock);

      expect(searchCalls(calls)).toHaveLength(1);
    });

    it('searches again when coming back after 30 seconds or more', async () => {
      const { calls } = mockApi({
        ...profileRoutes,
        'GET /api/v1/walks': () => ok([lake]),
      });
      await open(view);
      await screen.findByText(lake.title);
      // After rendering: the router's test helper swaps the global clock when it starts.
      const clock = fakeClock();

      await leaveAndReturn(31, clock);

      await waitFor(() => expect(searchCalls(calls)).toHaveLength(2));
      expect(lastSearch(calls)).toMatchObject({ lat: '47.6234', lng: '7.2376' });
    });
  });

  it('has a discreet « Actualiser les balades » button in the panel header', async () => {
    const { calls } = mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open('panel');
    await screen.findByText(lake.title);
    await waitFor(() => expect(refreshButton()).not.toBeDisabled());
    expect(searchCalls(calls)).toHaveLength(1);

    await fireEvent.press(refreshButton());

    await waitFor(() => expect(searchCalls(calls)).toHaveLength(2));
    expect(lastSearch(calls)).toMatchObject({ lat: '47.6234', lng: '7.2376' });
  });

  it('shows that the walks are being fetched, and ignores presses meanwhile', async () => {
    let release: (() => void) | undefined;
    let count = 0;
    mockApi({
      'GET /api/v1/walks': async () => {
        count += 1;
        if (count === 2) await new Promise<void>((resolve) => (release = resolve));
        return ok([lake]);
      },
    });
    await open('panel');
    await screen.findByText(lake.title);
    await waitFor(() => expect(refreshButton()).not.toBeDisabled());

    await fireEvent.press(refreshButton());
    await waitFor(() => expect(refreshButton()).toBeBusy());
    expect(refreshButton()).toBeDisabled();
    await fireEvent.press(refreshButton());
    expect(count).toBe(2);

    await act(async () => release?.());
    await waitFor(() => expect(refreshButton()).not.toBeBusy());
  });

  it('keeps the button out of the handle: two separate buttons', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open('panel');
    await screen.findByText(lake.title);

    const handle = screen.getByTestId('panel-handle');
    expect(within(handle).queryByRole('button', { name: t.discover.refresh })).toBeNull();
    expect(handle).toHaveAccessibleName(`1 balade. ${t.discover.panelExpand}`);
  });

  it('keeps the pull-to-refresh of the « Liste » view', async () => {
    const { calls } = mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open('list');
    await screen.findByText(lake.title);

    const list = screen.getByTestId('walks-list');
    await act(async () => list.props.refreshControl.props.onRefresh());

    await waitFor(() => expect(searchCalls(calls)).toHaveLength(2));
    expect(screen.queryByRole('button', { name: t.discover.refresh })).toBeNull();
  });
});
