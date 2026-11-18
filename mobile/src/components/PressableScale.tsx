import { useState } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** A style, or a function of the pressed state (like `Pressable`). */
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  /** `large` for a big surface (a card): it shrinks less. */
  size?: 'default' | 'large';
}

/**
 * `Pressable` that shrinks a little while pressed and springs back, as native
 * iOS controls do. Without animation when « Réduire les animations » is on.
 */
export function PressableScale({
  style,
  size = 'default',
  onPressIn,
  onPressOut,
  disabled,
  ...props
}: PressableScaleProps) {
  const { motion } = useTheme();
  const reducedMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const pressedScale = size === 'large' ? motion.pressedScaleLarge : motion.pressedScale;

  function press(active: boolean) {
    setPressed(active);
    if (reducedMotion) return;
    scale.set(withSpring(active ? pressedScale : 1, motion.springs.press));
  }

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={(event: GestureResponderEvent) => {
        press(true);
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        press(false);
        onPressOut?.(event);
      }}
      style={[typeof style === 'function' ? style({ pressed }) : style, animatedStyle]}
      {...props}
    />
  );
}
