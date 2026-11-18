import { useMutation } from '@tanstack/react-query';

import { api, unwrap } from './client';

/**
 * `DELETE /me` (spec §4.8, ADR 0023). The server removes devices and tokens in
 * the same transaction: the caller only forgets the local session afterwards,
 * without calling logout or removing the device.
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => unwrap(api.DELETE('/api/v1/me')),
  });
}
