import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';
import type MapView from 'react-native-maps';

import type { WalkSearchResult } from '@/api/types';
import {
  defaultWalkFilters,
  searchParamsFor,
  useWalkSearch,
  type PeriodFilter,
  type WalkFilters,
  type WalkSearchParams,
} from '@/api/walks';
import { Button, Icon, SegmentedControl, Text, type IconName } from '@/components';
import type { MapRegion } from '@/lib/geo';
import { useDebouncedValue, useDelayedFlag, useRefetchOnFocusIfStale } from '@/lib/hooks';
import type { UserLocation } from '@/lib/location';
import { format, plural, t } from '@/strings';
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

export function useDiscoverNavigation() {
  const router = useRouter();
  return {
    openWalk: (id: string) => router.push({ pathname: '/walks/[id]', params: { id } }),
    createWalk: () => router.push('/walks/new'),
  };
}

/** Number of filters that differ from their default (the radius and the period do not count). */
export function activeFilterCount(filters: WalkFilters): number {
  return filters.size === defaultWalkFilters.size ? 0 : 1;
}

export interface DiscoverHeaderProps {
  filters: WalkFilters;
  onFiltersChange: (update: (current: WalkFilters) => WalkFilters) => void;
  /** Opens the « Filtres » sheet. */
  onOpenFilters: () => void;
  /** Sentence under the filters (position unknown). */
  notice?: string | null;
  /** Hides the title row (the full-screen map has its own bottom buttons). */
  showTitle?: boolean;
  style?: ViewStyle;
}

/** Title with « Créer », then one row: the period and the « Filtres » button. */
export function DiscoverHeader({
  filters,
  onFiltersChange,
  onOpenFilters,
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <SegmentedControl
            accessibilityLabel={t.discover.period}
            options={periodOptions}
            value={filters.period}
            onChange={(period) => onFiltersChange((current) => ({ ...current, period }))}
          />
        </View>
        <FiltersButton count={activeFilterCount(filters)} onPress={onOpenFilters} />
      </View>
      {notice ? (
        <Text variant="caption" color="textMuted">
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

/** Round « Filtres » button with the number of active filters in a badge. */
function FiltersButton({ count, onPress }: { count: number; onPress: () => void }) {
  const { colors, radii, minTouchSize } = useTheme();
  return (
    <View style={{ width: minTouchSize, height: minTouchSize }}>
      <Pressable
        testID="filters-button"
        accessibilityRole="button"
        accessibilityLabel={
          count > 0 ? plural(t.discover.filtersActive, count) : t.discover.filters
        }
        onPress={onPress}
        style={({ pressed }) => ({
          width: minTouchSize,
          height: minTouchSize,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radii.pill,
          borderWidth: 1,
          borderColor: count > 0 ? colors.primary : colors.border,
          backgroundColor:
            count > 0 ? colors.primarySoft : pressed ? colors.surfaceMuted : colors.surface,
        })}
      >
        <Icon name="sliders" color={count > 0 ? 'primary' : 'text'} size={22} />
      </Pressable>
      {count > 0 ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 20,
            height: 20,
            paddingHorizontal: 5,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radii.pill,
            backgroundColor: colors.primary,
          }}
        >
          <Text variant="caption" style={{ color: colors.onPrimary, fontWeight: '700' }}>
            {count}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Removable labels of the active filters (the size), above the list of walks. */
export function ActiveFilterTags({
  filters,
  onFiltersChange,
  style,
}: {
  filters: WalkFilters;
  onFiltersChange: (update: (current: WalkFilters) => WalkFilters) => void;
  style?: ViewStyle;
}) {
  const { colors, radii, spacing } = useTheme();
  if (filters.size === 'all') return null;
  const label = t.discover.sizeTag[filters.size];
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, style]}>
      <Pressable
        testID="filter-tag-size"
        accessibilityRole="button"
        accessibilityLabel={format(t.discover.removeFilter, { label })}
        onPress={() => onFiltersChange((current) => ({ ...current, size: 'all' }))}
        // 32 pt tall to look like a label, 44 pt to touch.
        hitSlop={6}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          minHeight: 32,
          paddingLeft: spacing.md,
          paddingRight: spacing.sm,
          borderRadius: radii.pill,
          backgroundColor: pressed ? colors.surfaceMuted : colors.primarySoft,
        })}
      >
        <Text variant="caption" color="primary" style={{ fontWeight: '600' }}>
          {label}
        </Text>
        <Icon name="close" color="primary" size={14} />
      </Pressable>
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

/**
 * A walk search with a manual refresh (pull-to-refresh, refresh button) and an
 * automatic one when the tab regains focus, if the data is older than 30 s.
 */
export function useRefreshableSearch(params: WalkSearchParams | null) {
  const search = useWalkSearch(params);
  useRefetchOnFocusIfStale({
    refetch: search.refetch,
    dataUpdatedAt: search.dataUpdatedAt,
    enabled: params !== null,
    busy: search.isFetching,
  });
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    try {
      await search.refetch();
    } finally {
      setRefreshing(false);
    }
  }
  return {
    search,
    walks: search.data ?? [],
    refreshing,
    refresh,
    /** Number of walks found, `null` while loading or when the search failed. */
    resultCount: search.isSuccess && !search.isFetching ? (search.data?.length ?? 0) : null,
  };
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
    // The area is still being debounced: the count would be the previous area's.
    resultCount: region === searchRegion ? result.resultCount : null,
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
