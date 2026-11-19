import { screen } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';

import { renderWithTheme } from '@/test/render';

import { Screen } from '../Screen';

// Records the props `Screen` gives to `KeyboardAvoidingView`.
const mockKeyboardAvoidingView = jest.fn();
jest.mock('react-native', () => {
  const actual = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  const props = Object.create(actual) as Record<string, unknown>;
  Object.defineProperty(props, 'KeyboardAvoidingView', {
    get: () => (p: { children?: React.ReactNode }) => {
      mockKeyboardAvoidingView(p);
      return React.createElement(actual.View, null, p.children);
    },
  });
  return props;
});

describe('Screen keyboard avoidance', () => {
  const original = Platform.OS;
  afterEach(() => {
    Platform.OS = original;
    mockKeyboardAvoidingView.mockClear();
  });

  it.each(['ios', 'android'] as const)('pads for the keyboard on %s', async (os) => {
    Platform.OS = os;
    await renderWithTheme(
      <Screen>
        <Text>contenu</Text>
      </Screen>,
    );
    expect(screen.getByText('contenu')).toBeTruthy();
    expect(mockKeyboardAvoidingView.mock.calls.at(-1)![0].behavior).toBe('padding');
  });
});
