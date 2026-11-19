import { usePathname, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo } from 'react';

/**
 * Safety net: how long a navigation that has not visibly happened yet (the path
 * is still the one it left from) keeps holding back a repeat of itself. Expo
 * Router queues a `push` and only applies it a moment later, and on a slow
 * device (Expo Go in development) the new screen can take more than a second to
 * appear: taps on a walk card or on « + » spaced by about a second all got
 * through a fixed 800 ms window and stacked the screen. The guard is therefore
 * released by the navigation itself (see `notePathname`), not by a clock; the
 * clock only makes sure a navigation that never happens cannot block for good.
 */
export const PENDING_NAVIGATION_TIMEOUT_MS = 5_000;

type Pending = {
  /** Destination claimed, as `hrefKey` gives it. */
  key: string;
  /** When it was claimed. */
  at: number;
  /** The path shown when it was claimed. */
  origin: string | null;
  /** Whether the path has since moved away from `origin` (the navigation happened). */
  arrived: boolean;
};

let pending: Pending | null = null;
let currentPathname: string | null = null;

/** Stable identity of a destination: `/walks/[id]` with its params, or the plain path. */
export function hrefKey(href: Href): string {
  if (typeof href === 'string') return href;
  const { pathname, params } = href as { pathname: string; params?: Record<string, unknown> };
  const entries = Object.entries(params ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return `${pathname}?${JSON.stringify(entries)}`;
}

/**
 * True when navigating to `href` now is a real navigation, false when it repeats
 * the navigation still under way to the same destination. A navigation is under
 * way from the moment it is let through until the path has changed twice (it
 * left the screen it started from, then the person went back or elsewhere): the
 * taps that land on the old screen while the new one is still appearing are
 * ignored, however far apart. While the path has not changed at all, the hold
 * ends after `PENDING_NAVIGATION_TIMEOUT_MS`. A different destination is never
 * held back, so a person who taps another card straight after is not slowed
 * down (and a notification link or a session redirect goes through as before).
 */
export function claimNavigation(href: Href, now: number = Date.now()): boolean {
  const key = hrefKey(href);
  if (
    pending &&
    pending.key === key &&
    (pending.arrived || now - pending.at < PENDING_NAVIGATION_TIMEOUT_MS)
  ) {
    return false;
  }
  pending = { key, at: now, origin: currentPathname, arrived: false };
  return true;
}

/**
 * Records the path now shown. The first change after a claim is the claimed
 * navigation taking place (the guard keeps holding, for the taps still landing on
 * the old screen); the next one (back to the screen it started from, or anywhere
 * else) ends it, so the same destination can be opened again right away.
 */
export function notePathname(pathname: string): void {
  if (pathname !== currentPathname && pending) {
    if (!pending.arrived) {
      if (pathname !== pending.origin) pending.arrived = true;
    } else {
      pending = null;
    }
  }
  currentPathname = pathname;
}

/** Forgets the navigation under way and the path seen (between tests). */
export function resetNavigationGuard(): void {
  pending = null;
  currentPathname = null;
}

/** Mount once, at the root: feeds the guard with the path shown (`notePathname`). */
export function useNavigationGuardReset(): void {
  const pathname = usePathname();
  useEffect(() => {
    notePathname(pathname);
  }, [pathname]);
}

/**
 * Expo Router's router whose `push`, `navigate` and `replace` ignore a repeat of
 * the navigation under way to the same destination (`claimNavigation`). The one
 * mechanism for every navigation triggered by a press: screens use it instead of
 * `useRouter` (an ESLint rule enforces it).
 */
export function useGuardedRouter() {
  const router = useRouter();
  return useMemo(
    () => ({
      back: router.back,
      canGoBack: router.canGoBack,
      dismiss: router.dismiss,
      dismissAll: router.dismissAll,
      dismissTo: router.dismissTo,
      canDismiss: router.canDismiss,
      setParams: router.setParams,
      prefetch: router.prefetch,
      push: ((href, options) => {
        if (claimNavigation(href)) router.push(href, options);
      }) as typeof router.push,
      navigate: ((href, options) => {
        if (claimNavigation(href)) router.navigate(href, options);
      }) as typeof router.navigate,
      replace: ((href, options) => {
        if (claimNavigation(href)) router.replace(href, options);
      }) as typeof router.replace,
    }),
    [router],
  );
}
