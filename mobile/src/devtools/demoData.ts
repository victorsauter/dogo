import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';
import type { components } from '@/api/schema';

type Schemas = components['schemas'];

export type DemoDataStatus = Schemas['DemoDataStatusResponse'];
export type DemoDataGeneration = Schemas['DemoDataGenerationResponse'];
export type DemoAccount = Schemas['DemoAccountResponse'];

export const demoDataKeys = {
  status: ['dev', 'demo-data'] as const,
};

/** `GET /dev/demo-data`: whether demo data exists, its counts and the accounts. 404 when disabled on the API. */
export function useDemoData() {
  return useQuery({
    queryKey: demoDataKeys.status,
    queryFn: () => unwrap(api.GET('/api/v1/dev/demo-data')),
    retry: false,
  });
}

/** `POST /dev/demo-data`: replaces the demo data (with photos, it can take up to a minute). */
export function useGenerateDemoData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photos: boolean) =>
      unwrap(api.POST('/api/v1/dev/demo-data', { body: { photos } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: demoDataKeys.status }),
  });
}

/** `DELETE /dev/demo-data`: removes the demo accounts and everything they own. */
export function useDeleteDemoData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE('/api/v1/dev/demo-data')),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: demoDataKeys.status }),
  });
}

/** Lower case, without accents: « Léonie » matches « leonie ». */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR');
}

/** Search on the name, the dogs and the organisation; every word must match. */
export function matchesDemoAccount(account: DemoAccount, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const haystack = fold(
    [account.displayName, account.organizationName ?? '', ...account.dogNames].join(' '),
  );
  return words.every((word) => haystack.includes(word));
}
