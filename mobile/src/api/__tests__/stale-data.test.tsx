import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { useUpdateDog, useUploadDogPhoto } from '@/api/dogs';
import { useRequestMembership, useUpdateOrganization } from '@/api/organizations';
import { useUpdateProfile } from '@/api/profile';
import type { UpdateDogRequest } from '@/api/types';
import { useRegisterDogs } from '@/api/walks';
import { SessionProvider } from '@/auth';
import { sessionStore } from '@/auth/sessionStore';
import { authResponse, testDog } from '@/test/fixtures';
import { mockApi, ok } from '@/test/mockApi';

/**
 * Walks display other people's data (names and photos of participants, dogs,
 * the name of an organisation): when that data changes, every walk query is
 * stale, and so is the page of an organisation, which lists its upcoming walks.
 */
describe('mutations mark the views that show their data as stale', () => {
  const clients: QueryClient[] = [];
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });

  /** A client holding one cached query per view, none of them stale yet. */
  function setup() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    clients.push(queryClient);
    const views = {
      search: ['walks', 'search', { lat: 47.5 }],
      detail: ['walks', 'walk-1'],
      thread: ['walks', 'walk-1', 'messages'],
      mine: ['me', 'walks', 'Participant', 'Upcoming'],
      organization: ['organizations', 'org-1'],
      members: ['organizations', 'org-1', 'members'],
    } as const;
    for (const key of Object.values(views)) queryClient.setQueryData(key, { cached: true });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    );
    const stale = (name: keyof typeof views) =>
      queryClient.getQueryState(views[name])?.isInvalidated === true;
    return { wrapper, stale };
  }

  it('a profile change refreshes walks and organisation pages (names, photos)', async () => {
    mockApi({
      'PATCH /api/v1/me': () => ok({ ...authResponse().user, displayName: 'Léa M.' }),
    });
    await sessionStore.set(authResponse());
    const { wrapper, stale } = setup();
    const { result } = await renderHook(() => useUpdateProfile(), { wrapper });

    await act(() => result.current.mutateAsync({ displayName: 'Léa M.', bio: '' }));

    expect(stale('search') && stale('detail') && stale('thread') && stale('mine')).toBe(true);
    expect(stale('organization') && stale('members')).toBe(true);
  });

  it('updating a dog refreshes the walks it is registered to', async () => {
    mockApi({ [`PATCH /api/v1/dogs/${testDog.id}`]: () => ok(testDog) });
    const { wrapper, stale } = setup();
    const { result } = await renderHook(() => useUpdateDog(testDog.id), { wrapper });

    await act(() => result.current.mutateAsync({ name: 'Nala' } as UpdateDogRequest));

    expect(stale('search') && stale('detail') && stale('mine') && stale('organization')).toBe(true);
  });

  it('sending a dog photo refreshes the walks', async () => {
    mockApi({ [`PUT /api/v1/dogs/${testDog.id}/photo`]: () => ok(testDog) });
    const { wrapper, stale } = setup();
    const { result } = await renderHook(() => useUploadDogPhoto(), { wrapper });

    await act(() =>
      result.current.mutateAsync({
        id: testDog.id,
        photo: { uri: 'file:///tmp/dog.jpg', name: 'dog.jpg', type: 'image/jpeg' },
      } as never),
    );

    expect(stale('search') && stale('detail') && stale('mine')).toBe(true);
  });

  it('registering to a walk refreshes the organisation page that lists it', async () => {
    mockApi({ 'POST /api/v1/walks/walk-1/registrations': () => ok([]) });
    const { wrapper, stale } = setup();
    const { result } = await renderHook(() => useRegisterDogs('walk-1'), { wrapper });

    await act(() => result.current.mutateAsync([testDog.id]));

    expect(stale('detail') && stale('search') && stale('mine') && stale('organization')).toBe(true);
  });

  it('editing an organisation refreshes the walks that carry its name', async () => {
    mockApi({ 'PATCH /api/v1/organizations/org-1': () => ok({ id: 'org-1' }) });
    const { wrapper, stale } = setup();
    const { result } = await renderHook(() => useUpdateOrganization('org-1'), { wrapper });

    await act(() => result.current.mutateAsync({ name: 'Nouveau nom' }));

    expect(stale('organization') && stale('search') && stale('detail') && stale('mine')).toBe(true);
  });

  it('joining an organisation refreshes the walks its members may now register to', async () => {
    mockApi({ 'POST /api/v1/organizations/org-1/memberships': () => ok({ id: 'm-1' }) });
    const { wrapper, stale } = setup();
    const { result } = await renderHook(() => useRequestMembership('org-1'), { wrapper });

    await act(() => result.current.mutateAsync());

    expect(stale('search') && stale('detail') && stale('organization')).toBe(true);
  });
});
