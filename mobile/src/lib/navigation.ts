import { usePathname, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo } from 'react';

/**
 * How long a second navigation to the same place is taken for a repeated tap.
 * Expo Router queues a `push` and only applies it a moment later, so quick taps
 * on a walk card or on « + » all got through and stacked the screen two or three
 * times. Opening the same place again on purpose takes longer than this (the
 * screen has to appear, the person has to go back and tap again).
 */
export const REPEATED_NAVIGATION_MS = 800;

let last: { key: string; at: number } | null = null;

/** Stable identity of a destination: `/walks/[id]` with its params, or the plain path. */
export function hrefKey(href: Href): string {
  if (typeof href === 'string') return href;
  const { pathname, params } = href as { pathname: string; params?: Record<string, unknown> };
  const entries = Object.entries(params ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return `${pathname}?${JSON.stringify(entries)}`;
}

/**
 * True when navigating to `href` now is a real navigation, false when it repeats
 * the previous one within `REPEATED_NAVIGATION_MS` (a double tap). Records the
 * destination when it lets it through. A different destination is never held
 * back, so a person who taps another card straight after is not slowed down.
 */
export function claimNavigation(href: Href, now: number = Date.now()): boolean {
  const key = hrefKey(href);
  if (last && last.key === key && now - last.at < REPEATED_NAVIGATION_MS) return false;
  last = { key, at: now };
  return true;
}

/** Forgets the last navigation (between tests, and once the navigation has happened). */
export function resetNavigationGuard(): void {
  last = null;
}

/**
 * Mount once, at the root. Once the screen has changed the navigation is over: the
 * destination just opened is the one on top, so the person going back and opening
 * the same place again (a walk, then back, then the same walk) is not a repeated tap.
 * The time window then only covers the taps that arrive before the screen changes.
 */
export function useNavigationGuardReset(): void {
  const pathname = usePathname();
  useEffect(() => {
    resetNavigationGuard();
  }, [pathname]);
}

/**
 * Expo Router's router whose `push`, `navigate` and `replace` ignore a repeat of the
 * previous destination within `REPEATED_NAVIGATION_MS`. The one mechanism for every
 * navigation triggered by a press: screens use it instead of `useRouter`
 * (an ESLint rule enforces it).
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
