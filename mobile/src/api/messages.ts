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

/**
 * Messages in order, oldest first (by creation time, a tie keeping the order
 * given), each id once: a later copy replaces an earlier one.
 */
export function mergeMessages(...lists: Message[][]): Message[] {
  const byId = new Map<string, Message>();
  for (const list of lists) for (const message of list) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** Pages read to close a hole when more than a page of messages arrived between two polls. */
const MAX_GAP_PAGES = 20;

/**
 * Reads the latest page and folds it into what the cache already holds, so no
 * message received is ever dropped: the cached thread is cumulative (the older
 * pages loaded by hand, the messages sent from here). When more than one page
 * of new messages came in since the last read, the newest page no longer
 * touches the cached ones: the messages in between are read back, newest first,
 * until they meet. The cache is read again once the network answered, so a
 * page loaded or a message sent meanwhile is merged too, not overwritten.
 */
async function fetchThread(queryClient: QueryClient, walkId: string): Promise<MessagePage> {
  const key = messageKeys.thread(walkId);
  let page = await fetchMessages(walkId);
  let fresh = page.items;
  const known = new Set((queryClient.getQueryData<MessagePage>(key)?.items ?? []).map((m) => m.id));
  let guard = 0;
  while (
    known.size > 0 &&
    page.hasMore &&
    page.items.length > 0 &&
    !page.items.some((message) => known.has(message.id)) &&
    guard < MAX_GAP_PAGES
  ) {
    guard += 1;
    page = await fetchMessages(walkId, page.items[0]!.id);
    fresh = [...page.items, ...fresh];
  }
  const cached = queryClient.getQueryData<MessagePage>(key);
  if (!cached || cached.items.length === 0)
    return { items: mergeMessages(fresh), hasMore: page.hasMore };
  // The older end is the cache's: its `hasMore` says whether messages precede the first one.
  return { items: mergeMessages(cached.items, fresh), hasMore: cached.hasMore };
}

/**
 * The thread of a walk: the latest page (refetched on focus, on pull to refresh
 * and by polling while `active`) merged into the messages already received,
 * plus older pages loaded on demand with `before=<id of the oldest message shown>`.
 * `latest.data` is the whole cumulative thread.
 */
export function useWalkMessages(walkId: string, active: boolean) {
  const queryClient = useQueryClient();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);

  const latest = useQuery({
    queryKey: messageKeys.thread(walkId),
    queryFn: () => fetchThread(queryClient, walkId),
    refetchInterval: active ? MESSAGES_POLL_MS : false,
  });

  const items = latest.data?.items ?? [];
  const hasMore = latest.data?.hasMore ?? false;
  const cursor = items[0]?.id;

  const loadOlder = useCallback(async () => {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const page = await fetchMessages(walkId, cursor);
      queryClient.setQueryData<MessagePage>(messageKeys.thread(walkId), (current) =>
        current
          ? { items: mergeMessages(page.items, current.items), hasMore: page.hasMore }
          : current,
      );
    } catch (error) {
      setOlderError(errorMessage(error));
    } finally {
      setLoadingOlder(false);
    }
  }, [queryClient, walkId, cursor, loadingOlder]);

  return { latest, items, hasMore, loadOlder, loadingOlder, olderError };
}

/** A message being sent, or whose sending failed. */
export interface PendingMessage {
  localId: string;
  text: string;
  status: 'sending' | 'failed';
  error?: string;
}

/**
 * Puts the message the API returned into the thread. Requests in flight are
 * cancelled first: one that left before the answer would otherwise come back
 * without the message and replace it.
 */
async function addToThread(queryClient: QueryClient, walkId: string, message: Message) {
  const key = messageKeys.thread(walkId);
  await queryClient.cancelQueries({ queryKey: key });
  const known = queryClient.getQueryData<MessagePage>(key) !== undefined;
  queryClient.setQueryData<MessagePage>(key, (page) => ({
    hasMore: page?.hasMore ?? false,
    items: mergeMessages(page?.items ?? [], [message]),
  }));
  // Nothing was loaded yet (the thread was still opening): read the rest.
  if (!known) void queryClient.invalidateQueries({ queryKey: key });
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
        await addToThread(queryClient, walkId, message);
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
