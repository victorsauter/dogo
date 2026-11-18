import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useSession } from '@/auth';

import { api, unwrap } from './client';
import { photoForm, type PickedPhoto } from './photoUpload';
import type { SessionUser } from './types';

export const queryKeys = {
  me: ['me'] as const,
  myDogs: ['me', 'dogs'] as const,
  user: (id: string) => ['users', id] as const,
  dog: (id: string) => ['dogs', id] as const,
};

/** The signed-in user's profile (`GET /me`). */
export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => unwrap(api.GET('/api/v1/me')) });
}

/** Public profile and dogs of any user (`GET /users/{id}`). */
export function usePublicUser(id: string) {
  return useQuery({
    queryKey: queryKeys.user(id),
    queryFn: () => unwrap(api.GET('/api/v1/users/{id}', { params: { path: { id } } })),
  });
}

/** Makes every view of my profile current: cache, session, public profiles. */
function useProfileUpdated() {
  const queryClient = useQueryClient();
  const { updateUser } = useSession();
  return async (user: SessionUser) => {
    queryClient.setQueryData(queryKeys.me, user);
    await updateUser(user);
    await queryClient.invalidateQueries({ queryKey: ['users'] });
  };
}

export interface UpdateProfileInput {
  displayName: string;
  /** An empty string clears the bio (API semantics). */
  bio: string;
}

export function useUpdateProfile() {
  const onUpdated = useProfileUpdated();
  return useMutation({
    mutationFn: (body: UpdateProfileInput) => unwrap(api.PATCH('/api/v1/me', { body })),
    onSuccess: onUpdated,
  });
}

export function useUploadMyPhoto() {
  const onUpdated = useProfileUpdated();
  return useMutation({
    mutationFn: (photo: PickedPhoto) =>
      unwrap(api.PUT('/api/v1/me/photo', { body: {}, bodySerializer: () => photoForm(photo) })),
    onSuccess: onUpdated,
  });
}

/** Refreshes everything that shows a dog: my list, its detail, public profiles. */
export function invalidateDogs(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.myDogs }),
    queryClient.invalidateQueries({ queryKey: ['dogs'] }),
    queryClient.invalidateQueries({ queryKey: ['users'] }),
  ]);
}
