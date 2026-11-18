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
