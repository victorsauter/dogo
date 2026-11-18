import { useEffect, useState } from 'react';

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
