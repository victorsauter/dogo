import { useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

import { organizationsChanged } from '@/api/organizations';
import { walksChanged } from '@/api/walks';
import { useSession } from '@/auth';

import { devLog, loadNotifications } from './native';
import { registerDevice } from './registration';
import { targetForNotification } from './routing';

/**
 * App-wide notification behaviour, mounted once under the providers; renders
 * nothing and does nothing when push is unavailable:
 * - registers the device after sign-in and at app start (permission granted);
 * - shows notifications received in the foreground and refreshes the walks;
 * - opens the right screen when a notification is tapped, whether the app was
 *   running, in the background or closed (a tap before sign-in waits for it).
 */
export function NotificationsEffects() {
  const { status } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const signedIn = status === 'signedIn';
  const signedInRef = useRef(signedIn);
  const waiting = useRef<Href | null>(null);

  useEffect(() => {
    signedInRef.current = signedIn;
  }, [signedIn]);

  useEffect(() => {
    if (signedIn) void registerDevice();
  }, [signedIn]);

  // A tap that arrived before the session was ready opens once it is.
  useEffect(() => {
    if (!signedIn || !waiting.current) return;
    const href = waiting.current;
    waiting.current = null;
    const timer = setTimeout(() => router.push(href), 0);
    return () => clearTimeout(timer);
  }, [signedIn, router]);

  useEffect(() => {
    const notifications = loadNotifications();
    if (!notifications) return;
    try {
      notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });

      const open = (data: unknown) => {
        const target = targetForNotification(data);
        if (!target) return;
        if (signedInRef.current) router.push(target.href);
        else waiting.current = target.href;
      };

      const received = notifications.addNotificationReceivedListener((notification) => {
        // Whatever the notification says, the affected walks and organisations are stale: refetch them.
        if (signedInRef.current) {
          void walksChanged(queryClient);
          void organizationsChanged(queryClient);
        }
        devLog('received', notification.request.content.data);
      });
      const tapped = notifications.addNotificationResponseReceivedListener((response) => {
        open(response.notification.request.content.data);
        notifications.clearLastNotificationResponse();
      });

      const last = notifications.getLastNotificationResponse();
      if (last) {
        open(last.notification.request.content.data);
        notifications.clearLastNotificationResponse();
      }
      return () => {
        received.remove();
        tapped.remove();
      };
    } catch (error) {
      devLog('cannot listen to notifications', error);
    }
  }, [router, queryClient]);

  return null;
}
