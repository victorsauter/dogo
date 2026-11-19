import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { StyleSheet } from 'react-native';

import { sessionStore } from '@/auth/sessionStore';
import {
  DISCOVER_LAYOUT_STORAGE_KEY,
  resetDiscoverLayout,
  setDiscoverLayout,
} from '@/discover/layoutPreference';
import { config } from '@/lib/config';
import { t } from '@/strings';
import { authResponse, testUser, walkResult } from '@/test/fixtures';
import { mockApi, ok, problemResponse } from '@/test/mockApi';

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

type FilterPill = 'filter-period' | 'filter-size' | 'filter-radius';
/** The visible pill (the list's row is hidden under the full-screen map). */
const pill = (testID: FilterPill) => screen.getAllByTestId(testID).at(-1)!;
const menuOpen = () => screen.queryByTestId('menu') !== null;
async function openMenu(testID: FilterPill) {
  await fireEvent.press(pill(testID));
  expect(menuOpen()).toBe(true);
}
/** Opens the pill's menu and picks an item: the menu closes. */
async function choose(testID: FilterPill, item: string) {
  await openMenu(testID);
  await fireEvent.press(screen.getByRole('menuitem', { name: item }));
  await waitFor(() => expect(menuOpen()).toBe(false));
}

afterEach(async () => {
  config.devLogin = devLogin;
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({
    granted: true,
    status: 'granted',
  } as never);
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

    await choose('filter-radius', '25 km');
    await waitFor(() => expect(lastSearch(calls).radiusKm).toBe('25'));
    expect(lastSearch(calls)).toMatchObject({ lat: '47.6234', lng: '7.2376' });
    expect(pill('filter-radius')).toHaveAccessibleName('Distance, 25 km');
  });

  it('switches to the full-screen map and back, keeping the filters', async () => {
    const { calls } = mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open('list');
    await screen.findByText(lake.title);
    await choose('filter-radius', '5 km');
    await choose('filter-period', t.discover.periodAll);

    await fireEvent.press(screen.getByRole('button', { name: t.discover.showMapA11y }));
    expect(await screen.findByLabelText(t.discover.mapLabel)).toBeTruthy();
    // The map searches its visible area (a 5 km circle around the user) with the same period.
    await waitFor(() => expect(lastSearch(calls).radiusKm).not.toBe('5'));
    expect(lastSearch(calls).to).toBeUndefined();

    // A filter changed on the map is the list's filter too.
    await choose('filter-size', 'Grand');
    await waitFor(() => expect(lastSearch(calls).size).toBe('Large'));

    await fireEvent.press(screen.getByRole('button', { name: t.discover.showListA11y }));
    await waitFor(() => expect(screen.queryByLabelText(t.discover.mapLabel)).toBeNull());
    await waitFor(() => expect(lastSearch(calls)).toMatchObject({ radiusKm: '5', size: 'Large' }));
    expect(pill('filter-period')).toHaveAccessibleName(`Période, ${t.discover.periodAll}`);
    expect(pill('filter-radius')).toHaveAccessibleName('Distance, 5 km');
    expect(pill('filter-size')).toHaveAccessibleName('Taille, Grand');
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
    expect(screen.getByText('2 balades dans cette zone')).toBeTruthy();
    expect(screen.getAllByTestId('map-marker')).toHaveLength(2);
  });

  it('says in the header that the list depends on the map, with singular and zero', async () => {
    let walks = [lake];
    mockApi({ 'GET /api/v1/walks': () => ok(walks) });
    await open('panel');
    await screen.findByText(lake.title);
    expect(screen.getByText('1 balade dans cette zone')).toBeTruthy();

    walks = [];
    await fireEvent.press(screen.getByRole('button', { name: t.discover.refresh }));
    // Said once, in the handle: the empty state under it has no title of its own.
    expect(await screen.findAllByText(t.discover.emptyTitle)).toHaveLength(1);
    expect(screen.getByTestId('panel-handle')).toHaveAccessibleName(
      `${t.discover.emptyTitle}. ${t.discover.panelExpand}`,
    );
    // The empty state invites to move or zoom out the map, and to create a walk.
    expect(screen.getByText(/Déplace la carte ou dézoome/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: t.discover.emptyAction }).length).toBeGreaterThan(
      0,
    );
  });

  it('moves through its three positions with the handle button', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open('panel');
    await screen.findByText(lake.title);

    expect(sheetPosition()).toBe(1);
    expect(handle()).toHaveAccessibleName(`1 balade dans cette zone. ${t.discover.panelExpand}`);
    await fireEvent.press(handle());
    expect(sheetPosition()).toBe(2);
    expect(handle()).toHaveAccessibleName(`1 balade dans cette zone. ${t.discover.panelShowMap}`);
    await fireEvent.press(handle());
    expect(sheetPosition()).toBe(0);
    expect(handle()).toHaveAccessibleName(`1 balade dans cette zone. ${t.discover.panelShowList}`);
    await fireEvent.press(handle());
    expect(sheetPosition()).toBe(1);
  });

  it('keeps the map logo just above the panel where it rests, the high position covering it', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open('panel');
    await screen.findByText(lake.title);
    const bottom = () => screen.getByTestId('walks-map').props.mapPadding.bottom as number;

    const middle = bottom();
    await fireEvent.press(handle()); // high: the list covers the map, the logo stays put
    expect(bottom()).toBe(middle);
    await fireEvent.press(handle()); // low
    const low = bottom();
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(middle);
    await fireEvent.press(handle()); // middle again
    expect(bottom()).toBe(middle);
  });

  it('searches nothing when only the panel moves: the area is the whole map', async () => {
    const { calls } = mockApi({ 'GET /api/v1/walks': () => ok([lake, forest]) });
    await open('panel');
    await screen.findByText(lake.title);
    const searches = searchCalls(calls).length;

    for (let i = 0; i < 3; i++) await fireEvent.press(handle());
    // Past the search's debounce (the router's tests run on fake timers).
    await act(() => jest.advanceTimersByTimeAsync(1000));
    expect(searchCalls(calls)).toHaveLength(searches);
    expect(screen.getByText('2 balades dans cette zone')).toBeTruthy();
  });

  it('floats its controls over the map, the title kept for screen readers only', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open('panel');
    await screen.findByText(lake.title);

    expect(screen.getByRole('header', { name: t.discover.title })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: t.discover.createA11y }));
    await waitFor(() => expect(screen).toHavePathname('/walks/new'));
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
    expect(handle).toHaveAccessibleName(`1 balade dans cette zone. ${t.discover.panelExpand}`);
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

