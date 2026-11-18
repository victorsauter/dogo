import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from './client';
import { photoForm, type PickedPhoto } from './photoUpload';
import { invalidateDogs, queryKeys } from './profile';
import type { CreateDogRequest, UpdateDogRequest } from './types';
import { walksChanged } from './walks';

export function useMyDogs() {
  return useQuery({
    queryKey: queryKeys.myDogs,
    queryFn: () => unwrap(api.GET('/api/v1/me/dogs')),
  });
}

/** Any dog (`GET /dogs/{id}`). */
export function useDog(id: string) {
  return useQuery({
    queryKey: queryKeys.dog(id),
    queryFn: () => unwrap(api.GET('/api/v1/dogs/{id}', { params: { path: { id } } })),
  });
}

export function useCreateDog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDogRequest) => unwrap(api.POST('/api/v1/dogs', { body })),
    onSuccess: () => invalidateDogs(queryClient),
  });
}

export function useUpdateDog(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateDogRequest) =>
      unwrap(api.PATCH('/api/v1/dogs/{id}', { params: { path: { id } }, body })),
    onSuccess: () => invalidateDogs(queryClient),
  });
}

/** Deleting a dog cancels its upcoming registrations (spec §4.1): walks refresh too. */
export function useDeleteDog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await unwrap(api.DELETE('/api/v1/dogs/{id}', { params: { path: { id } } }));
      return id;
    },
    onSuccess: (id) => {
      queryClient.removeQueries({ queryKey: queryKeys.dog(id) });
      invalidateDogs(queryClient);
      walksChanged(queryClient);
    },
  });
}

export function useUploadDogPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, photo }: { id: string; photo: PickedPhoto }) =>
      unwrap(
        api.PUT('/api/v1/dogs/{id}/photo', {
          params: { path: { id } },
          body: {},
          bodySerializer: () => photoForm(photo),
        }),
      ),
    onSuccess: () => invalidateDogs(queryClient),
  });
}
