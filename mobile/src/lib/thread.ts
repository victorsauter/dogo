import type { Message, WalkDetail } from '@/api/types';

import { formatDay } from './dates';

/** Only the organizer and the owners of an accepted dog read and write (spec §4.4). */
export function canUseThread(walk: WalkDetail): boolean {
  return walk.isOrganizer || walk.myRegistrations.some((r) => r.status === 'Accepted');
}

export type ThreadRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'message'; key: string; message: Message }
  | { kind: 'pending'; key: string; localId: string };

const dayKey = (iso: string) => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

/** Messages (oldest first) with a day header before each new day. */
export function withDayHeaders(messages: Message[], now: Date = new Date()): ThreadRow[] {
  const rows: ThreadRow[] = [];
  let previous: string | null = null;
  for (const message of messages) {
    const key = dayKey(message.createdAt);
    if (key !== previous) {
      rows.push({ kind: 'day', key: `day-${key}`, label: formatDay(message.createdAt, now) });
      previous = key;
    }
    rows.push({ kind: 'message', key: message.id, message });
  }
  return rows;
}
