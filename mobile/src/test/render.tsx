import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ThemeProvider } from '@/theme';

/** Renders a component inside the providers base components need. */
export function renderWithTheme(ui: ReactElement, scheme: 'light' | 'dark' = 'light') {
  return render(<ThemeProvider scheme={scheme}>{ui}</ThemeProvider>);
}
