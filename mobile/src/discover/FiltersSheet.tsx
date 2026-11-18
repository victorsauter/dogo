import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { enumValues, type DogSize } from '@/api/enums';
import {
  DEFAULT_SEARCH_RADIUS_KM,
  defaultWalkFilters,
  SEARCH_RADII_KM,
  type SearchRadiusKm,
  type SizeFilter,
  type WalkFilters,
} from '@/api/walks';
import { Button, ChoiceGroup, Icon, Text } from '@/components';
import { enumLabel, format, plural, t } from '@/strings';
import { useTheme } from '@/theme';

const sizeOptions: { value: SizeFilter; label: string }[] = [
  { value: 'all', label: t.discover.sizeAll },
  ...enumValues.DogSize.map((size) => ({
    value: size as DogSize,
    label: enumLabel('DogSize', size),
  })),
];

const radiusOptions = SEARCH_RADII_KM.map((km) => ({
  value: String(km) as `${SearchRadiusKm}`,
  label: format(t.discover.radiusOption, { km }),
}));

export interface FiltersSheetProps {
  visible: boolean;
  onClose: () => void;
  filters: WalkFilters;
  onFiltersChange: (update: (current: WalkFilters) => WalkFilters) => void;
  /** The radius choice, only for the « Liste » view (the map follows its visible area). */
  radius?: { value: SearchRadiusKm; onChange: (km: SearchRadiusKm) => void };
  /** Walks found with the current filters; `null` while loading or unknown. */
  resultCount: number | null;
}

/**
 * « Filtres » sheet, a modal rising from the bottom (over the sliding panel too).
 * Changes apply to the search at once (no draft): the main button only closes it
 * and says how many walks the search found.
 */
export function FiltersSheet({
  visible,
  onClose,
  filters,
  onFiltersChange,
  radius,
  resultCount,
}: FiltersSheetProps) {
  const { colors, radii, spacing, minTouchSize } = useTheme();
  const insets = useSafeAreaInsets();
  const isDefault =
    filters.size === defaultWalkFilters.size &&
    (!radius || radius.value === DEFAULT_SEARCH_RADIUS_KM);

  function reset() {
    onFiltersChange((current) => ({ ...current, size: defaultWalkFilters.size }));
    radius?.onChange(DEFAULT_SEARCH_RADIUS_KM);
  }

  return (
    <Modal
      testID="filters-sheet"
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Touching the background closes the sheet; the close button is the accessible way. */}
        <Pressable
          testID="filters-backdrop"
          accessible={false}
          importantForAccessibility="no"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: '#00000066',
          }}
        />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: '90%',
            borderTopLeftRadius: radii.lg,
            borderTopRightRadius: radii.lg,
            backgroundColor: colors.background,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: spacing.lg,
              paddingRight: spacing.sm,
              paddingTop: spacing.sm,
            }}
          >
            <Text variant="heading">{t.discover.filters}</Text>
            <Pressable
              testID="filters-close"
              accessibilityRole="button"
              accessibilityLabel={t.discover.filtersClose}
              onPress={onClose}
              style={({ pressed }) => ({
                width: minTouchSize,
                height: minTouchSize,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radii.pill,
                backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
              })}
            >
              <Icon name="close" size={20} />
            </Pressable>
          </View>
          <ScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}
          >
            <View style={{ gap: spacing.sm }}>
              <Text variant="subheading" accessibilityRole="header">
                {t.discover.sizeSection}
              </Text>
              <ChoiceGroup
                accessibilityLabel={t.discover.sizeSection}
                options={sizeOptions}
                value={filters.size}
                onChange={(size) => onFiltersChange((current) => ({ ...current, size }))}
              />
            </View>
            {radius ? (
              <View style={{ gap: spacing.sm }}>
                <Text variant="subheading" accessibilityRole="header">
                  {t.discover.radius}
                </Text>
                <ChoiceGroup
                  accessibilityLabel={t.discover.radius}
                  options={radiusOptions}
                  value={String(radius.value) as `${SearchRadiusKm}`}
                  onChange={(km) => radius.onChange(Number(km) as SearchRadiusKm)}
                />
              </View>
            ) : null}
          </ScrollView>
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.md,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm,
            }}
          >
            <Button
              variant="secondary"
              label={t.discover.filtersReset}
              disabled={isDefault}
              onPress={reset}
            />
            <View style={{ flex: 1 }}>
              <Button
                label={
                  resultCount === null
                    ? t.discover.seeWalksUnknown
                    : plural(t.discover.seeWalks, resultCount)
                }
                onPress={onClose}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
