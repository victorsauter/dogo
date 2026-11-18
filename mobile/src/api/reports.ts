import { useMutation } from '@tanstack/react-query';

import { api, unwrap } from './client';
import type { CreateReportRequest } from './types';

/** `POST /reports`: private, read only by the administrators. */
export function useCreateReport() {
  return useMutation({
    mutationFn: (body: CreateReportRequest) => unwrap(api.POST('/api/v1/reports', { body })),
  });
}
