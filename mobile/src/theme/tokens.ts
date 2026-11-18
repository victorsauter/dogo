/**
 * Design tokens. Warm, calm identity: forest green as primary (outdoors, calm),
 * terracotta as accent (warmth), warm neutrals. Text/background pairs meet
 * WCAG AA (checked in `__tests__/theme.test.ts`).
 */

export interface ColorTokens {
  /** Screen background. */
  background: string;
  /** Cards, inputs, sheets. */
  surface: string;
  /** Subtle filled areas (chips, pressed rows). */
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  /** Text and icons drawn on `primary`. */
  onPrimary: string;
  /** Low-emphasis primary tint (selected chip, secondary button). */
  primarySoft: string;
  accent: string;
  onAccent: string;
  danger: string;
  onDanger: string;
  dangerSoft: string;
  success: string;
  warning: string;
  info: string;
  /**
   * Translucent layer of a floating material (header over the map, menu): laid
   * over the system blur on iOS, alone (nearly opaque) where blur is not available.
   */
  materialTint: string;
  materialFallback: string;
  /** Light edge of a floating material drawn with the blur (iOS before Liquid Glass). */
  glassEdge: string;
  /** Hairline between rows of a material (menu items, under a floating header). */
  separator: string;
}

export const lightColors: ColorTokens = {
  background: '#FAF7F2',
  surface: '#FFFFFF',
  surfaceMuted: '#F1ECE3',
  border: '#DDD5C8',
  text: '#1F1B16',
  textMuted: '#61584E',
  primary: '#2F6B4F',
  onPrimary: '#FFFFFF',
  primarySoft: '#DCEBE2',
  accent: '#B5552E',
  onAccent: '#FFFFFF',
  danger: '#B3261E',
  onDanger: '#FFFFFF',
  dangerSoft: '#F9DEDC',
  success: '#2E6B34',
  warning: '#7A4F00',
  info: '#2B5C8A',
  materialTint: '#FAF7F299',
  materialFallback: '#FAF7F2F2',
  glassEdge: '#FFFFFFB3',
  separator: '#1F1B1626',
};

export const darkColors: ColorTokens = {
  background: '#171512',
  surface: '#221F1B',
  surfaceMuted: '#2E2A25',
  border: '#433D36',
  text: '#F3EEE7',
  textMuted: '#B8AEA2',
  primary: '#86C9A5',
  onPrimary: '#0F2A1C',
  primarySoft: '#21392C',
  accent: '#EE9C77',
  onAccent: '#2B1308',
  danger: '#F2B8B5',
  onDanger: '#601410',
  dangerSoft: '#4A1D1A',
  success: '#9BD3A0',
  warning: '#F0C36A',
  info: '#9EC5EC',
  materialTint: '#221F1BA6',
  materialFallback: '#221F1BF2',
  glassEdge: '#FFFFFF2E',
  separator: '#F3EEE726',
};

/** Spacing scale, in points. Use these instead of raw numbers. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

/** Minimum touch target (Apple HIG 44 pt, Material 48 dp). */
export const minTouchSize = 48;

/**
 * Visible height of a floating control on its material (filter pill, « Créer »,
 * « Ma position »), centred in a `minTouchSize` touch area. They are capsules:
 * their corner radius is half of it.
 */
export const controlHeight = 44;

export const typography = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  subheading: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

export type TypographyVariant = keyof typeof typography;

/** A Reanimated spring (`withSpring`): critically damped or close, short. */
export interface SpringConfig {
  damping: number;
  stiffness: number;
  mass: number;
}

/**
 * Motion, iOS-like: short springs, no bounce that draws the eye. Every
 * animation also honours the system « Réduire les animations » setting.
 */
export const motion = {
  /** Scale of a pressed control (pill, button, card). */
  pressedScale: 0.96,
  /** A larger surface (a card) moves less. */
  pressedScaleLarge: 0.98,
  springs: {
    /** Press in and out. */
    press: { damping: 20, stiffness: 420, mass: 0.6 },
    /** A menu growing from its pill (~200 ms). */
    menu: { damping: 24, stiffness: 380, mass: 0.7 },
  } satisfies Record<string, SpringConfig>,
  durations: {
    /** A menu fading away. */
    menuOut: 140,
    /** Plain fade (reduced motion, appearing controls). */
    fade: 180,
  },
} as const;

/** Soft shadows of floating elements (iOS shadow props, Android elevation). */
export const shadows = {
  /** Floating control drawn without Liquid Glass (which casts its own shadow). */
  floating: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  /** Menu open under its pill. */
  menu: {
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  /** Sliding panel, casting upwards. */
  panel: {
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
} as const;

/** Blur of the floating materials on iOS (expo-blur), by colour scheme. */
export const materials = {
  light: { tint: 'systemChromeMaterialLight', intensity: 80 },
  dark: { tint: 'systemChromeMaterialDark', intensity: 80 },
} as const;

export interface Theme {
  dark: boolean;
  colors: ColorTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  minTouchSize: number;
  controlHeight: number;
  motion: typeof motion;
  shadows: typeof shadows;
  material: (typeof materials)['light' | 'dark'];
}

export const lightTheme: Theme = {
  dark: false,
  colors: lightColors,
  spacing,
  radii,
  typography,
  minTouchSize,
  controlHeight,
  motion,
  shadows,
  material: materials.light,
};

export const darkTheme: Theme = {
  ...lightTheme,
  dark: true,
  colors: darkColors,
  material: materials.dark,
};
