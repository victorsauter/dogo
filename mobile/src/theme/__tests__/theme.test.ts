import { darkColors, lightColors, type ColorTokens } from '../tokens';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** Foreground/background pairs actually used for text, with WCAG AA thresholds. */
const pairs: [keyof ColorTokens, keyof ColorTokens, number][] = [
  ['text', 'background', 4.5],
  ['text', 'surface', 4.5],
  ['textMuted', 'background', 4.5],
  ['textMuted', 'surface', 4.5],
  ['primary', 'surface', 4.5],
  ['primary', 'primarySoft', 4.5],
  ['onPrimary', 'primary', 4.5],
  ['onDanger', 'danger', 4.5],
  ['danger', 'surface', 4.5],
  ['danger', 'background', 4.5],
  ['onAccent', 'accent', 4.5],
  ['accent', 'background', 3], // icons and large text only
];

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
])('%s colors', (_name, colors) => {
  it.each(pairs)('%s on %s reaches %p:1', (fg, bg, min) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min);
  });
});
