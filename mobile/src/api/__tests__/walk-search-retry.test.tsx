import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import {
  STALE_SEARCH_RETRY_MS,
  staleSearchRetryInterval,
  useWalkSearch,
  type WalkSearchParams,
} from '@/api/walks';
import { SessionProvider } from '@/auth';
import { sessionStore } from '@/auth/sessionStore';
import { authResponse, walkResult } from '@/test/fixtures';
import { mockApi, ok, problemResponse } from '@/test/mockApi';

describe('a search whose refresh failed over older walks', () => {
  it('tries again on its own only while it shows older walks after a failure', () => {
    expect(staleSearchRetryInterval({ status: 'success', data: [] })).toBe(false);
    expect(staleSearchRetryInterval({ status: 'error', data: undefined })).toBe(false);
    expect(staleSearchRetryInterval({ status: 'pending', data: undefined })).toBe(false);
    expect(staleSearchRetryInterval({ status: 'error', data: [] })).toBe(STALE_SEARCH_RETRY_MS);
  });

  describe('once the API answers again', () => {
    const clients: QueryClient[] = [];
    afterEach(async () => {
      jest.useRealTimers();
      clients.splice(0).forEach((client) => client.clear());
      await act(() => sessionStore.clear());
    });

    it('forgets the failure without waiting for the tab to regain focus', async () => {
      // Fake timers that still move on their own: the interval can be skipped ahead.
      jest.useFakeTimers({ advanceTimers: true });
      let failing = false;
      mockApi({
        'GET /api/v1/walks': () =>
          failing ? problemResponse(503, 'server.error') : ok([walkResult()]),
      });
      await sessionStore.set(authResponse());
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      clients.push(queryClient);
      const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
          <SessionProvider>{children}</SessionProvider>
        </QueryClientProvider>
      );
      const params: WalkSearchParams = { lat: 47.53, lng: 7.18, radiusKm: 10, limit: 100 };
      const { result } = await renderHook(() => useWalkSearch(params), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      failing = true;
      await act(async () => void (await result.current.refetch()));
      await waitFor(() => expect(result.current.isRefetchError).toBe(true));

      // The API is back; nobody touches the screen.
      failing = false;
      await act(async () => void jest.advanceTimersByTime(STALE_SEARCH_RETRY_MS));
      await waitFor(() => expect(result.current.isRefetchError).toBe(false));
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
