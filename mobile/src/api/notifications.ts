import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from './client';
import type { DevicePlatform, NotificationPreferences } from './types';

export const preferenceKeys = {
  all: ['me', 'notification-preferences'] as const,
};

export const preferenceNames = ['registrations', 'walkChanges', 'messages', 'reminders'] as const;
export type PreferenceName = (typeof preferenceNames)[number];

export function useNotificationPreferences() {
  return useQuery({
    queryKey: preferenceKeys.all,
    queryFn: () => unwrap(api.GET('/api/v1/me/notification-preferences')),
  });
}

const PREFERENCES_MUTATION = ['me', 'notification-preferences', 'save'] as const;

/**
 * Saves a change to the preferences (the API wants all four, so the body is
 * the values in the cache plus the change). The switch changes at once; a
 * failure puts the previous values back and the caller shows the error.
 *
 * Two quick toggles must not reach the server out of order, or the older one
 * would win: the saves share a `scope`, so they run one after the other, and
 * each one sends the values as they are when its turn comes (the second
 * includes the first change, even when both happened within one frame). While
 * another save is waiting, a finished one leaves the screen alone: the newer
 * optimistic values stay, and the last answer is the one that is written.
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  const othersPending = () => queryClient.isMutating({ mutationKey: PREFERENCES_MUTATION }) > 1;
  return useMutation({
    mutationKey: PREFERENCES_MUTATION,
    scope: { id: 'notification-preferences' },
    mutationFn: (change: Partial<NotificationPreferences>) => {
      const current = queryClient.getQueryData<NotificationPreferences>(preferenceKeys.all);
      return unwrap(
        api.PUT('/api/v1/me/notification-preferences', {
          body: { ...current, ...change } as NotificationPreferences,
        }),
      );
    },
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: preferenceKeys.all });
      const previous = queryClient.getQueryData<NotificationPreferences>(preferenceKeys.all);
      if (previous) queryClient.setQueryData(preferenceKeys.all, { ...previous, ...change });
      return { previous };
    },
    onError: (_error, _next, context) => {
      // A later save, still waiting, carries every value: it will set things right.
      if (context?.previous && !othersPending()) {
        queryClient.setQueryData(preferenceKeys.all, context.previous);
      }
    },
    onSuccess: (saved) => {
      if (!othersPending()) queryClient.setQueryData(preferenceKeys.all, saved);
    },
  });
}

/** `PUT /me/devices`: the Expo push token of this device, for the signed-in user. */
export function putDevice(expoPushToken: string, platform: DevicePlatform) {
  return unwrap(api.PUT('/api/v1/me/devices', { body: { expoPushToken, platform } }));
}

/** `DELETE /me/devices/{token}` (the client URL-encodes the token). */
export async function deleteDevice(token: string) {
  const { response } = await api.DELETE('/api/v1/me/devices/{token}', {
    params: { path: { token } },
  });
  return response;
}
