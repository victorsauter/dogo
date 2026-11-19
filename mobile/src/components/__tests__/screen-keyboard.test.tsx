import { screen } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';

import { renderWithTheme } from '@/test/render';

import { measureScreenTop, Screen } from '../Screen';

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

describe('the top of the screen given to the keyboard avoidance', () => {
  const original = Platform.OS;
  afterEach(() => {
    Platform.OS = original;
  });

  // Below a header, edge-to-edge: 80 from the top of the screen, but Android's
  // `measureInWindow` leaves out the 24 of the status bar.
  const view = {
    measure: jest.fn((callback: (...values: number[]) => void) => callback(0, 0, 400, 800, 0, 80)),
    measureInWindow: jest.fn((callback: (...values: number[]) => void) =>
      callback(0, Platform.OS === 'android' ? 56 : 80, 400, 800),
    ),
  } as unknown as Parameters<typeof measureScreenTop>[0];

  it.each([
    ['android', 80],
    ['ios', 80],
  ] as const)('is measured from the top of the screen on %s', (os, expected) => {
    Platform.OS = os;
    const onTop = jest.fn();
    measureScreenTop(view, onTop);
    expect(onTop).toHaveBeenCalledWith(expected);
  });

  it('does nothing before the view exists', () => {
    const onTop = jest.fn();
    measureScreenTop(null, onTop);
    expect(onTop).not.toHaveBeenCalled();
  });
});
