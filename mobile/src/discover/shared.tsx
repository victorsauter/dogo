import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';
import type MapView from 'react-native-maps';

import { enumValues, type DogSize } from '@/api/enums';
import type { WalkSearchResult } from '@/api/types';
import {
  searchParamsFor,
  SEARCH_RADII_KM,
  useWalkSearch,
  type PeriodFilter,
  type SearchRadiusKm,
  type SizeFilter,
  type WalkFilters,
  type WalkSearchParams,
} from '@/api/walks';
import { Button, ChoiceGroup, Icon, Text, type IconName } from '@/components';
import type { MapRegion } from '@/lib/geo';
import { useDebouncedValue, useDelayedFlag } from '@/lib/hooks';
import type { UserLocation } from '@/lib/location';
import { enumLabel, format, t } from '@/strings';
import { useTheme } from '@/theme';

/**
 * Pieces shared by the two views of the « Balades » tab: filters, header, the
 * search that follows a map, refresh, navigation and the floating button.
 */

export const SEARCH_DEBOUNCE_MS = 400;
export const LOADING_DELAY_MS = 300;

export const periodOptions: { value: PeriodFilter; label: string }[] = [
  { value: 'today', label: t.discover.periodToday },
  { value: 'week', label: t.discover.periodWeek },
  { value: 'all', label: t.discover.periodAll },
];

export const sizeOptions: { value: SizeFilter; label: string }[] = [
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

export function useDiscoverNavigation() {
  const router = useRouter();
  return {
    openWalk: (id: string) => router.push({ pathname: '/walks/[id]', params: { id } }),
    createWalk: () => router.push('/walks/new'),
  };
}

export interface DiscoverHeaderProps {
  filters: WalkFilters;
  onFiltersChange: (update: (current: WalkFilters) => WalkFilters) => void;
  /** The radius choice of the « Liste » view. */
  radius?: { value: SearchRadiusKm; onChange: (km: SearchRadiusKm) => void };
  /** Sentence under the filters (position unknown). */
  notice?: string | null;
  /** Hides the title row (the full-screen map has its own bottom buttons). */
  showTitle?: boolean;
  style?: ViewStyle;
}

/** Title with « Créer », then the filter chips. */
export function DiscoverHeader({
  filters,
  onFiltersChange,
  radius,
  notice,
  showTitle = true,
  style,
}: DiscoverHeaderProps) {
  const { spacing } = useTheme();
  const { createWalk } = useDiscoverNavigation();
  return (
    <View style={[{ gap: spacing.sm }, style]}>
      {showTitle ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text variant="title">{t.discover.title}</Text>
          <Button
            label={t.discover.create}
            accessibilityLabel={t.discover.createA11y}
            onPress={createWalk}
          />
        </View>
      ) : null}
      <ChoiceGroup
        accessibilityLabel={t.discover.period}
        options={periodOptions}
        value={filters.period}
        onChange={(period) => onFiltersChange((current) => ({ ...current, period }))}
      />
      <ChoiceGroup
        accessibilityLabel={t.discover.size}
        options={sizeOptions}
        value={filters.size}
        onChange={(size) => onFiltersChange((current) => ({ ...current, size }))}
      />
      {radius ? (
        <ChoiceGroup
          accessibilityLabel={t.discover.radius}
          options={radiusOptions}
          value={String(radius.value) as `${SearchRadiusKm}`}
          onChange={(km) => radius.onChange(Number(km) as SearchRadiusKm)}
        />
      ) : null}
      {notice ? (
        <Text variant="caption" color="textMuted">
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

export function locationUnknown(location: UserLocation): boolean {
  return location.status === 'denied' || location.status === 'unavailable';
}

/** Walks by start date, soonest first. */
export function byStartDate(walks: readonly WalkSearchResult[]): WalkSearchResult[] {
  return [...walks].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** A walk search with pull-to-refresh state. */
export function useRefreshableSearch(params: WalkSearchParams | null) {
  const search = useWalkSearch(params);
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    try {
      await search.refetch();
    } finally {
      setRefreshing(false);
    }
  }
  return { search, walks: search.data ?? [], refreshing, refresh };
}

/**
 * Search that follows the visible map area (debounced). Before the position is
 * known nothing is searched; then the map is moved to `startRegion` once.
 * `enabled: false` keeps the state (last area) but searches nothing.
 */
export function useMapAreaSearch({
  located,
  startRegion,
  filters,
  map,
  enabled = true,
}: {
  located: boolean;
  startRegion: MapRegion;
  filters: WalkFilters;
  map: RefObject<MapView | null>;
  enabled?: boolean;
}) {
  const [pannedRegion, setPannedRegion] = useState<MapRegion | null>(null);
  useEffect(() => {
    if (located) map.current?.animateToRegion(startRegion, 300);
  }, [located, startRegion, map]);
  const region = located && enabled ? (pannedRegion ?? startRegion) : null;
  const searchRegion = useDebouncedValue(region, SEARCH_DEBOUNCE_MS);
  const params = useMemo(
    () => (searchRegion ? searchParamsFor(searchRegion, filters) : null),
    [searchRegion, filters],
  );
  const result = useRefreshableSearch(params);
  const searching = useDelayedFlag(
    region !== null && (result.search.isFetching || region !== searchRegion) && !result.refreshing,
    LOADING_DELAY_MS,
  );
  return {
    ...result,
    searching,
    /** Where the map should open: the last area seen, else the start region. */
    mapRegion: pannedRegion ?? startRegion,
    onRegionChange: (next: MapRegion) => {
      if (located) setPannedRegion(next);
    },
  };
}

export interface FloatingButtonProps {
  label: string;
  accessibilityLabel: string;
  icon: IconName;
  onPress: () => void;
  testID?: string;
}

/** Big pill with an icon and a word (« Carte », « Liste »), floating over the content. */
export function FloatingButton({
  label,
  accessibilityLabel,
  icon,
  onPress,
  testID,
}: FloatingButtonProps) {
  const { colors, radii, spacing, minTouchSize } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        minHeight: FLOATING_BUTTON_HEIGHT,
        minWidth: minTouchSize * 2.5,
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
        borderRadius: radii.pill,
        backgroundColor: colors.primary,
        opacity: pressed ? 0.85 : 1,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 6,
      })}
    >
      <Icon name={icon} color="onPrimary" size={22} />
      <Text variant="subheading" style={{ color: colors.onPrimary }}>
        {label}
      </Text>
    </Pressable>
  );
}

export const FLOATING_BUTTON_HEIGHT = 52;

/** Small rounded label over the map (hint, empty area, error with retry). */
export function MapNotice({
  message,
  busy,
  action,
}: {
  message: string;
  busy?: boolean;
  action?: { label: string; onPress: () => void };
}) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: spacing.sm,
        maxWidth: '100%',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radii.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      <Text variant="caption" style={{ flexShrink: 1, textAlign: 'center' }}>
        {message}
      </Text>
      {action ? <Button variant="secondary" label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}
