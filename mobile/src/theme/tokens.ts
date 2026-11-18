/**
 * Design tokens. Identity « Uzu »: the coat of a Jack Russell. Warm off-white
 * background, fawn as primary (actions, active filters, pins, links), warm
 * black for text and strong elements (professional walks), sand for the soft
 * tints (information, selection, edges). The dark theme is its own palette: a
 * warm black background, a lighter fawn, off-white text (professional walks in
 * off-white). Text/background pairs meet WCAG AA, large text and meaningful
 * icons 3:1 (checked in `__tests__/theme.test.ts`). See ADR 0030.
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
  /** Professional walks (« Pro » badge, edge of their card, their pin): the strong colour of the coat. */
  pro: string;
  /** Text and icons drawn on `pro`. */
  onPro: string;
  danger: string;
  onDanger: string;
  dangerSoft: string;
  success: string;
  warning: string;
  info: string;
  /** Background of information badges and banners (sand). */
  infoSoft: string;
  /**
   * Translucent layer of a floating material (header over the map, menu): laid
   * over the system blur on iOS, alone (nearly opaque) where blur is not available.
   */
  materialTint: string;
  materialFallback: string;
  /**
   * Light tint of the system's Liquid Glass (untinted surfaces), so that it
   * leans towards the warm background rather than the green of the map.
   */
  glassTint: string;
  /** Light edge of a floating material drawn with the blur (iOS before Liquid Glass). */
  glassEdge: string;
  /** Hairline between rows of a material (menu items, under a floating header). */
  separator: string;
}

export const lightColors: ColorTokens = {
  background: '#FBF6EC',
  surface: '#FFFDF9',
  surfaceMuted: '#F3EADC',
  border: '#E3D3BC',
  text: '#1F1A17',
  textMuted: '#62564A',
  primary: '#9C5626',
  onPrimary: '#FFFFFF',
  primarySoft: '#F5E8D7',
  pro: '#1F1A17',
  onPro: '#FBF6EC',
  danger: '#A8322A',
  onDanger: '#FFFFFF',
  dangerSoft: '#F8E0D9',
  success: '#4A6326',
  warning: '#7A4F00',
  info: '#5C3A1C',
  infoSoft: '#E9C9A0',
  materialTint: '#FBF6EC99',
  materialFallback: '#FBF6ECF2',
  glassTint: '#FBF6EC99',
  glassEdge: '#FFFFFFB3',
  separator: '#1F1A1726',
};

export const darkColors: ColorTokens = {
  background: '#14100D',
  surface: '#201914',
  surfaceMuted: '#2C231C',
  border: '#43372D',
  text: '#F6EEE2',
  textMuted: '#BFAE9A',
  primary: '#E0A06C',
  onPrimary: '#24140A',
  primarySoft: '#3A291B',
  pro: '#F3EADB',
  onPro: '#1F1A17',
  danger: '#F2B3A8',
  onDanger: '#5A1610',
  dangerSoft: '#4A201A',
  success: '#B5CC8A',
  warning: '#EEC36E',
  info: '#E9C9A0',
  infoSoft: '#3B2E22',
  materialTint: '#201914A6',
  materialFallback: '#201914F2',
  glassTint: '#14100D40',
  glassEdge: '#FFFFFF2E',
  separator: '#F6EEE226',
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
