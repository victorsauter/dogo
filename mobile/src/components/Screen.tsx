import { useRef, type PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type ScrollViewInstance,
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
}

/**
 * Base of every screen: background, safe area, keyboard avoidance and optional
 * scroll. A scrolling screen lets its forms scroll to the first field in error
 * (`useScrollToFirstError`).
 */
export function Screen({
  children,
  scroll = true,
  edges = ['top', 'left', 'right', 'bottom'],
  padded = true,
  contentStyle,
}: PropsWithChildren<ScreenProps>) {
  const { colors, spacing } = useTheme();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const content: ViewStyle = {
    padding: padded ? spacing.lg : 0,
    gap: spacing.lg,
    ...contentStyle,
  };

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <FormScrollProvider scrollRef={scrollRef}>
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={[{ flexGrow: 1 }, content]}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          </FormScrollProvider>
        ) : (
          <View style={[{ flex: 1 }, content]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
