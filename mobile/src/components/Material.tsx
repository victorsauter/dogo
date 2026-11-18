import { BlurView } from 'expo-blur';
import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export interface MaterialProps {
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Translucent floating surface, like iOS materials: the content behind (the
 * map) shows through, blurred, under a light tint of the app's background.
 * Where blur is not available (Android, web), a nearly opaque background.
 * Give it `overflow: 'hidden'` with rounded corners.
 */
export function Material({ children, style, testID }: PropsWithChildren<MaterialProps>) {
  const { colors, material } = useTheme();
  if (Platform.OS !== 'ios') {
    return (
      <View testID={testID} style={[{ backgroundColor: colors.materialFallback }, style]}>
        {children}
      </View>
    );
  }
  return (
    <View testID={testID} style={style}>
      <BlurView
        tint={material.tint}
        intensity={material.intensity}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.materialTint }]}
      />
      {children}
    </View>
  );
}
