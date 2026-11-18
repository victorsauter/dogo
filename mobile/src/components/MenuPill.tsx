import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '@/lib/haptics';
import { format, t } from '@/strings';
import { useTheme } from '@/theme';

import type { ChoiceOption } from './Chip';
import { Icon } from './Icon';
import { Material } from './Material';
import { NativeMenuView } from './nativeMenu';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

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

/** Width of the app's own menu, like a compact iOS menu. */
const MENU_WIDTH = 224;
/** Scale the menu grows from, at its pill. */
const MENU_START_SCALE = 0.4;

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

/** The visible pill: its text and a small chevron. */
function PillFace({ text, active }: { text: string; active: boolean }) {
  const { colors, radii, spacing, pillHeight } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        minHeight: pillHeight,
        paddingLeft: spacing.md + 2,
        paddingRight: spacing.md,
        borderRadius: radii.pill,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primary : colors.surface,
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
    </View>
  );
}

export interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the app's own menu goes: under the pill, left-aligned with it, moved
 * back inside the screen's margins when it would overflow sideways, and above
 * the pill when there is no room below. `originX` is the pill's centre in the
 * menu, the point it grows from.
 */
export function placeMenu({
  anchor,
  window,
  insets,
  margin,
  gap,
  height,
}: {
  anchor: Anchor;
  window: { width: number; height: number };
  insets: { top: number; bottom: number };
  margin: number;
  gap: number;
  height: number;
}) {
  const width = Math.min(MENU_WIDTH, window.width - margin * 2);
  const left = Math.min(Math.max(anchor.x, margin), window.width - margin - width);
  const below = anchor.y + anchor.height + gap;
  const opensUp = below + height > window.height - insets.bottom - margin;
  const top = opensUp ? Math.max(insets.top, anchor.y - gap - height) : below;
  const originX = Math.min(Math.max(anchor.x + anchor.width / 2 - left, 0), width);
  return { top, left, width, opensUp, originX };
}

/**
 * The app's own menu, in a transparent modal: under the pill (above it when
 * there is no room below), never past the screen's edges. Touching outside
 * closes it, so does the Android back button. Invisible until the pill's
 * position is known (`anchor`), then it grows from the pill.
 */
function AnchoredMenu<T extends string>({
  label,
  anchor,
  options,
  value,
  onChoose,
  onClose,
}: {
  label: string;
  anchor: Anchor | null;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChoose: (value: T) => void;
  onClose: () => void;
}) {
  const { colors, radii, spacing, motion, shadows, minTouchSize } = useTheme();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { top, left, width, opensUp, originX } = placeMenu({
    anchor: anchor ?? { x: spacing.lg, y: insets.top, width: 0, height: 0 },
    window,
    insets,
    margin: spacing.lg,
    gap: spacing.xs,
    height: options.length * minTouchSize,
  });
  const height = options.length * minTouchSize;

  useEffect(() => {
    if (!anchor) return;
    progress.set(
      reducedMotion
        ? withTiming(1, { duration: motion.durations.fade })
        : withSpring(1, motion.springs.menu),
    );
  }, [anchor, progress, reducedMotion, motion]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const animatedStyle = useAnimatedStyle(() => {
    const scale = reducedMotion ? 1 : MENU_START_SCALE + (1 - MENU_START_SCALE) * progress.value;
    return {
      opacity: Math.min(1, progress.value * 1.5),
      transform: [{ scale }],
    };
  });

  /** Fades the menu out, then removes it (`then` runs at once: a choice applies without waiting). */
  function close(then?: () => void) {
    if (closeTimer.current) return;
    then?.();
    progress.set(
      withTiming(0, { duration: motion.durations.menuOut, easing: Easing.out(Easing.quad) }),
    );
    closeTimer.current = setTimeout(onClose, motion.durations.menuOut);
  }

  return (
    <Modal
      testID="menu"
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={() => close()}
    >
      {/* Transparent: catches the touch outside the menu, without dimming the screen. */}
      <Pressable
        testID="menu-backdrop"
        accessible={false}
        importantForAccessibility="no"
        onPress={() => close()}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        accessibilityViewIsModal
        accessibilityRole="menu"
        accessibilityLabel={label}
        style={[
          {
            position: 'absolute',
            top,
            left,
            width,
            borderRadius: radii.md,
            transformOrigin: [originX, opensUp ? height : 0, 0],
          },
          shadows.menu,
          animatedStyle,
        ]}
      >
        <Material
          style={{
            borderRadius: radii.md,
            overflow: 'hidden',
            // Keeps the menu's edge visible on a background of the same tone (dark mode).
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.separator,
          }}
        >
          {options.map((option, index) => {
            const checked = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="menuitem"
                accessibilityLabel={option.label}
                accessibilityState={{ checked, selected: checked }}
                onPress={() => close(() => onChoose(option.value))}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  minHeight: minTouchSize,
                  paddingHorizontal: spacing.lg,
                  backgroundColor: pressed ? colors.separator : 'transparent',
                  borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: colors.separator,
                })}
              >
                <View style={{ width: 18, alignItems: 'center' }}>
                  {checked ? <Icon name="check" size={15} color="text" /> : null}
                </View>
                <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </Material>
      </Animated.View>
    </Modal>
  );
}
