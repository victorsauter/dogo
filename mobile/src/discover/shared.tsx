import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import type MapView from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { enumValues, type DogSize } from '@/api/enums';
import type { WalkSearchResult } from '@/api/types';
import {
  DEFAULT_SEARCH_RADIUS_KM,
  defaultWalkFilters,
  SEARCH_RADII_KM,
  searchParamsFor,
  useWalkSearch,
  type PeriodFilter,
  type SearchRadiusKm,
  type SizeFilter,
  type WalkFilters,
  type WalkSearchParams,
} from '@/api/walks';
import {
  Button,
  Icon,
  Material,
  MenuPill,
  PressableScale,
  Text,
  type ChoiceOption,
  type IconName,
} from '@/components';
import { regionAround, type MapRegion } from '@/lib/geo';
import { useDebouncedValue, useDelayedFlag, useRefetchOnFocusIfStale } from '@/lib/hooks';
import type { UserLocation } from '@/lib/location';
import { enumLabel, format, t } from '@/strings';
import { useTheme } from '@/theme';

/**
 * Pieces shared by the two views of the « Balades » tab: filters, header, the
 * search that follows a map, refresh, navigation and the floating buttons.
 */

export const SEARCH_DEBOUNCE_MS = 400;
export const LOADING_DELAY_MS = 300;

const periodOptions: ChoiceOption<PeriodFilter>[] = [
  { value: 'today', label: t.discover.periodToday },
  { value: 'week', label: t.discover.periodWeek },
  { value: 'all', label: t.discover.periodAll },
];

const sizeOptions: ChoiceOption<SizeFilter>[] = [
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

export type FiltersUpdate = (update: (current: WalkFilters) => WalkFilters) => void;

/**
 * The filters of the tab, shared by its two views: owned by the tab's screen,
 * which stays mounted for the whole session, so switching between « Panneau »
 * and « Liste » in the profile keeps them. The radius only applies to « Liste ».
 */
export interface DiscoverFilterState {
  filters: WalkFilters;
  setFilters: FiltersUpdate;
  radiusKm: SearchRadiusKm;
  setRadiusKm: (km: SearchRadiusKm) => void;
}

export function useDiscoverFilterState(): DiscoverFilterState {
  const [filters, setFilters] = useState<WalkFilters>(defaultWalkFilters);
  const [radiusKm, setRadiusKm] = useState<SearchRadiusKm>(DEFAULT_SEARCH_RADIUS_KM);
  return { filters, setFilters, radiusKm, setRadiusKm };
}

export interface FilterBarProps {
  filters: WalkFilters;
  onFiltersChange: FiltersUpdate;
  /** The radius pill, only for the « Liste » view (a map follows its visible area). */
  radius?: { value: SearchRadiusKm; onChange: (km: SearchRadiusKm) => void };
}

/**
 * One row of pills, each opening its menu under itself: period, dog size and,
 * in the list, distance. A pill shows its current value and is filled when it
 * differs from the default. With large text the row scrolls sideways.
 */
export function FilterBar({ filters, onFiltersChange, radius }: FilterBarProps) {
  const { spacing } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // The pills start at the screen's margin and scroll to its edges.
      style={{ marginHorizontal: -spacing.lg, flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
    >
      <MenuPill
        testID="filter-period"
        label={t.discover.period}
        text={periodOptions.find((option) => option.value === filters.period)!.label}
        options={periodOptions}
        value={filters.period}
        active={filters.period !== defaultWalkFilters.period}
        onChange={(period) => onFiltersChange((current) => ({ ...current, period }))}
      />
      <MenuPill
        testID="filter-size"
        label={t.discover.size}
        text={filters.size === 'all' ? t.discover.size : enumLabel('DogSize', filters.size)}
        options={sizeOptions}
        value={filters.size}
        active={filters.size !== defaultWalkFilters.size}
        onChange={(size) => onFiltersChange((current) => ({ ...current, size }))}
      />
      {radius ? (
        <MenuPill
          testID="filter-radius"
          label={t.discover.radius}
          text={format(t.discover.radiusOption, { km: radius.value })}
          options={radiusOptions}
          value={String(radius.value) as `${SearchRadiusKm}`}
          active={radius.value !== DEFAULT_SEARCH_RADIUS_KM}
          onChange={(km) => radius.onChange(Number(km) as SearchRadiusKm)}
        />
      ) : null}
    </ScrollView>
  );
}

export interface DiscoverHeaderProps extends FilterBarProps {
  /** Sentence under the filters (position unknown). */
  notice?: string | null;
  /** Hides the title row (the full-screen map has its own bottom buttons). */
  showTitle?: boolean;
  style?: ViewStyle;
}

/** Title with « Créer », then the row of filter pills. */
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
    <View style={[{ gap: spacing.xs }, style]}>
      {showTitle ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text variant="title">{t.discover.title}</Text>
          <CreateButton onPress={createWalk} />
        </View>
      ) : null}
      <FilterBar filters={filters} onFiltersChange={onFiltersChange} radius={radius} />
      {notice ? (
        <Text variant="caption" color="textMuted">
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

/** « Créer » of the header: a compact filled pill with a plus. */
function CreateButton({ onPress }: { onPress: () => void }) {
  const { colors, radii, spacing, minTouchSize, pillHeight } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={t.discover.createA11y}
      onPress={onPress}
      style={{ minHeight: minTouchSize, justifyContent: 'center' }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          minHeight: pillHeight,
          paddingLeft: spacing.md,
          paddingRight: spacing.lg,
          borderRadius: radii.pill,
          backgroundColor: colors.primary,
        }}
      >
        <Icon name="plus" size={15} color="onPrimary" />
        <Text variant="label" style={{ color: colors.onPrimary }}>
          {t.discover.create}
        </Text>
      </View>
    </PressableScale>
  );
}

/**
 * The header floating over a full-screen map, on a translucent material (the
 * map shows through, blurred), from the very top of the screen. Reports its
 * height so the map and the panel keep clear of it.
 */
export function FloatingHeader({
  onHeightChange,
  ...props
}: DiscoverHeaderProps & { onHeightChange: (height: number) => void }) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Material
      testID="floating-header"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.separator,
      }}
    >
      <View
        onLayout={(event) => onHeightChange(Math.round(event.nativeEvent.layout.height))}
        style={{
          paddingTop: insets.top + (props.showTitle === false ? spacing.xs : 0),
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.xs,
        }}
      >
        <DiscoverHeader {...props} />
      </View>
    </Material>
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
  const { colors, radii, spacing, minTouchSize, shadows } = useTheme();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[
        {
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
        },
        shadows.floating,
      ]}
    >
      <Icon name={icon} color="onPrimary" size={20} />
      <Text variant="subheading" style={{ color: colors.onPrimary }}>
        {label}
      </Text>
    </PressableScale>
  );
}

