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

/**
 * Saves the four preferences (all required by the API). The switch changes at
 * once; a failure puts the previous values back and the caller shows the error.
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: NotificationPreferences) =>
      unwrap(api.PUT('/api/v1/me/notification-preferences', { body })),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: preferenceKeys.all });
      const previous = queryClient.getQueryData<NotificationPreferences>(preferenceKeys.all);
      queryClient.setQueryData(preferenceKeys.all, next);
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous) queryClient.setQueryData(preferenceKeys.all, context.previous);
    },
    onSuccess: (saved) => queryClient.setQueryData(preferenceKeys.all, saved),
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
