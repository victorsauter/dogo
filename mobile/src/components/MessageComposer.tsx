import { useRef, useState } from 'react';
import { TextInput, View, type TextInputInstance } from 'react-native';

import { MESSAGE_MAX_LENGTH } from '@/api/messages';
import { format, t } from '@/strings';
import { useTheme } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

/** The counter only shows when the limit gets close. */
const COUNTER_FROM = MESSAGE_MAX_LENGTH - 200;

export interface MessageComposerProps {
  /** Receives the trimmed text; the field empties at once (the message shows as « Envoi… »). */
  onSend: (text: string) => void;
}

/** Text field and « Envoyer » button of the thread, limited to 1 000 characters. */
export function MessageComposer({ onSend }: MessageComposerProps) {
  const { colors, radii, spacing, typography, minTouchSize } = useTheme();
  const [text, setText] = useState('');
  const inputRef = useRef<TextInputInstance>(null);
  const canSend = text.trim().length > 0;

  function send() {
    if (!canSend) return;
    onSend(text.trim());
    // `clear()` also drops text still being composed (autocorrect), which `setText('')` can miss on iOS.
    inputRef.current?.clear();
    setText('');
  }

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.surface,
        padding: spacing.md,
        gap: spacing.xs,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        <TextInput
          ref={inputRef}
          accessibilityLabel={t.thread.composerLabel}
          placeholder={t.thread.placeholder}
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          maxLength={MESSAGE_MAX_LENGTH}
          multiline
          style={[
            typography.body,
            {
              flex: 1,
              minHeight: minTouchSize,
              maxHeight: 120,
              color: colors.text,
              backgroundColor: colors.background,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: radii.md,
              paddingHorizontal: spacing.md,
              paddingTop: spacing.md,
              paddingBottom: spacing.md,
            },
          ]}
        />
        <Button label={t.thread.send} disabled={!canSend} onPress={send} />
      </View>
      {text.length >= COUNTER_FROM ? (
        <Text variant="caption" color="textMuted" align="right" accessibilityLiveRegion="polite">
          {format(t.thread.counter, { count: text.length, max: MESSAGE_MAX_LENGTH })}
        </Text>
      ) : null}
    </View>
  );
}
