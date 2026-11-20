import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import type { ChoiceOption } from './Chip';
import { Icon } from './Icon';
import { Material } from './Material';
import { Text } from './Text';

/** Width of the app's own menu, like a compact iOS menu. */
const MENU_WIDTH = 224;
/** Scale the menu grows from, at its pill. */
const MENU_START_SCALE = 0.4;

/** An entry of the menu: a choice, or an action (`destructive` draws it in red). */
export type MenuOption<T extends string> = ChoiceOption<T> & { destructive?: boolean };

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
export function AnchoredMenu<T extends string>({
  label,
  anchor,
  options,
  value,
  onChoose,
  onClose,
}: {
  label: string;
  anchor: Anchor | null;
  options: readonly MenuOption<T>[];
  /** The chosen option, checked in the list; none for a menu of actions. */
  value?: T;
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
        <Material style={{ borderRadius: radii.md, overflow: 'hidden' }}>
          {options.map((option, index) => {
            const checked = value !== undefined && option.value === value;
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
                {value !== undefined ? (
                  <View style={{ width: 18, alignItems: 'center' }}>
                    {checked ? <Icon name="check" size={15} color="text" /> : null}
                  </View>
                ) : null}
                <Text
                  variant="body"
                  color={option.destructive ? 'danger' : 'text'}
                  style={{ flex: 1 }}
                >
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
