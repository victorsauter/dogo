import { focusManager, MutationCache, onlineManager, QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, Platform } from 'react-native';

import { ApiError } from './errors';

const MAX_RETRIES = 2;

/**
 * A request that timed out is not retried: it already waited the full time limit
 * (20 s), and one more wait kept a pull-to-refresh spinning 40 s or more against
 * an API out of reach. The screen says so at once and offers to try again.
 */
const MAX_TIMEOUT_RETRIES = 0;

/**
 * Retries network and 5xx failures, never 4xx (429 included: retrying at once
 * would make the rate limit worse) nor app-side failures (the answer will not change).
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && (error.isClientError || error.kind === 'client')) return false;
  if (error instanceof ApiError && error.timedOut) return failureCount < MAX_TIMEOUT_RETRIES;
  return failureCount < MAX_RETRIES;
}

/**
 * True when a refused write means what the screen shows is out of date: the
 * thing is gone (404) or its state no longer allows the action (409, e.g. a
 * walk that filled up, an organisation no longer validated, a request already
 * answered). The screen then explains the refusal and shows the current state.
 */
export function isOutdatedDataError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.kind === 'http' &&
    (error.status === 404 || error.status === 409)
  );
}

export function createQueryClient(): QueryClient {
  const queryClient: QueryClient = new QueryClient({
    mutationCache: new MutationCache({
      // One mechanism for every write: queries on screen refetch, the others are
      // marked stale. Not awaited: the message of the refusal must not wait for it.
      onError: (error) => {
        if (isOutdatedDataError(error)) void queryClient.invalidateQueries();
      },
    }),
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
  return queryClient;
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
