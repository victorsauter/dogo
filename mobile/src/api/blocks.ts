import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from './client';
import { walksChanged } from './walks';

export const blockKeys = {
  mine: ['me', 'blocks'] as const,
};

/** The people I blocked, most recent first (`GET /me/blocks`). */
export function useBlockedUsers() {
  return useQuery({
    queryKey: blockKeys.mine,
    queryFn: () => unwrap(api.GET('/api/v1/me/blocks')),
  });
}

/**
 * A block changes which walks carry the « Participant bloqué » warning, so the
 * walk lists and details are refreshed along with the list of blocks.
 */
function useBlocksChanged() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: blockKeys.mine }),
      walksChanged(queryClient),
    ]);
  };
}

export function useBlockUser() {
  const changed = useBlocksChanged();
  return useMutation({
    mutationFn: (userId: string) => unwrap(api.POST('/api/v1/blocks', { body: { userId } })),
    onSuccess: changed,
  });
}

export function useUnblockUser() {
  const changed = useBlocksChanged();
  return useMutation({
    mutationFn: (userId: string) =>
      unwrap(api.DELETE('/api/v1/blocks/{userId}', { params: { path: { userId } } })),
    onSuccess: changed,
  });
}
