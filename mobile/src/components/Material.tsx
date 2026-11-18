import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useSyncExternalStore, type PropsWithChildren } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme';

/**
 * How a material is drawn on this device:
 * - `glass`: the system's Liquid Glass (iOS 26 and later, `expo-glass-effect`);
 * - `blur`: the system blur under a light tint, with a light edge (older iOS);
 * - `solid`: a background of the theme, nearly opaque (Android, web), or fully
 *   opaque when « Réduire la transparence » is on.
 */
export type MaterialKind = 'glass' | 'blur' | 'solid';

export interface MaterialProps {
  /**
   * Layout of the surface and of its content (size, padding, row…), with its
   * corner radius (`borderRadius` or per corner): the material follows it.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * `control` (default): a floating surface (button, pill, menu, card over the
   * map), on glass where available, with the soft shadow of floating elements.
   * `bar`: an edge-to-edge bar (under the status bar), on the blur, as iOS does
   * for its bars, without shadow, a hairline at the bottom.
   */
  variant?: 'control' | 'bar';
  /** Tinted with the primary colour: the main action, an active filter. Text on it: `onPrimary`. */
  tinted?: boolean;
  /**
   * Fades the surface away. Glass dematerialises instead (Apple advises against
   * lowering its opacity: it stops rendering), so its content fades by itself.
   */
  hidden?: boolean;
  testID?: string;
}

/**
 * The one surface of the floating layer of the app (pills, buttons and cards
 * over the map, menus, bars), like the materials of iOS: the content behind
 * shows through. See `MaterialKind` for how it is drawn on each device.
 */
export function Material({
  children,
  style,
  variant = 'control',
  tinted = false,
  hidden = false,
  testID,
}: PropsWithChildren<MaterialProps>) {
  const { colors, dark, material, motion, shadows } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const kind = materialKind(variant, reduceTransparency);
  const shown = useSharedValue(hidden ? 0 : 1);
  useEffect(() => {
    shown.set(withTiming(hidden ? 0 : 1, { duration: motion.durations.fade }));
  }, [hidden, shown, motion]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  const floating = variant === 'control';

  if (kind === 'glass') {
    return (
      <GlassView
        testID={testID}
        glassEffectStyle={{ style: hidden ? 'none' : 'regular', animate: true }}
        tintColor={tinted ? colors.primary : undefined}
        colorScheme={dark ? 'dark' : 'light'}
        style={style}
      >
        {children}
      </GlassView>
    );
  }

  const corners = cornersOf(style);
  const edge =
    variant === 'bar'
      ? { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.separator }
      : {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: tinted ? colors.primary : kind === 'blur' ? colors.glassEdge : colors.border,
        };
  const background = tinted
    ? colors.primary
    : kind === 'solid'
      ? reduceTransparency
        ? colors.surface
        : colors.materialFallback
      : undefined;

  return (
    <Animated.View
      testID={testID}
      style={[floating && shadows.floating, style, fadeStyle]}
      pointerEvents={hidden ? 'none' : undefined}
    >
      {/* The material itself, clipped to the corners; the content (and the shadow) is not. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          corners,
          { overflow: 'hidden', backgroundColor: background },
          edge,
        ]}
      >
        {kind === 'blur' && !tinted ? (
          <>
            <BlurView
              tint={material.tint}
              intensity={material.intensity}
              style={StyleSheet.absoluteFill}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.materialTint }]} />
          </>
        ) : null}
      </View>
      {children}
    </Animated.View>
  );
}

const CORNER_KEYS = [
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
] as const;

/** The corner radii of a style, for the layers that draw the material under the content. */
function cornersOf(style: StyleProp<ViewStyle>): ViewStyle {
  const flat = StyleSheet.flatten(style) ?? {};
  return Object.fromEntries(
    CORNER_KEYS.filter((key) => flat[key] !== undefined).map((key) => [key, flat[key]]),
  );
}

/** Whether the system's Liquid Glass can be drawn (iOS 26 and later, API really present). */
function glassAvailable(): boolean {
  return Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
}

/** How a material of this variant is drawn here, following « Réduire la transparence ». */
function materialKind(
  variant: MaterialProps['variant'],
  reduceTransparency: boolean,
): MaterialKind {
  if (reduceTransparency || Platform.OS !== 'ios') return 'solid';
  return variant === 'control' && glassAvailable() ? 'glass' : 'blur';
}

// « Réduire la transparence » (iOS): one subscription for the whole app, while
// at least one material is shown.
let reduceTransparency = false;
let subscription: { remove: () => void } | null = null;
const listeners = new Set<() => void>();

function setReduceTransparency(enabled: boolean) {
  if (enabled === reduceTransparency) return;
  reduceTransparency = enabled;
  listeners.forEach((listener) => listener());
}

function subscribeReduceTransparency(listener: () => void) {
  listeners.add(listener);
  if (!subscription && Platform.OS === 'ios') {
    subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduceTransparency,
    );
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduceTransparency);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      subscription?.remove();
      subscription = null;
    }
  };
}

const reduceTransparencySnapshot = () => reduceTransparency;

/** « Réduire la transparence » is on (iOS): materials become opaque. */
function useReduceTransparency(): boolean {
  return useSyncExternalStore(
    subscribeReduceTransparency,
    reduceTransparencySnapshot,
    reduceTransparencySnapshot,
  );
}
