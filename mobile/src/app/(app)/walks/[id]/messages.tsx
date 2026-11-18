import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { ApiError } from '@/api/errors';
import { useSendMessage, useWalkMessages } from '@/api/messages';
import type { WalkDetail } from '@/api/types';
import { useWalk } from '@/api/walks';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  MessageBubble,
  MessageComposer,
  PendingBubble,
  Screen,
  Text,
} from '@/components';
import { canUseThread, withDayHeaders, type ThreadRow } from '@/lib/thread';
import { t } from '@/strings';
import { useTheme } from '@/theme';

/** The thread of a walk: messages by day, composer above the keyboard. */
export default function WalkThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const walk = useWalk(id);

  if (walk.isPending) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }
  if (walk.isError) {
    return (
      <Screen scroll={false}>
        <ErrorState error={walk.error} onRetry={() => walk.refetch()} />
      </Screen>
    );
  }
  if (!canUseThread(walk.data)) {
    return (
      <Screen scroll={false}>
        <Stack.Screen options={{ title: t.thread.title }} />
        <EmptyState title={t.thread.title} message={t.thread.hiddenReason} icon="info" />
      </Screen>
    );
  }
  return <Thread walk={walk.data} />;
}

function Thread({ walk }: { walk: WalkDetail }) {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const [focused, setFocused] = useState(false);
  const { latest, items, hasMore, loadOlder, loadingOlder, olderError } = useWalkMessages(
    walk.id,
    focused,
  );
  const { pending, send, retry, discard } = useSendMessage(walk.id);
  const listRef = useRef<FlatList<ThreadRow>>(null);
  const stickToBottom = useRef(true);
  const cancelled = walk.status === 'Cancelled';

  // Refetch when the screen gets focus; poll only while it is focused.
  const { refetch } = latest;
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void refetch();
      return () => setFocused(false);
    }, [refetch]),
  );

  const rows = useMemo(() => {
    const list = withDayHeaders(items);
    for (const item of pending)
      list.push({ kind: 'pending', key: item.localId, localId: item.localId });
    return list;
  }, [items, pending]);

  const openAuthor = (userId: string) =>
    router.push({ pathname: '/users/[id]', params: { id: userId } });

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    stickToBottom.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 80;
  }

  let body;
  if (latest.isPending) body = <LoadingState />;
  else if (latest.isError) {
    const forbidden = latest.error instanceof ApiError && latest.error.code === 'message.forbidden';
    body = forbidden ? (
      <EmptyState title={t.thread.title} message={t.thread.hiddenReason} icon="info" />
    ) : (
      <ErrorState error={latest.error} onRetry={() => latest.refetch()} />
    );
  } else {
    body = (
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
        onScroll={onScroll}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (stickToBottom.current) listRef.current?.scrollToEnd({ animated: false });
        }}
        refreshControl={
          <RefreshControl
            refreshing={latest.isRefetching && !latest.isPending}
            onRefresh={() => void latest.refetch()}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          hasMore ? (
            <View style={{ gap: spacing.xs, paddingBottom: spacing.md }}>
              <Button
                label={t.thread.loadOlder}
                variant="secondary"
                loading={loadingOlder}
                onPress={() => {
                  stickToBottom.current = false;
                  void loadOlder();
                }}
              />
              {olderError ? (
                <Text variant="caption" color="danger" align="center">
                  {olderError}
                </Text>
              ) : null}
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          <EmptyState title={t.thread.emptyTitle} message={t.thread.emptyMessage} icon="paw" />
        }
        renderItem={({ item }) => {
          if (item.kind === 'day') {
            return (
              <Text variant="caption" color="textMuted" align="center" accessibilityRole="header">
                {item.label}
              </Text>
            );
          }
          if (item.kind === 'message') {
            return <MessageBubble message={item.message} onOpenAuthor={openAuthor} />;
          }
          const entry = pending.find((p) => p.localId === item.localId);
          return entry ? (
            <PendingBubble
              pending={entry}
              onRetry={() => retry(entry.localId)}
              onDiscard={() => discard(entry.localId)}
            />
          ) : null;
        }}
      />
    );
  }

  return (
    <Screen
      scroll={false}
      edges={['left', 'right', 'bottom']}
      padded={false}
      contentStyle={{ gap: 0 }}
    >
      <Stack.Screen options={{ title: t.thread.title }} />
      <View style={{ flex: 1 }}>{body}</View>
      {cancelled ? (
        <View
          accessibilityRole="alert"
          style={{ backgroundColor: colors.dangerSoft, padding: spacing.md }}
        >
          <Text color="danger" style={{ fontWeight: '600' }}>
            {t.thread.readOnly}
          </Text>
        </View>
      ) : (
        <MessageComposer
          onSend={(text) => {
            stickToBottom.current = true;
            send(text);
          }}
        />
      )}
    </Screen>
  );
}
