import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { useCreateDog } from '@/api/dogs';
import { useCreateOrganization } from '@/api/organizations';
import { useCreateWalk } from '@/api/walks';
import { toCreateWalkRequest, emptyWalkForm } from '@/lib/forms';
import { testDog, walkDetail } from '@/test/fixtures';
import { mockApi, ok } from '@/test/mockApi';

/**
 * A write that succeeded must hand control back at once: the lists it makes
 * stale are refetched in the background. A button that kept spinning on a slow
 * network made people create the same walk twice.
 */
describe('mutations do not wait for the cache to refresh', () => {
  const never = () => new Promise<never>(() => {});
  // Clearing the clients cancels their garbage-collection timers, which would keep Jest open.
  const clients: QueryClient[] = [];
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });

  function setup() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(queryClient);
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return { queryClient, wrapper };
  }

  /** Observes a list under `key` whose refetch never answers. */
  function useStuckList(key: readonly string[]) {
    return useQuery({ queryKey: key, queryFn: never, staleTime: Infinity });
  }

  it('creating a walk resolves while the lists refetch is still pending', async () => {
    const created = walkDetail({ id: 'new-walk' });
    mockApi({ 'POST /api/v1/walks': () => ok(created) });
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(
      () => ({ create: useCreateWalk(), search: useStuckList(['walks', 'search']) }),
      { wrapper },
    );

    const walk = await act(() =>
      result.current.create.mutateAsync(
        toCreateWalkRequest({
          ...emptyWalkForm({ latitude: 47.5, longitude: 7.2 }, new Date()),
          title: 'Tour',
          locationLabel: 'Parc',
        }),
      ),
    );

    expect(walk.id).toBe('new-walk');
    // The refetch was started (the list is stale) but nobody waited for it.
    expect(queryClient.isFetching({ queryKey: ['walks', 'search'] })).toBe(1);
  });

  it('creating a dog and an organisation resolve the same way', async () => {
    mockApi({
      'POST /api/v1/dogs': () => ok(testDog),
      'POST /api/v1/organizations': () => ok({ id: 'org-1' }),
    });
    const { wrapper } = setup();
    const { result } = await renderHook(
      () => ({
        dog: useCreateDog(),
        organization: useCreateOrganization(),
        mine: useStuckList(['me', 'dogs']),
        organizations: useStuckList(['organizations', 'mine']),
      }),
      { wrapper },
    );

    const dog = await act(() =>
      result.current.dog.mutateAsync({
        name: 'Biscotte',
        size: 'Medium',
        sociability: 'Easygoing',
        reactivity: 'Mild',
        leashHabit: 'LongLine',
      }),
    );
    const organization = await act(() =>
      result.current.organization.mutateAsync({ name: 'Club canin du lac' }),
    );

    expect(dog.id).toBe(testDog.id);
    expect(organization.id).toBe('org-1');
  });
});