export const FLOATING_BUTTON_HEIGHT = 52;

/**
 * Round « Ma position » button over a map, on the floating material: recentres
 * the map on the user. Not shown without a position (permission refused or
 * services off: the screen already says so, and there is nothing to centre on).
 */
export function LocateButton({
  location,
  map,
  style,
}: {
  location: UserLocation;
  map: RefObject<MapView | null>;
  style?: ViewStyle;
}) {
  const { colors, radii, minTouchSize, shadows } = useTheme();
  const { coords } = location;
  if (location.status !== 'granted' || !coords) return null;
  return (
    <PressableScale
      testID="locate-button"
      accessibilityRole="button"
      accessibilityLabel={t.discover.locate}
      onPress={() => map.current?.animateToRegion(regionAround(coords), 400)}
      style={[
        { width: minTouchSize, height: minTouchSize, borderRadius: radii.pill },
        shadows.floating,
        style,
      ]}
    >
      <Material
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radii.pill,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.separator,
        }}
      >
        <Icon name="locate" color="primary" size={20} />
      </Material>
    </PressableScale>
  );
}

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
  const { colors, radii, spacing, shadows } = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[{ alignSelf: 'center', maxWidth: '100%', borderRadius: radii.md }, shadows.floating]}
    >
      <Material
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radii.md,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.separator,
        }}
      >
        {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        <Text variant="caption" style={{ flexShrink: 1, textAlign: 'center' }}>
          {message}
        </Text>
        {action ? (
          <Button variant="secondary" label={action.label} onPress={action.onPress} />
        ) : null}
      </Material>
    </View>
  );
}
