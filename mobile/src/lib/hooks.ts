import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

/** `value`, updated only once it has stopped changing for `delayMs` (map panning). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * `true` only when `flag` has stayed true for `delayMs`: a loading indicator
 * that does not flash for fast answers.
 */
export function useDelayedFlag(flag: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!flag) return;
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [flag, delayMs]);
  return flag && shown;
}

/**
 * Runs `refetch` every time the screen regains focus (coming back from another
 * screen or tab), but not on the first focus, when the query has just loaded.
 * For data that changes elsewhere, e.g. an organisation validated by the team.
 */
export function useRefetchOnFocus(refetch: () => unknown): void {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      void refetch();
    }, [refetch]),
  );
}

/** How fresh data must be to skip the refresh when a tab regains focus. */
export const FOCUS_REFRESH_MIN_AGE_MS = 30_000;

/**
 * Like `useRefetchOnFocus`, but only when the data is older than
 * `FOCUS_REFRESH_MIN_AGE_MS`: coming back to the tab right away does not search
 * again. Never on the first focus (the query has just loaded), never while a
 * request is running, and not when the query is disabled.
 */
export function useRefetchOnFocusIfStale({
  refetch,
  dataUpdatedAt,
  enabled,
  busy,
}: {
  refetch: () => unknown;
  /** When the data was last received (TanStack Query's `dataUpdatedAt`, `0` for none). */
  dataUpdatedAt: number;
  enabled: boolean;
  busy: boolean;
}): void {
  // Latest values, read when the focus comes back: the focus effect itself must
  // not re-run each time they change.
  const latest = useRef({ refetch, dataUpdatedAt, enabled, busy });
  useEffect(() => {
    latest.current = { refetch, dataUpdatedAt, enabled, busy };
  });
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      const { refetch: run, dataUpdatedAt: updatedAt, enabled: on, busy: running } = latest.current;
      if (on && !running && Date.now() - updatedAt >= FOCUS_REFRESH_MIN_AGE_MS) void run();
    }, []),
  );
}
