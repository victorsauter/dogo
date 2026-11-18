import { SymbolView } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { useTheme, type ColorTokens } from '@/theme';

/**
 * App icons, mapped to native symbols: SF Symbols on iOS, Material Symbols on
 * Android and web (expo-symbols, no font to load). Add a name here before use.
 */
const icons = {
  map: { ios: 'map', android: 'map', web: 'map' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  person: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
  paw: { ios: 'pawprint', android: 'pets', web: 'pets' },
  offline: { ios: 'wifi.slash', android: 'cloud_off', web: 'cloud_off' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  minus: { ios: 'minus', android: 'remove', web: 'remove' },
  pin: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
} as const;

export type IconName = keyof typeof icons;

export interface IconProps {
  name: IconName;
  size?: number;
  /** Theme color name, or any color (e.g. the tint given by the tab bar). */
  color?: keyof ColorTokens | ColorValue;
}

/** Decorative icon: hidden from screen readers, the surrounding text carries the meaning. */
export function Icon({ name, size = 24, color = 'text' }: IconProps) {
  const { colors } = useTheme();
  const tint =
    typeof color === 'string' && color in colors ? colors[color as keyof ColorTokens] : color;
  return (
    <SymbolView
      name={icons[name]}
      size={size}
      tintColor={tint}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    />
  );
}
