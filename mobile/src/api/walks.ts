import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { endOfDay } from '@/lib/dates';
import { MAX_SEARCH_RADIUS_KM, radiusForRegion, roundCoordinate, type MapRegion } from '@/lib/geo';

import { api, unwrap } from './client';
import type { DogSize, MyWalksPeriod, MyWalksRole } from './enums';
import type { CreateWalkRequest, GeoPoint, UpdateWalkRequest, WalkDetail } from './types';

export const walkKeys = {
  all: ['walks'] as const,
  search: (params: WalkSearchParams) => ['walks', 'search', params] as const,
  detail: (id: string) => ['walks', id] as const,
  mine: (role: MyWalksRole, when: MyWalksPeriod) => ['me', 'walks', role, when] as const,
};

// ---- Search

export type PeriodFilter = 'today' | 'week' | 'all';
export type SizeFilter = DogSize | 'all';

export interface WalkFilters {
  period: PeriodFilter;
  size: SizeFilter;
}

export const defaultWalkFilters: WalkFilters = { period: 'week', size: 'all' };

/** Query of `GET /walks`. */
export interface WalkSearchParams {
  lat: number;
  lng: number;
  radiusKm: number;
  to?: string;
  size?: DogSize;
  limit: number;
}

/** Results shown at once on the map and the list (the API maximum). */
export const SEARCH_LIMIT = 100;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Search parameters for the visible map area and the filters: centre of the
 * region, radius covering it (capped to the API maximum), end of the period
 * (the API starts at « now » by itself) and dog size.
 */
export function searchParamsFor(
  region: MapRegion,
  filters: WalkFilters,
  now: Date = new Date(),
): WalkSearchParams {
  return searchParamsAround(region, radiusForRegion(region), filters, now);
}

/** Radius choices of the list-first layout (« autour de moi »), in km. */
export const SEARCH_RADII_KM = [5, 10, 25] as const;
export type SearchRadiusKm = (typeof SEARCH_RADII_KM)[number];
export const DEFAULT_SEARCH_RADIUS_KM: SearchRadiusKm = 10;

/** Search parameters for a circle around a point (the user, or the default centre). */
export function searchParamsAround(
  center: GeoPoint,
  radiusKm: number,
  filters: WalkFilters,
  now: Date = new Date(),
): WalkSearchParams {
  const params: WalkSearchParams = {
    lat: roundCoordinate(center.latitude),
    lng: roundCoordinate(center.longitude),
    radiusKm: Math.min(MAX_SEARCH_RADIUS_KM, radiusKm),
    limit: SEARCH_LIMIT,
  };
  if (filters.period === 'today') params.to = endOfDay(now).toISOString();
  // Rounded to the minute so the query key does not change on every render.
  if (filters.period === 'week') {
    params.to = new Date(Math.ceil((now.getTime() + WEEK_MS) / 60_000) * 60_000).toISOString();
  }
  if (filters.size !== 'all') params.size = filters.size;
  return params;
}

/** Nearby walks. Keeps the previous results while a new area loads (no flicker). */
export function useWalkSearch(params: WalkSearchParams | null) {
  return useQuery({
    queryKey: params ? walkKeys.search(params) : ['walks', 'search', 'idle'],
    queryFn: () => unwrap(api.GET('/api/v1/walks', { params: { query: params! } })),
    enabled: params !== null,
    placeholderData: keepPreviousData,
  });
}

// ---- Detail and my walks

export function useWalk(id: string) {
  return useQuery({
    queryKey: walkKeys.detail(id),
    queryFn: () => unwrap(api.GET('/api/v1/walks/{id}', { params: { path: { id } } })),
  });
}

export function useMyWalks(role: MyWalksRole, when: MyWalksPeriod) {
  return useQuery({
    queryKey: walkKeys.mine(role, when),
    queryFn: () => unwrap(api.GET('/api/v1/me/walks', { params: { query: { role, when } } })),
  });
}

/**
 * Keeps every view of walks consistent after a change: the detail (set from
 * the response when there is one), the search results and « Mes balades ».
 */
export async function walksChanged(queryClient: QueryClient, detail?: WalkDetail) {
  if (detail) queryClient.setQueryData(walkKeys.detail(detail.id), detail);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: walkKeys.all }),
    queryClient.invalidateQueries({ queryKey: ['me', 'walks'] }),
  ]);
}

// ---- Organizer: create, edit, cancel

export function useCreateWalk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWalkRequest) => unwrap(api.POST('/api/v1/walks', { body })),
    onSuccess: (detail) => walksChanged(queryClient, detail),
  });
}

export function useUpdateWalk(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateWalkRequest) =>
      unwrap(api.PATCH('/api/v1/walks/{id}', { params: { path: { id } }, body })),
    onSuccess: (detail) => walksChanged(queryClient, detail),
  });
}

export function useCancelWalk(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/walks/{id}/cancel', { params: { path: { id } } })),
    onSuccess: (detail) => walksChanged(queryClient, detail),
  });
}

/** The organizer stops the weekly series: this walk stays, no further one is created. */
export function useStopSeries(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/v1/walks/{id}/stop-series', { params: { path: { id } } })),
    onSuccess: (detail) => walksChanged(queryClient, detail),
  });
}

// ---- Registrations

export function useRegisterDogs(walkId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dogIds: string[]) =>
      unwrap(
        api.POST('/api/v1/walks/{id}/registrations', {
          params: { path: { id: walkId } },
          body: { dogIds },
        }),
      ),
    onSuccess: () => walksChanged(queryClient),
  });
}

/** The owner cancels a registration (frees the place). */
export function useCancelRegistration(walkId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registrationId: string) =>
      unwrap(
        api.DELETE('/api/v1/walks/{id}/registrations/{registrationId}', {
          params: { path: { id: walkId, registrationId } },
        }),
      ),
    onSuccess: () => walksChanged(queryClient),
  });
}

/** The organizer accepts a pending request. */
export function useAcceptRegistration(walkId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registrationId: string) =>
      unwrap(
        api.POST('/api/v1/walks/{id}/registrations/{registrationId}/accept', {
          params: { path: { id: walkId, registrationId } },
        }),
      ),
    onSuccess: () => walksChanged(queryClient),
  });
}

/** The organizer declines a request or removes a participant (both become `Declined`). */
export function useDeclineRegistration(walkId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registrationId: string) =>
      unwrap(
        api.POST('/api/v1/walks/{id}/registrations/{registrationId}/decline', {
          params: { path: { id: walkId, registrationId } },
        }),
      ),
    onSuccess: () => walksChanged(queryClient),
  });
}