describe.each(['panel', 'list'] as const)('« %s » view, row of filter pills', (view) => {
  const sizeText = () => within(pill('filter-size')).getByText(/./);

  it('has one row of pills, each a button with its label and value', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open(view);
    await screen.findByText(lake.title);

    expect(pill('filter-period')).toHaveAccessibleName(`Période, ${t.discover.periodWeek}`);
    expect(pill('filter-size')).toHaveAccessibleName(`Taille, ${t.discover.sizeAll}`);
    expect(within(pill('filter-period')).getByText(t.discover.periodWeek)).toBeTruthy();
    expect(within(pill('filter-size')).getByText(t.discover.size)).toBeTruthy();
    // No sheet, no « Filtres » button any more; the choices live in the menus.
    expect(screen.queryByRole('button', { name: /^Filtres/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Grand' })).toBeNull();
    expect(menuOpen()).toBe(false);
  });

  it('shows the distance pill only in the « Liste » view', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open(view);
    await screen.findByText(lake.title);

    if (view === 'list') {
      expect(pill('filter-radius')).toHaveAccessibleName('Distance, 10 km');
      await openMenu('filter-radius');
      expect(screen.getByRole('menuitem', { name: '10 km' })).toBeSelected();
    } else {
      expect(screen.queryByTestId('filter-radius')).toBeNull();
    }
  });

  it('opens a menu of choices from the pill, the current one checked', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open(view);
    await screen.findByText(lake.title);

    await openMenu('filter-size');
    expect(pill('filter-size')).toBeExpanded();
    // The menu is named after what it chooses.
    expect(screen.getByLabelText(t.discover.size).props.accessibilityRole).toBe('menu');
    const items = screen.getAllByRole('menuitem').map((item) => item.props.accessibilityLabel);
    expect(items).toEqual([t.discover.sizeAll, 'Petit', 'Moyen', 'Grand']);
    expect(screen.getByRole('menuitem', { name: t.discover.sizeAll })).toBeSelected();
    expect(screen.getByRole('menuitem', { name: 'Petit' })).not.toBeSelected();
  });

  it('applies a choice at once, closes the menu and shows the value on the pill', async () => {
    const { calls } = mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open(view);
    await screen.findByText(lake.title);
    const haptics = jest.requireMock('expo-haptics') as { selectionAsync: jest.Mock };
    haptics.selectionAsync.mockClear();

    await choose('filter-size', 'Moyen');

    await waitFor(() => expect(lastSearch(calls).size).toBe('Medium'));
    expect(pill('filter-size')).toHaveAccessibleName('Taille, Moyen');
    expect(sizeText()).toHaveTextContent('Moyen');
    expect(pill('filter-size')).toBeCollapsed();
    expect(haptics.selectionAsync).toHaveBeenCalled();
  });

  it('changes the period from its pill', async () => {
    const { calls } = mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open(view);
    await screen.findByText(lake.title);

    await choose('filter-period', t.discover.periodToday);
    await waitFor(() => expect(lastSearch(calls).to).toBeDefined());
    expect(pill('filter-period')).toHaveAccessibleName(`Période, ${t.discover.periodToday}`);
    await choose('filter-period', t.discover.periodAll);
    await waitFor(() => expect(lastSearch(calls).to).toBeUndefined());
  });

  it('closes on a touch outside and with the Android back button, changing nothing', async () => {
    const { calls } = mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open(view);
    await screen.findByText(lake.title);
    const searches = searchCalls(calls).length;

    await openMenu('filter-size');
    await fireEvent.press(screen.getByTestId('menu-backdrop', { includeHiddenElements: true }));
    await waitFor(() => expect(menuOpen()).toBe(false));

    await openMenu('filter-size');
    await fireEvent(screen.getByTestId('menu'), 'requestClose');
    await waitFor(() => expect(menuOpen()).toBe(false));

    expect(pill('filter-size')).toHaveAccessibleName(`Taille, ${t.discover.sizeAll}`);
    expect(searchCalls(calls)).toHaveLength(searches);
  });

  it('marks a pill whose value is not the default, in bold too (not by colour only)', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open(view);
    await screen.findByText(lake.title);
    const weight = () => StyleSheet.flatten(sizeText().props.style).fontWeight;
    expect(weight()).toBe('500');

    await choose('filter-size', 'Petit');
    expect(weight()).toBe('700');
    // The value is on the pill itself: no separate removable label any more.
    expect(screen.queryByText('Petits chiens')).toBeNull();

    await choose('filter-size', t.discover.sizeAll);
    expect(weight()).toBe('500');
    expect(sizeText()).toHaveTextContent(t.discover.size);
  });
});

