import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { sessionStore } from '@/auth/sessionStore';
import {
  claimNavigation,
  hrefKey,
  REPEATED_NAVIGATION_MS,
  resetNavigationGuard,
} from '@/lib/navigation';
import { t } from '@/strings';
import { authResponse, otherUser, walkDetail, walkResult } from '@/test/fixtures';
import { mockApi, ok } from '@/test/mockApi';

const APP_DIR = './src/app';
const walk = walkDetail();

afterEach(async () => {
  await act(() => sessionStore.clear());
});

describe('the guard against repeated taps', () => {
  beforeEach(() => resetNavigationGuard());

  it('lets a first navigation through and holds back its repeat', () => {
    expect(claimNavigation('/walks/new', 1_000)).toBe(true);
    expect(claimNavigation('/walks/new', 1_100)).toBe(false);
    expect(claimNavigation('/walks/new', 1_000 + REPEATED_NAVIGATION_MS - 1)).toBe(false);
  });

  it('lets the same destination through again once the window has passed', () => {
    expect(claimNavigation('/walks/new', 1_000)).toBe(true);
    expect(claimNavigation('/walks/new', 1_000 + REPEATED_NAVIGATION_MS)).toBe(true);
  });

  it('never holds back a different destination, nor the same screen with other params', () => {
    const a = { pathname: '/walks/[id]', params: { id: 'a' } } as const;
    const b = { pathname: '/walks/[id]', params: { id: 'b' } } as const;
    expect(claimNavigation(a, 1_000)).toBe(true);
    expect(claimNavigation(b, 1_010)).toBe(true);
    expect(claimNavigation('/walks/new', 1_020)).toBe(true);
    expect(claimNavigation(a, 1_030)).toBe(true);
  });

  it('identifies a destination by its path and its params, whatever their order', () => {
    expect(hrefKey({ pathname: '/x/[a]', params: { a: '1', b: '2' } })).toBe(
      hrefKey({ pathname: '/x/[a]', params: { b: '2', a: '1' } }),
    );
    expect(hrefKey({ pathname: '/x/[a]', params: { a: '1' } })).not.toBe(
      hrefKey({ pathname: '/x/[a]', params: { a: '2' } }),
    );
  });
});

describe('rapid repeated taps', () => {
  async function openHome() {
    mockApi({
      'GET /api/v1/walks': () => ok([walkResult({ id: walk.id })]),
      [`GET /api/v1/walks/${walk.id}`]: () => ok(walk),
      'GET /api/v1/me/dogs': () => ok([]),
    });
    await sessionStore.set(authResponse());
    await renderRouter(APP_DIR, { initialUrl: '/' });
    return screen.findByText('Tour du lac');
  }

  it('open a walk once, not once per tap', async () => {
    const card = await openHome();

    // Three taps before the first navigation has been applied.
    await act(async () => {
      void fireEvent.press(card);
      void fireEvent.press(card);
      void fireEvent.press(card);
    });
    await waitFor(() => expect(screen).toHavePathname(`/walks/${walk.id}`));
    expect(await screen.findByText(walk.description)).toBeTruthy();

    // One « back » is enough to return: the screen was not stacked twice.
    await act(async () => router.back());
    await waitFor(() => expect(screen).toHavePathname('/'));
  });

  it('open the walk form once from « + »', async () => {
    await openHome();
    const plus = screen.getByRole('button', { name: t.discover.createA11y });

    await act(async () => {
      void fireEvent.press(plus);
      void fireEvent.press(plus);
    });
    await waitFor(() => expect(screen).toHavePathname('/walks/new'));
    expect(await screen.findByLabelText(t.walk.title)).toBeTruthy();

    await act(async () => router.back());
    await waitFor(() => expect(screen).toHavePathname('/'));
  });

  it('do not hinder going back and opening the same walk again right away', async () => {
    const card = await openHome();
    await fireEvent.press(card);
    await waitFor(() => expect(screen).toHavePathname(`/walks/${walk.id}`));
    await act(async () => router.back());
    await waitFor(() => expect(screen).toHavePathname('/'));

    // Immediately, well within the repeated-tap window: a real navigation.
    await fireEvent.press(await screen.findByText('Tour du lac'));
    await waitFor(() => expect(screen).toHavePathname(`/walks/${walk.id}`));
  });

  it('do not hinder two different destinations in a row', async () => {
    const card = await openHome();
    await fireEvent.press(card);
    await waitFor(() => expect(screen).toHavePathname(`/walks/${walk.id}`));
    await screen.findByText(walk.description);
    // From the walk, the organizer's profile: another destination, at once.
    await fireEvent.press(
      screen.getAllByLabelText(`Voir le profil de ${otherUser.displayName}`)[0]!,
    );
    await waitFor(() => expect(screen).toHavePathname(`/users/${otherUser.id}`));
  });
});
