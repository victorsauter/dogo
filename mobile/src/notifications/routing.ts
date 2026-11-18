import type { Href } from 'expo-router';

/** Types of notification the API sends (api/README.md, « Notifications »). */
export const notificationTypes = [
  'registration_created',
  'registration_requested',
  'registration_accepted',
  'registration_declined',
  'walk_updated',
  'walk_cancelled',
  'message_posted',
  'walk_reminder',
  'series_walk_created',
] as const;

export type NotificationType = (typeof notificationTypes)[number];

/** The only link a notification may carry: `dogo://walks/<id>`. */
const WALK_URL = /^dogo:\/\/walks\/([A-Za-z0-9-]{1,64})\/?$/;

export interface NotificationTarget {
  walkId: string;
  type: NotificationType | null;
  href: Href;
}

/**
 * Where tapping a notification leads, or `null` to ignore it. Only links that
 * match the app's own walk route are followed (anything else, other schemes
 * and hosts included, is dropped); a `message_posted` opens the thread, every
 * other type the walk detail.
 */
export function targetForNotification(data: unknown): NotificationTarget | null {
  if (typeof data !== 'object' || data === null) return null;
  const { url, type, walkId } = data as Record<string, unknown>;
  if (typeof url !== 'string') return null;
  const id = WALK_URL.exec(url.trim())?.[1];
  if (!id) return null;
  if (walkId !== undefined && walkId !== id) return null;
  const known = notificationTypes.find((value) => value === type) ?? null;
  const href: Href =
    known === 'message_posted'
      ? { pathname: '/walks/[id]/messages', params: { id } }
      : { pathname: '/walks/[id]', params: { id } };
  return { walkId: id, type: known, href };
}