describe('the filters, when the view changes in the profile', () => {
  it('are kept from the panel to the list and back', async () => {
    const { calls } = mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open('panel');
    await screen.findByText(lake.title);
    await choose('filter-size', 'Petit');
    await choose('filter-period', t.discover.periodAll);

    await act(() => setDiscoverLayout('list'));
    expect(await screen.findByRole('button', { name: t.discover.showMapA11y })).toBeTruthy();
    expect(pill('filter-size')).toHaveAccessibleName('Taille, Petit');
    expect(pill('filter-period')).toHaveAccessibleName(`Période, ${t.discover.periodAll}`);
    await waitFor(() => expect(lastSearch(calls)).toMatchObject({ size: 'Small', radiusKm: '10' }));
    expect(lastSearch(calls).to).toBeUndefined();
    await choose('filter-radius', '25 km');

    await act(() => setDiscoverLayout('panel'));
    expect(await screen.findByTestId('bottom-sheet')).toBeTruthy();
    expect(pill('filter-size')).toHaveAccessibleName('Taille, Petit');
    await act(() => setDiscoverLayout('list'));
    expect(await screen.findByRole('button', { name: t.discover.showMapA11y })).toBeTruthy();
    expect(pill('filter-radius')).toHaveAccessibleName('Distance, 25 km');
  });
});

