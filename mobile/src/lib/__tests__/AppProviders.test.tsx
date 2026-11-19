import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { t } from '@/strings';

import { AppProviders } from '../AppProviders';

// Outside the router's test renderer, the provider waits for native insets: use the library's mock.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock').default,
);
// Only its root view is used here; the real module schedules UI-runtime bindings Jest cannot run.
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: jest.requireActual<typeof import('react-native')>('react-native').View,
}));

describe('AppProviders', () => {
  it('renders the app when the configuration is valid', async () => {
    await render(
      <AppProviders configError={undefined}>
        <Text>app</Text>
      </AppProviders>,
    );
    expect(screen.getByText('app')).toBeTruthy();
  });

  it.each([
    ['missingApiUrl', t.errors.configMissingApiUrl],
    ['insecureApiUrl', t.errors.configInsecureApiUrl],
  ] as const)('shows a configuration error instead of the app (%s)', async (error, message) => {
    await render(
      <AppProviders configError={error}>
        <Text>app</Text>
      </AppProviders>,
    );
    expect(screen.getByText(t.errors.configTitle)).toBeTruthy();
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByText('app')).toBeNull();
  });
});
