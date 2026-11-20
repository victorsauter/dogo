import { useRef, useState, type PropsWithChildren, type ReactElement, type RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type RefreshControlProps,
  type ScrollViewInstance,
  type ViewInstance,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { FormScrollProvider } from './FormScroll';

export interface ScreenProps {
  /** Wraps the content in a ScrollView (default). Use `false` for lists and centered states. */
  scroll?: boolean;
  /** Safe-area edges to pad. Tab screens drop `bottom`, the tab bar handles it. */
  edges?: Edge[];
  /** Horizontal and vertical padding (default true). */
  padded?: boolean;
  contentStyle?: ViewStyle;
  /** Pull-to-refresh of a scrolling screen (a `RefreshControl`). */
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Test identifier of the scroll view (or of the content view). */
  testID?: string;
  /** Reference to the scroll view, for a screen that scrolls itself to a section. */
  scrollRef?: RefObject<ScrollViewInstance | null>;
}

/**
 * Top of `view` measured from the top of the screen, the frame of the keyboard's
 * `screenY` (see `Screen`).
 */
export function measureScreenTop(
  view: Pick<ViewInstance, 'measure' | 'measureInWindow'> | null,
  onTop: (y: number) => void,
): void {
  if (!view) return;
  if (Platform.OS === 'android') view.measure((_x, _y, _w, _h, _pageX, pageY) => onTop(pageY));
  else view.measureInWindow((_x, y) => onTop(y));
}

/**
 * Base of every screen: background, safe area, keyboard avoidance and optional
 * scroll. A scrolling screen lets its forms scroll to the first field in error
 * (`useScrollToFirstError`).
 *
 * `KeyboardAvoidingView` compares the keyboard's position on screen with its
 * own position *in its parent*: below a navigation header (or in a modal
 * sheet) it would stop short by the header height and leave the bottom of the
 * screen — a thread's composer — under the keyboard. The screen's position in
 * the window is therefore passed as `keyboardVerticalOffset`.
 *
 * `behavior="padding"` on both platforms, as Expo's keyboard guide says: apps of this
 * SDK are edge-to-edge on Android, the window no longer resizes for the keyboard, and
 * without a `behavior` a thread's composer and the bottom of the forms stay under it.
 * `softwareKeyboardLayoutMode: 'pan'` must not be set: the window would pan and the
 * padding would move the content a second time.
 *
 * The keyboard's position (`screenY`) is given from the top of the screen. On iOS,
 * `measureInWindow` gives the screen's top in the same frame. On Android
 * edge-to-edge it does not: it leaves out the status bar (measured on the
 * emulator: 56 instead of 80 below a header), so the padding fell short by the
 * status bar height and half of a thread's composer stayed under the keyboard.
 * There, `measure`'s `pageY` (from the top of the root view, which covers the
 * whole screen edge-to-edge) is the right one (`measureScreenTop`).
 */
export function Screen({
  children,
  scroll = true,
  edges = ['top', 'left', 'right', 'bottom'],
  padded = true,
  contentStyle,
  refreshControl,
  testID,
  scrollRef: externalScrollRef,
}: PropsWithChildren<ScreenProps>) {
  const { colors, spacing } = useTheme();
  const ownScrollRef = useRef<ScrollViewInstance>(null);
  const scrollRef = externalScrollRef ?? ownScrollRef;
  const rootRef = useRef<ViewInstance>(null);
  const [windowTop, setWindowTop] = useState(0);
  const content: ViewStyle = {
    padding: padded ? spacing.lg : 0,
    gap: spacing.lg,
    ...contentStyle,
  };

  return (
    <SafeAreaView
      ref={rootRef}
      edges={edges}
      style={{ flex: 1, backgroundColor: colors.background }}
      onLayout={() =>
        measureScreenTop(rootRef.current, (y) => {
          if (Number.isFinite(y)) setWindowTop(Math.max(0, y));
        })
      }
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={windowTop}
      >
        {scroll ? (
          <FormScrollProvider scrollRef={scrollRef}>
            <ScrollView
              ref={scrollRef}
              testID={testID}
              contentContainerStyle={[{ flexGrow: 1 }, content]}
              keyboardShouldPersistTaps="handled"
              refreshControl={refreshControl}
            >
              {children}
            </ScrollView>
          </FormScrollProvider>
        ) : (
          <View testID={testID} style={[{ flex: 1 }, content]}>
            {children}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