describe('« Liste » view, full-screen map', () => {
  it('has the same pills, without the distance (the map follows its area)', async () => {
    const { calls } = mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open('list');
    await screen.findByText(lake.title);
    await fireEvent.press(screen.getByRole('button', { name: t.discover.showMapA11y }));
    await screen.findByLabelText(t.discover.mapLabel);

    // Only the map's row is shown: the list is hidden under it.
    expect(screen.queryAllByTestId('filter-radius')).toHaveLength(0);
    expect(screen.getAllByTestId('filter-size')).toHaveLength(1);
    await choose('filter-size', 'Petit');
    await waitFor(() => expect(lastSearch(calls).size).toBe('Small'));
  });
});

describe.each(['panel', 'list'] as const)('« %s » view, « Ma position » button', (view) => {
  const animateToRegion = () =>
    (jest.requireMock('react-native-maps') as { __animateToRegion: jest.Mock }).__animateToRegion;
  const locateButtons = () => screen.queryAllByRole('button', { name: t.discover.locate });

  /** The map of the view: the panel's, or the full-screen one behind the « Carte » button. */
  async function showMap() {
    mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open(view);
    await screen.findByText(lake.title);
    if (view === 'list') {
      expect(locateButtons()).toHaveLength(0);
      await fireEvent.press(screen.getByRole('button', { name: t.discover.showMapA11y }));
      await screen.findByLabelText(t.discover.mapLabel);
    }
  }

  it('recentres the map on the user', async () => {
    await showMap();
    expect(locateButtons()).toHaveLength(1);
    animateToRegion().mockClear();

    await fireEvent.press(locateButtons()[0]!);

    expect(animateToRegion()).toHaveBeenCalledTimes(1);
    expect(animateToRegion()).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 47.6234, longitude: 7.2376 }),
      expect.any(Number),
    );
  });

  it('is not shown when the location is refused', async () => {
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({
      granted: false,
    } as never);
    await showMap();

    expect(locateButtons()).toHaveLength(0);
  });

  it('is not shown when the position is unavailable', async () => {
    jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValueOnce(null);
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValueOnce(null as never);
    await showMap();

    expect(locateButtons()).toHaveLength(0);
  });
});

describe('« Panneau » view, « Ma position » button and the panel', () => {
  it('stays over the map at the low and middle positions, and gives way at the high one', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open('panel');
    await screen.findByText(lake.title);
    const locate = () => screen.queryByRole('button', { name: t.discover.locate });

    expect(locate()).toBeTruthy(); // middle
    await fireEvent.press(screen.getByTestId('panel-handle')); // high
    expect(locate()).toBeNull();
    expect(
      screen.getByTestId('locate-anchor', { includeHiddenElements: true }).props.pointerEvents,
    ).toBe('none');
    await fireEvent.press(screen.getByTestId('panel-handle')); // low
    expect(locate()).toBeTruthy();
    expect(
      screen.getByTestId('locate-anchor', { includeHiddenElements: true }).props.pointerEvents,
    ).toBe('box-none');
  });
});

