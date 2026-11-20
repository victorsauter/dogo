import { useRef, useState } from 'react';
import { View, type ViewInstance } from 'react-native';

import { haptics } from '@/lib/haptics';
import { format, t } from '@/strings';
import { useTheme } from '@/theme';

import { AnchoredMenu, type Anchor } from './AnchoredMenu';
import type { ChoiceOption } from './Chip';
import { Icon } from './Icon';
import { Material } from './Material';
import { NativeMenuView } from './nativeMenu';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export { placeMenu } from './AnchoredMenu';

export interface MenuPillProps<T extends string> {
  /** What is chosen, e.g. « Taille »: the accessible name and the menu's title. */
  label: string;
  /** Text of the pill: the label itself (« Taille ») or the chosen value (« Petit »). */
  text: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Filled look (and bold text) when the choice differs from its default. */
  active?: boolean;
  testID?: string;
}
/**
 * Pill that opens a menu of choices under itself, like a pull-down button of
 * iOS: the system menu on iOS, elsewhere the app's own menu anchored to the
 * pill (it grows from it, without dimming the screen). Choosing an item
 * applies it and closes the menu.
 */
export function MenuPill<T extends string>({
  label,
  text,
  options,
  value,
  onChange,
  active = false,
  testID,
}: MenuPillProps<T>) {
  const { minTouchSize } = useTheme();
  const anchorRef = useRef<ViewInstance>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const chosen = options.find((option) => option.value === value)?.label ?? text;
  const accessibilityLabel = format(t.common.menuPillA11y, { label, value: chosen });

  function choose(next: T) {
    haptics.selection();
    if (next !== value) onChange(next);
  }

  if (NativeMenuView) {
    return (
      <NativeMenuView
        testID={testID}
        title={label}
        actions={options.map((option) => ({
          id: option.value,
          title: option.label,
          state: option.value === value ? 'on' : 'off',
        }))}
        onPressAction={({ nativeEvent }) => choose(nativeEvent.event as T)}
      >
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={{ minHeight: minTouchSize, justifyContent: 'center' }}
        >
          <PillFace text={text} active={active} />
        </View>
      </NativeMenuView>
    );
  }

  return (
    <>
      <PressableScale
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={t.common.menuPillHint}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setAnchor(null);
          setOpen(true);
          anchorRef.current?.measureInWindow((x, y, width, height) =>
            setAnchor({ x, y, width, height }),
          );
        }}
        style={{ minHeight: minTouchSize, justifyContent: 'center' }}
      >
        <View ref={anchorRef} collapsable={false}>
          <PillFace text={text} active={active} />
        </View>
      </PressableScale>
      {open ? (
        <AnchoredMenu
          label={label}
          anchor={anchor}
          options={options}
          value={value}
          onChoose={choose}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * The visible pill, a capsule of the floating material: its text and a small
 * chevron. Active, it is tinted with the primary colour and its text is bold.
 */
function PillFace({ text, active }: { text: string; active: boolean }) {
  const { colors, spacing, controlHeight } = useTheme();
  return (
    <Material
      tinted={active}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        minHeight: controlHeight,
        paddingLeft: spacing.lg,
        paddingRight: spacing.md + 2,
        borderRadius: controlHeight / 2,
      }}
    >
      <Text
        variant="label"
        numberOfLines={1}
        style={{
          color: active ? colors.onPrimary : colors.text,
          fontWeight: active ? '700' : '500',
        }}
      >
        {text}
      </Text>
      <Icon name="chevronDown" size={11} color={active ? 'onPrimary' : 'textMuted'} />
    </Material>
  );
}
