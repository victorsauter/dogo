import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, Platform } from 'react-native';

import { ApiError } from './errors';

const MAX_RETRIES = 2;

/** A request that timed out is retried once: two more full waits would keep a spinner up for a minute. */
const MAX_TIMEOUT_RETRIES = 1;

/**
 * Retries network and 5xx failures, never 4xx (429 included: retrying at once
 * would make the rate limit worse) nor app-side failures (the answer will not change).
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && (error.isClientError || error.kind === 'client')) return false;
  if (error instanceof ApiError && error.timedOut) return failureCount < MAX_TIMEOUT_RETRIES;
  return failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * Wires TanStack Query to React Native: refetch when the app comes back to the
 * foreground and when the network comes back. Call once; returns a cleanup.
 */
export function connectQueryEventsToReactNative(): () => void {
  if (Platform.OS === 'web') return () => {};

  onlineManager.setEventListener((setOnline) => {
    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(state.isConnected !== false);
    });
    return () => subscription.remove();
  });

  const appState = AppState.addEventListener('change', (status) => {
    focusManager.setFocused(status === 'active');
  });
  return () => appState.remove();
}
