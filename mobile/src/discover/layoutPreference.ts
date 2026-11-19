import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

/**
 * The view of the « Balades » tab: `panel` is the full-screen map with the
 * walks in a sliding panel (the default), `list` the list first with the map on
 * demand. The choice is made in the profile settings and kept on the device.
 */
export type DiscoverLayout = 'panel' | 'list';

export const DEFAULT_DISCOVER_LAYOUT: DiscoverLayout = 'panel';
// `uzu.` prefix, like the other storage keys (ADR 0041).
export const DISCOVER_LAYOUT_STORAGE_KEY = 'uzu.discoverLayout';

/** A stored value to a layout: anything unknown (including the retired `current`) is the default. */
export function parseDiscoverLayout(stored: unknown): DiscoverLayout {
  return stored === 'list' ? 'list' : DEFAULT_DISCOVER_LAYOUT;
}

// A tiny store shared by the tab and the settings: changing the choice updates
// the tab at once, without a restart. `layout` is `null` until the stored value
// has been read (a few milliseconds), so the tab does not flash the wrong view.
let layout: DiscoverLayout | null = null;
let reading = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function readStoredLayout() {
  if (reading) return;
  reading = true;
  SecureStore.getItemAsync(DISCOVER_LAYOUT_STORAGE_KEY)
    .catch(() => null)
    .then((stored) => {
      // A choice made while reading wins over the stored one.
      if (layout !== null) return;
      layout = parseDiscoverLayout(stored);
      notify();
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  readStoredLayout();
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => layout;

/** Chooses the view and remembers it across launches. */
export function setDiscoverLayout(next: DiscoverLayout): void {
  layout = next;
  notify();
  void SecureStore.setItemAsync(DISCOVER_LAYOUT_STORAGE_KEY, next).catch(() => undefined);
}

/** The chosen view (`null` while the stored choice is read) and its setter. */
export function useDiscoverLayout(): {
  layout: DiscoverLayout | null;
  setLayout: (layout: DiscoverLayout) => void;
} {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { layout: current, setLayout: setDiscoverLayout };
}

/** Forgets the in-memory choice so the next read goes back to the device (tests). */
export function resetDiscoverLayout(): void {
  layout = null;
  reading = false;
}
