import { useWindowDimensions } from 'react-native';

/**
 * Text size factor from which a layout that fits at the normal size no longer
 * does (a row of two buttons, a line cut short): iOS « Texte plus grand » and
 * Android « Taille de police » go well beyond it (up to about 3 on iOS).
 */
export const LARGE_TEXT_SCALE = 1.3;

/** The factor the person chose in the system's accessibility settings (1 = normal). */
export function useFontScale(): number {
  return useWindowDimensions().fontScale;
}

/** True when text is enlarged enough for the layout to give way: wrap, stack, grow. */
export function useLargeText(): boolean {
  return useFontScale() >= LARGE_TEXT_SCALE;
}

/**
 * Line limit of a text that is shortened with « … » at the normal size, and that
 * shows in full once the text is enlarged: a title cut short is no use to someone
 * who enlarged the text in order to read it.
 */
export function useLineLimit(lines: number): number | undefined {
  return useLargeText() ? undefined : lines;
}

/** `size` grown with the text (never below it), for a minimum height that holds enlarged text. */
export function scaledSize(size: number, fontScale: number, max = 2): number {
  return Math.round(size * Math.min(Math.max(fontScale, 1), max));
}
