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

export const typography = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  subheading: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

export type TypographyVariant = keyof typeof typography;

export interface Theme {
  dark: boolean;
  colors: ColorTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  minTouchSize: number;
}

export const lightTheme: Theme = {
  dark: false,
  colors: lightColors,
  spacing,
  radii,
  typography,
  minTouchSize,
};

export const darkTheme: Theme = { ...lightTheme, dark: true, colors: darkColors };
