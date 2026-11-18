import { Pressable, View } from 'react-native';

import { Text } from '@/components';
import { t } from '@/strings';
import { useTheme } from '@/theme';

import type { DiscoverLayout } from './layoutPreference';

const options: { value: DiscoverLayout; label: string }[] = [
  { value: 'current', label: t.discoverLayout.current },
  { value: 'list', label: t.discoverLayout.list },
  { value: 'panel', label: t.discoverLayout.panel },
];

export interface LayoutSelectorProps {
  value: DiscoverLayout;
  onChange: (layout: DiscoverLayout) => void;
}

/**
 * Prototype only (EXPO_PUBLIC_DEV_LOGIN): a thin dashed strip to switch the
 * « Balades » layout. Deliberately plain so nobody mistakes it for the product.
 */
export function LayoutSelector({ value, onChange }: LayoutSelectorProps) {
  const { colors, radii, spacing, minTouchSize } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t.discoverLayout.label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: spacing.xs,
        marginHorizontal: spacing.lg,
        marginTop: spacing.xs,
        marginBottom: spacing.xs,
        paddingHorizontal: spacing.sm,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.textMuted,
        borderRadius: radii.sm,
        backgroundColor: colors.surfaceMuted,
      }}
    >
      <Text variant="caption" color="textMuted" style={{ flexShrink: 1 }}>
        {t.discoverLayout.label}
      </Text>
      <View style={{ flexDirection: 'row', marginLeft: 'auto' }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected, checked: selected }}
              onPress={() => onChange(option.value)}
              style={{
                minHeight: minTouchSize - 4,
                minWidth: minTouchSize,
                paddingHorizontal: spacing.sm,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                variant="caption"
                color={selected ? 'primary' : 'textMuted'}
                style={
                  selected ? { fontWeight: '700', textDecorationLine: 'underline' } : undefined
                }
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
