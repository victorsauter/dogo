import { useSyncExternalStore } from 'react';

let notice: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Sets (or clears, with `null`) the sentence the sign-in screen shows once. */
export function setSignInNotice(message: string | null): void {
  notice = message;
  emit();
}

/** The pending sign-in sentence, e.g. « Ton compte a été supprimé ». */
export function useSignInNotice(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => notice,
  );
}
