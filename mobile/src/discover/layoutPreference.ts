import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';

import { config } from '@/lib/config';

/**
 * Prototype: layouts of the « Balades » tab the product owner compares.
 * `current`: map above the list; `list`: list first, full-screen map on demand;
 * `panel`: full map with the list in a sliding panel.
 */
export type DiscoverLayout = 'current' | 'list' | 'panel';

export const DISCOVER_LAYOUTS: readonly DiscoverLayout[] = ['current', 'list', 'panel'];
export const DISCOVER_LAYOUT_STORAGE_KEY = 'dogo.discoverLayout';

function isLayout(value: unknown): value is DiscoverLayout {
  return DISCOVER_LAYOUTS.includes(value as DiscoverLayout);
}

/**
 * The layout to show and a setter that remembers it across launches. Without
 * `EXPO_PUBLIC_DEV_LOGIN` the choice is neither offered nor read: always `current`.
 * `layout` is `null` while the stored choice is being read (a few milliseconds).
 */
export function useDiscoverLayout(): {
  enabled: boolean;
  layout: DiscoverLayout | null;
  setLayout: (layout: DiscoverLayout) => void;
} {
  const enabled = config.devLogin;
  const [layout, setLayoutState] = useState<DiscoverLayout | null>(enabled ? null : 'current');

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    SecureStore.getItemAsync(DISCOVER_LAYOUT_STORAGE_KEY)
      .catch(() => null)
      .then((stored) => {
        if (active) setLayoutState(isLayout(stored) ? stored : 'current');
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  const setLayout = useCallback((next: DiscoverLayout) => {
    setLayoutState(next);
    void SecureStore.setItemAsync(DISCOVER_LAYOUT_STORAGE_KEY, next).catch(() => undefined);
  }, []);

  return { enabled, layout: enabled ? layout : 'current', setLayout };
}
