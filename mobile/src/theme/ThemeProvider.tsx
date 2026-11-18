import { createContext, use, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from './tokens';

const ThemeContext = createContext<Theme>(lightTheme);

/** Provides the light or dark theme, following the system setting unless `scheme` is forced. */
export function ThemeProvider({
  children,
  scheme,
}: PropsWithChildren<{ scheme?: 'light' | 'dark' }>) {
  const system = useColorScheme();
  const theme = (scheme ?? system) === 'dark' ? darkTheme : lightTheme;
  return <ThemeContext value={theme}>{children}</ThemeContext>;
}

export function useTheme(): Theme {
  return use(ThemeContext);
}
