import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { api, unwrap } from './client';
import type { MembershipRole } from './enums';
import type { CreateOrganizationRequest, MyOrganization, UpdateOrganizationRequest } from './types';
import { walksChanged } from './walks';

export const organizationKeys = {
  all: ['organizations'] as const,
  search: (query: string) => ['organizations', 'search', query] as const,
  detail: (id: string) => ['organizations', id] as const,
  members: (id: string) => ['organizations', id, 'members'] as const,
  mine: ['me', 'organizations'] as const,
};

// ---- Reading

/** Approved organisations whose name or city contains `query` (all of them when empty). */
export function useOrganizationSearch(query: string) {
  return useQuery({
    queryKey: organizationKeys.search(query),
    queryFn: () => unwrap(api.GET('/api/v1/organizations', { params: { query: { query } } })),
    placeholderData: keepPreviousData,
  });
}

/** Every membership of mine, whatever its status, with its organisation. */
export function useMyOrganizations() {
  return useQuery({
    queryKey: organizationKeys.mine,
    queryFn: () => unwrap(api.GET('/api/v1/me/organizations')),
  });
}

export function useOrganization(id: string) {
  return useQuery({
    queryKey: organizationKeys.detail(id),
    queryFn: () => unwrap(api.GET('/api/v1/organizations/{id}', { params: { path: { id } } })),
  });
}

/**
 * Largest page the API gives for each of the two lists (members, requests);
 * its default is 50, which would silently hide the rest of a big organisation.
 */
export const MEMBERS_LIMIT = 100;

/** True when a list came back full: the API stops at `MEMBERS_LIMIT`, so there may be more people. */
export function isMembersListCapped(count: number): boolean {
  return count >= MEMBERS_LIMIT;
}

/** Members and requests: only the owner and the educators may read them (403 otherwise). */
export function useOrganizationMembers(id: string) {
  return useQuery({
    queryKey: organizationKeys.members(id),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/organizations/{id}/memberships', {
          params: { path: { id }, query: { limit: MEMBERS_LIMIT } },
        }),
      ),
    retry: false,
  });
}

/**
 * Organisations in which I may organise professional walks: approved ones
 * where I am the owner or an educator and my membership is accepted.
 */
export function organizingOrganizations(mine: MyOrganization[] | undefined) {
  return (mine ?? []).filter(
    ({ organization, membership }) =>
      organization.status === 'Approved' &&
      membership.status === 'Accepted' &&
      (membership.role === 'Owner' || membership.role === 'Educator'),
  );
}

/**
 * Refreshes every view of organisations: search, detail, members, my list, and
 * the walks that show an organisation's name or that its members may join.
 * Not awaited, like `walksChanged`.
 */
export function organizationsChanged(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: organizationKeys.all });
  void queryClient.invalidateQueries({ queryKey: organizationKeys.mine });
  walksChanged(queryClient);
}

// ---- Writing

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOrganizationRequest) =>
      unwrap(api.POST('/api/v1/organizations', { body })),
    onSuccess: () => organizationsChanged(queryClient),
  });
}

/** Owner only. An empty string clears `description` or `city` (API semantics). */
export function useUpdateOrganization(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateOrganizationRequest) =>
      unwrap(api.PATCH('/api/v1/organizations/{id}', { params: { path: { id } }, body })),
    onSuccess: () => organizationsChanged(queryClient),
  });
}

/** « Demander à rejoindre ». */
export function useRequestMembership(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/v1/organizations/{id}/memberships', {
          params: { path: { id: organizationId } },
        }),
      ),
    onSuccess: () => organizationsChanged(queryClient),
  });
}

/** Withdraws my request, leaves the organisation, or (staff) removes a member. */
export function useRemoveMembership(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) =>
      unwrap(
        api.DELETE('/api/v1/organizations/{id}/memberships/{membershipId}', {
          params: { path: { id: organizationId, membershipId } },
        }),
      ),
    onSuccess: () => organizationsChanged(queryClient),
  });
}

export function useDecideMembership(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, accept }: { membershipId: string; accept: boolean }) =>
      unwrap(
        api.POST(
          accept
            ? '/api/v1/organizations/{id}/memberships/{membershipId}/accept'
            : '/api/v1/organizations/{id}/memberships/{membershipId}/decline',
          { params: { path: { id: organizationId, membershipId } } },
        ),
      ),
    onSuccess: () => organizationsChanged(queryClient),
  });
}

/** Owner only: promote a member to educator or bring an educator back to member. */
export function useChangeRole(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      membershipId,
      role,
    }: {
      membershipId: string;
      role: Exclude<MembershipRole, 'Owner'>;
    }) =>
      unwrap(
        api.PATCH('/api/v1/organizations/{id}/memberships/{membershipId}', {
          params: { path: { id: organizationId, membershipId } },
          body: { role },
        }),
      ),
    onSuccess: () => organizationsChanged(queryClient),
  });
}