describe('a search that is full, or that failed', () => {
  /** 100 walks, the API's maximum for one search. */
  const fullPage = Array.from({ length: 100 }, (_, i) =>
    walkResult({
      id: `a1a1a1a1-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      title: `Balade ${i + 1}`,
    }),
  );

  it('says the list is partial, not that the area holds exactly 100 walks (panel)', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok(fullPage) });
    await open('panel');

    expect(await screen.findByText('100 balades affichées : zoome pour affiner')).toBeTruthy();
    expect(screen.queryByText('100 balades dans cette zone')).toBeNull();
  });

  it('says the list is partial (list view)', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok(fullPage) });
    await open('list');

    expect(
      await screen.findByText(
        '100 balades affichées : choisis une distance plus courte pour affiner',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('100 balades')).toBeNull();
  });

  it('still counts a search below the maximum as the whole area', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok(fullPage.slice(0, 99)) });
    await open('panel');
    expect(await screen.findByText('99 balades dans cette zone')).toBeTruthy();
  });

  it('does not announce « Aucune balade » when the search failed (panel header)', async () => {
    mockApi({ 'GET /api/v1/walks': () => problemResponse(400, 'validation.failed') });
    await open('panel');

    expect(await screen.findByText(t.discover.panelError)).toBeTruthy();
    expect(screen.getByTestId('panel-handle')).toHaveAccessibleName(
      `${t.discover.panelError}. ${t.discover.panelExpand}`,
    );
    // The empty-area title is only for an area that really is empty.
    expect(screen.queryByText(t.discover.emptyTitle)).toBeNull();
  });
});

describe('API out of reach while earlier walks are shown', () => {
  /** A search that works once, then fails like a refused or unreachable server (no retry for a 429). */
  function flaky() {
    let failing = false;
    mockApi({
      'GET /api/v1/walks': () =>
        failing ? problemResponse(429, 'rate_limit.exceeded') : ok([lake]),
    });
    return (value: boolean) => {
      failing = value;
    };
  }
  const stale = /^Impossible d’actualiser : ces balades datent de \d{2}:\d{2}\.$/;

  it('panel: says the walks are old when the refresh fails, and forgets it once it works', async () => {
    const setFailing = flaky();
    await open('panel');
    await screen.findByText(lake.title);
    expect(screen.queryByTestId('stale-notice')).toBeNull();

    setFailing(true);
    await fireEvent.press(screen.getByRole('button', { name: t.discover.refresh }));
    expect(await screen.findByText(stale)).toBeTruthy();
    // The old walks stay: the notice does not replace them.
    expect(screen.getByText(lake.title)).toBeTruthy();
    expect(screen.queryByText(t.discover.panelError)).toBeNull();

    setFailing(false);
    await fireEvent.press(screen.getByRole('button', { name: t.discover.refresh }));
    await waitFor(() => expect(screen.queryByTestId('stale-notice')).toBeNull());
  });

  it('list: says the walks are old when the refresh fails, and forgets it once it works', async () => {
    const setFailing = flaky();
    await open('list');
    await screen.findByText(lake.title);
    expect(screen.queryByTestId('stale-notice')).toBeNull();

    const onRefresh = () => {
      const { refreshControl } = screen.getByTestId('walks-list').props as {
        refreshControl: { props: { onRefresh: () => Promise<void> } };
      };
      return act(() => refreshControl.props.onRefresh());
    };
    setFailing(true);
    await onRefresh();
    expect(await screen.findByText(stale)).toBeTruthy();
    expect(screen.getByText(lake.title)).toBeTruthy();

    setFailing(false);
    await onRefresh();
    await waitFor(() => expect(screen.queryByTestId('stale-notice')).toBeNull());
  });

  it('shows no such notice when nothing was ever loaded (the error state speaks)', async () => {
    mockApi({ 'GET /api/v1/walks': () => problemResponse(429, 'rate_limit.exceeded') });
    await open('panel');
    expect(await screen.findByText(t.discover.panelError)).toBeTruthy();
    expect(screen.queryByTestId('stale-notice')).toBeNull();
  });
});

describe('empty area (panel)', () => {
  it('says « Aucune balade dans cette zone » once, in the handle, not again as a title', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([]) });
    await open('panel');
    expect(await screen.findByText(t.discover.emptyMessage)).toBeTruthy();
    expect(screen.getAllByText(t.discover.emptyTitle)).toHaveLength(1);
    expect(
      within(screen.getByTestId('panel-handle')).getByText(t.discover.emptyTitle),
    ).toBeTruthy();
  });
});

describe('enlarged text (list view)', () => {
  it('keeps the last card clear of the « Carte » button, whatever its height', async () => {
    mockApi({ 'GET /api/v1/walks': () => ok([lake]) });
    await open('list');
    await screen.findByText(lake.title);
    const padding = () =>
      StyleSheet.flatten(screen.getByTestId('walks-list').props.contentContainerStyle)
        .paddingBottom as number;
    const initial = padding();
    // 52 + two margins at the normal size.
    expect(initial).toBe(52 + 32);

    // Enlarged text makes the button taller: the list follows its measured height.
    await fireEvent(screen.getByTestId('map-button-anchor'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 110 } },
    });
    await waitFor(() => expect(padding()).toBe(110 + 32));
  });
});
