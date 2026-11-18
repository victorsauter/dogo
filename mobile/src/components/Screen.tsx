import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

export interface ScreenProps {
  /** Wraps the content in a ScrollView (default). Use `false` for lists and centered states. */
  scroll?: boolean;
  /** Safe-area edges to pad. Tab screens drop `bottom`, the tab bar handles it. */
  edges?: Edge[];
  /** Horizontal and vertical padding (default true). */
  padded?: boolean;
  contentStyle?: ViewStyle;
}

/** Base of every screen: background, safe area, keyboard avoidance and optional scroll. */
export function Screen({
  children,
  scroll = true,
  edges = ['top', 'left', 'right', 'bottom'],
  padded = true,
  contentStyle,
}: PropsWithChildren<ScreenProps>) {
  const { colors, spacing } = useTheme();
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
          <ScrollView
            contentContainerStyle={[{ flexGrow: 1 }, content]}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, content]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
