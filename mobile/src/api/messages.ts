import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { api, unwrap } from './client';
import { errorMessage } from './errors';
import type { Message, MessagePage } from './types';

/** Messages loaded at once (the API default). */
export const MESSAGES_PAGE_SIZE = 50;
/** No realtime (ADR 0008): the open thread is refetched this often. */
export const MESSAGES_POLL_MS = 15_000;
/** The API refuses a message longer than this once trimmed. */
export const MESSAGE_MAX_LENGTH = 1000;

/** Under the walk key, so a change of the walk (`walksChanged`) refreshes its thread too. */
export const messageKeys = {
  thread: (walkId: string) => ['walks', walkId, 'messages'] as const,
};

function fetchMessages(walkId: string, before?: string): Promise<MessagePage> {
  return unwrap(
    api.GET('/api/v1/walks/{id}/messages', {
      params: { path: { id: walkId }, query: { limit: MESSAGES_PAGE_SIZE, before } },
    }),
  );
}

/** Messages in order, oldest first, each id once (a later copy replaces an earlier one). */
export function mergeMessages(...lists: Message[][]): Message[] {
  const byId = new Map<string, Message>();
  for (const list of lists) for (const message of list) byId.set(message.id, message);
  return [...byId.values()];
}

/**
 * The thread of a walk: the latest page (refetched on focus, on pull to refresh
 * and by polling while `active`), plus older pages loaded on demand with
 * `before=<id of the oldest message shown>`.
 */
export function useWalkMessages(walkId: string, active: boolean) {
  const [older, setOlder] = useState<{ items: Message[]; hasMore: boolean } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);

  const latest = useQuery({
    queryKey: messageKeys.thread(walkId),
    queryFn: () => fetchMessages(walkId),
    refetchInterval: active ? MESSAGES_POLL_MS : false,
  });

  const items = mergeMessages(older?.items ?? [], latest.data?.items ?? []);
  const hasMore = older ? older.hasMore : (latest.data?.hasMore ?? false);

  const loadOlder = useCallback(async () => {
    const first = items[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const page = await fetchMessages(walkId, first.id);
      setOlder((current) => ({
        items: mergeMessages(page.items, current?.items ?? []),
        hasMore: page.hasMore,
      }));
    } catch (error) {
      setOlderError(errorMessage(error));
    } finally {
      setLoadingOlder(false);
    }
    // `items[0]` identifies the cursor; the list itself changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkId, items[0]?.id, loadingOlder]);

  return { latest, items, hasMore, loadOlder, loadingOlder, olderError };
}

/** A message being sent, or whose sending failed. */
export interface PendingMessage {
  localId: string;
  text: string;
  status: 'sending' | 'failed';
  error?: string;
}

function addToThread(queryClient: QueryClient, walkId: string, message: Message) {
  queryClient.setQueryData<MessagePage>(messageKeys.thread(walkId), (page) => ({
    hasMore: page?.hasMore ?? false,
    items: mergeMessages(page?.items ?? [], [message]),
  }));
}

/**
 * Optimistic sending: the text shows at once as `sending`, becomes a real
 * message when the API answers, or `failed` (with the reason) until retried or discarded.
 */
export function useSendMessage(walkId: string) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const counter = useRef(0);

  const update = (localId: string, patch: Partial<PendingMessage> | null) =>
    setPending((list) =>
      patch
        ? list.map((item) => (item.localId === localId ? { ...item, ...patch } : item))
        : list.filter((item) => item.localId !== localId),
    );

  const post = useCallback(
    async (localId: string, text: string) => {
      try {
        const message = await unwrap(
          api.POST('/api/v1/walks/{id}/messages', {
            params: { path: { id: walkId } },
            body: { text },
          }),
        );
        addToThread(queryClient, walkId, message);
        setPending((list) => list.filter((item) => item.localId !== localId));
      } catch (error) {
        setPending((list) =>
          list.map((item) =>
            item.localId === localId
              ? { ...item, status: 'failed', error: errorMessage(error) }
              : item,
          ),
        );
      }
    },
    [queryClient, walkId],
  );

  const send = useCallback(
    (rawText: string) => {
      const text = rawText.trim();
      if (!text || text.length > MESSAGE_MAX_LENGTH) return;
      counter.current += 1;
      const localId = `local-${counter.current}`;
      setPending((list) => [...list, { localId, text, status: 'sending' }]);
      void post(localId, text);
    },
    [post],
  );

  const retry = useCallback(
    (localId: string) => {
      const item = pending.find((p) => p.localId === localId);
      if (!item) return;
      update(localId, { status: 'sending', error: undefined });
      void post(localId, item.text);
    },
    [pending, post],
  );

  const discard = useCallback((localId: string) => update(localId, null), []);

  return { pending, send, retry, discard };
}
