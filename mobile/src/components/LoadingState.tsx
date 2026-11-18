import { ActivityIndicator, View } from 'react-native';

import { t } from '@/strings';
import { useTheme } from '@/theme';

import { Text } from './Text';

export function LoadingState({ label = t.common.loading }: { label?: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t.a11y.loading}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        padding: spacing.xl,
      }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
      <Text color="textMuted">{label}</Text>
    </View>
  );
}
