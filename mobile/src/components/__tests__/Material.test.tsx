import { act, screen, waitFor } from '@testing-library/react-native';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { renderWithTheme } from '@/test/render';
import { darkColors, lightColors } from '@/theme/tokens';

import { Material } from '..';

const surface = () => screen.getByTestId('surface');
const style = () => StyleSheet.flatten(surface().props.style);
/** The layer drawn under the content, in the blur and solid materials. */
const layerElement = () => surface().children[0] as { props: object; children: unknown[] };
const layer = (): ViewStyle =>
  StyleSheet.flatten((layerElement().props as { style: StyleProp<ViewStyle> }).style) ?? {};
/** The tint of the system blur in that layer, if it holds one. */
const blurTint = () =>
  (layerElement().children[0] as { props?: { tint?: string } } | undefined)?.props?.tint;

function withGlass(available: boolean) {
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(available);
  jest.mocked(isGlassEffectAPIAvailable).mockReturnValue(available);
}

afterEach(() => {
  withGlass(false);
  jest.mocked(AccessibilityInfo.isReduceTransparencyEnabled).mockResolvedValue(false);
  Platform.OS = 'ios';
});

describe('Material', () => {
  it('is the system Liquid Glass where available, following the theme', async () => {
    withGlass(true);
    await renderWithTheme(<Material testID="surface" style={{ borderRadius: 22 }} />, 'dark');
    expect(surface().props.glassEffectStyle).toEqual({ style: 'regular', animate: true });
    expect(surface().props.colorScheme).toBe('dark');
    expect(surface().props.tintColor).toBeUndefined();
    expect(style().borderRadius).toBe(22);
  });

  it('tints the glass with the primary colour for the main action or an active filter', async () => {
    withGlass(true);
    await renderWithTheme(<Material testID="surface" tinted />);
    expect(surface().props.tintColor).toBe(lightColors.primary);
  });

  it('dematerialises the glass instead of lowering its opacity', async () => {
    withGlass(true);
    await renderWithTheme(<Material testID="surface" hidden />);
    expect(surface().props.glassEffectStyle).toEqual({ style: 'none', animate: true });
    expect(StyleSheet.flatten(surface().props.style)?.opacity).toBeUndefined();
  });

  it('falls back on the blur with a light edge and a soft shadow (iOS before 26)', async () => {
    await renderWithTheme(<Material testID="surface" style={{ borderRadius: 22 }} />);
    expect(surface().props.glassEffectStyle).toBeUndefined();
    expect(blurTint()).toBe('systemChromeMaterialLight');
    expect(layer()).toMatchObject({ borderRadius: 22, borderColor: lightColors.glassEdge });
    expect(style().shadowOpacity).toBeGreaterThan(0);
  });

  it('draws bars on the blur even with glass, with a hairline at the bottom and no shadow', async () => {
    withGlass(true);
    await renderWithTheme(<Material testID="surface" variant="bar" />);
    expect(surface().props.glassEffectStyle).toBeUndefined();
    expect(layer()).toMatchObject({ borderColor: lightColors.separator });
    expect(layer().borderBottomWidth).toBeGreaterThan(0);
    expect(style().shadowOpacity).toBeUndefined();
  });

  it('is a nearly opaque background of the theme on Android', async () => {
    Platform.OS = 'android';
    await renderWithTheme(<Material testID="surface" />, 'dark');
    expect(layer().backgroundColor).toBe(darkColors.materialFallback);
    expect(blurTint()).toBeUndefined();
  });

  it('becomes opaque with « Réduire la transparence », glass included', async () => {
    withGlass(true);
    jest.mocked(AccessibilityInfo.isReduceTransparencyEnabled).mockResolvedValue(true);
    await renderWithTheme(<Material testID="surface" />);
    await waitFor(() => expect(layer().backgroundColor).toBe(lightColors.surface));
    expect(surface().props.glassEffectStyle).toBeUndefined();
  });

  it('follows the setting when it changes while shown', async () => {
    await renderWithTheme(<Material testID="surface" />);
    const [, onChange] = jest
      .mocked(AccessibilityInfo.addEventListener)
      .mock.calls.find(([event]) => event === 'reduceTransparencyChanged')!;
    await act(() => (onChange as (enabled: boolean) => void)(true));
    expect(layer().backgroundColor).toBe(lightColors.surface);
    await act(() => (onChange as (enabled: boolean) => void)(false));
    expect(layer().backgroundColor).toBeUndefined();
  });
});
