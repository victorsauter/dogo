import { Pressable, View } from 'react-native';

import type { PendingMessage } from '@/api/messages';
import type { Message } from '@/api/types';
import { formatTime } from '@/lib/dates';
import { format, t } from '@/strings';
import { useTheme } from '@/theme';

import { Avatar } from './Avatar';
import { Button } from './Button';
import { Text } from './Text';

const AVATAR_SIZE = 32;

export interface MessageBubbleProps {
  message: Message;
  /** Opens the profile of the author (never called for a deleted account). */
  onOpenAuthor: (userId: string) => void;
}

/**
 * A message of the thread. Mine are on the right, in the primary colour; the
 * others on the left with their author's avatar and name, which open the profile.
 */
export function MessageBubble({ message, onOpenAuthor }: MessageBubbleProps) {
  const { colors, radii, spacing } = useTheme();
  const { author } = message;
  const name = author?.displayName ?? t.thread.deletedAccount;
  const time = formatTime(message.createdAt);

  const bubble = (
    <View
      style={{
        backgroundColor: message.isMine ? colors.primary : colors.surface,
        borderColor: message.isMine ? colors.primary : colors.border,
        borderWidth: 1,
        borderRadius: radii.lg,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: 2,
        flexShrink: 1,
      }}
    >
      <Text color={message.isMine ? 'onPrimary' : 'text'} selectable>
        {message.text}
      </Text>
      <Text
        variant="caption"
        color={message.isMine ? 'onPrimary' : 'textMuted'}
        align={message.isMine ? 'right' : 'left'}
      >
        {time}
      </Text>
    </View>
  );

  if (message.isMine) {
    return (
      <View
        accessible
        accessibilityLabel={`${t.thread.mine}, ${format(t.thread.sentAt, { time })} : ${message.text}`}
        style={{ alignItems: 'flex-end', paddingLeft: spacing.xxl * 2 }}
      >
        {bubble}
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.xxl * 2 }}>
      <Pressable
        disabled={!author}
        onPress={() => author && onOpenAuthor(author.id)}
        accessibilityRole={author ? 'link' : undefined}
        accessibilityLabel={author ? format(t.thread.authorA11y, { name }) : name}
      >
        <Avatar name={author?.displayName ?? ''} photoUrl={author?.photoUrl} size={AVATAR_SIZE} />
      </Pressable>
      <View style={{ gap: 2, flexShrink: 1 }}>
        <Pressable
          disabled={!author}
          onPress={() => author && onOpenAuthor(author.id)}
          accessibilityRole={author ? 'link' : undefined}
          accessibilityLabel={author ? format(t.thread.authorA11y, { name }) : name}
        >
          <Text
            variant="caption"
            color="textMuted"
            style={{ fontWeight: '600', fontStyle: author ? 'normal' : 'italic' }}
          >
            {name}
          </Text>
        </Pressable>
        {bubble}
      </View>
    </View>
  );
}

export interface PendingBubbleProps {
  pending: PendingMessage;
  onRetry: () => void;
  onDiscard: () => void;
}

/** My message while it is being sent, or after it failed (with « Réessayer » and « Supprimer »). */
export function PendingBubble({ pending, onRetry, onDiscard }: PendingBubbleProps) {
  const { colors, radii, spacing } = useTheme();
  const failed = pending.status === 'failed';
  return (
    <View style={{ alignItems: 'flex-end', gap: spacing.xs, paddingLeft: spacing.xxl * 2 }}>
      <View
        style={{
          backgroundColor: failed ? colors.dangerSoft : colors.primary,
          opacity: failed ? 1 : 0.6,
          borderRadius: radii.lg,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          flexShrink: 1,
        }}
      >
        <Text color={failed ? 'danger' : 'onPrimary'}>{pending.text}</Text>
      </View>
      {failed ? (
        <View accessibilityRole="alert" style={{ alignItems: 'flex-end', gap: spacing.xs }}>
          <Text variant="caption" color="danger">
            {`${t.thread.failed}${pending.error ? ` : ${pending.error}` : ''}`}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label={t.thread.retry} variant="secondary" onPress={onRetry} />
            <Button label={t.thread.discard} variant="secondary" onPress={onDiscard} />
          </View>
        </View>
      ) : (
        <Text variant="caption" color="textMuted">
          {t.thread.sending}
        </Text>
      )}
    </View>
  );
}
