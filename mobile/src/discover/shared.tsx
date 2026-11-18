import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { ActivityIndicator, ScrollView, View, type TextStyle, type ViewStyle } from 'react-native';
import type MapView from 'react-native-maps';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
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
  /** Overrides of the row (by default it bleeds to the screen's edges from a margin). */
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
}

/**
 * One row of pills, each opening its menu under itself: period, dog size and,
 * in the list, distance. A pill shows its current value and is filled when it
 * differs from the default. With large text the row scrolls sideways.
 */
export function FilterBar({
  filters,
  onFiltersChange,
  radius,
  style,
  contentContainerStyle,
}: FilterBarProps) {
  const { spacing } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // The pills start at the screen's margin and scroll to its edges. Not clipped:
      // the glass's light and shadow spill past each pill, and a clipped scroll
      // view would draw them as a rectangle.
      style={[{ marginHorizontal: -spacing.lg, flexGrow: 0, overflow: 'visible' }, style]}
      contentContainerStyle={[
        { paddingHorizontal: spacing.lg, gap: spacing.sm },
        contentContainerStyle,
      ]}
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
  style?: ViewStyle;
}

/** Header of the « Liste » view, over the list: title with « Créer », then the row of pills. */
export function DiscoverHeader({
  filters,
  onFiltersChange,
  radius,
  notice,
  style,
}: DiscoverHeaderProps) {
  const { spacing } = useTheme();
  const { createWalk } = useDiscoverNavigation();
  return (
    <View style={[{ gap: spacing.xs }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="title" accessibilityRole="header">
          {t.discover.title}
        </Text>
        <CreateButton onPress={createWalk} />
      </View>
      <FilterBar filters={filters} onFiltersChange={onFiltersChange} radius={radius} />
      {notice ? (
        <Text variant="caption" color="textMuted">
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * « Créer », the main action of the tab: a round button with a plus, on the
 * floating material tinted with the primary colour (like the main action of
 * an iOS toolbar), the same size as the pills.
 */
export function CreateButton({ onPress }: { onPress: () => void }) {
  const { minTouchSize, controlHeight } = useTheme();
  return (
    <PressableScale
      testID="create-walk"
      accessibilityRole="button"
      accessibilityLabel={t.discover.createA11y}
      onPress={onPress}
      style={{ minWidth: minTouchSize, minHeight: minTouchSize, justifyContent: 'center' }}
    >
      <Material
        tinted
        style={{
          alignSelf: 'center',
          width: controlHeight,
          height: controlHeight,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: controlHeight / 2,
        }}
      >
        <Icon name="plus" size={20} color="onPrimary" />
      </Material>
    </PressableScale>
  );
}

/**
 * Controls floating over a full-screen map, from the top of the screen and
 * without any band: the pills on the left, « Créer » on the right (when
 * given), a notice under them. The title stays, hidden, for screen readers
 * (the tab bar already shows it). Reports its height so the map and the panel
 * keep clear of it.
 */
export function MapTopControls({
  filters,
  onFiltersChange,
  notice,
  onCreate,
  onHeightChange,
}: FilterBarProps & {
  notice?: string | null;
  onCreate?: () => void;
  onHeightChange: (height: number) => void;
}) {
  const { spacing, minTouchSize, controlHeight } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="map-top-controls"
      pointerEvents="box-none"
      onLayout={(event) => onHeightChange(Math.round(event.nativeEvent.layout.height))}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: insets.top,
        // Keeps the panel, at its high position, a little away from the pills.
        paddingBottom: spacing.sm,
        gap: spacing.xs,
      }}
    >
      {onCreate ? (
        <Text accessibilityRole="header" style={visuallyHidden}>
          {t.discover.title}
        </Text>
      ) : null}
      <View
        pointerEvents="box-none"
        // « Créer » keeps the screen's margin (its touch area is larger than the button).
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingRight: spacing.lg - (minTouchSize - controlHeight) / 2,
        }}
      >
        <FilterBar
          filters={filters}
          onFiltersChange={onFiltersChange}
          style={{ marginHorizontal: 0, flexShrink: 1 }}
          contentContainerStyle={{ paddingRight: spacing.sm }}
        />
        {onCreate ? (
          <View style={{ marginLeft: 'auto' }}>
            <CreateButton onPress={onCreate} />
          </View>
        ) : null}
      </View>
      {notice ? (
        <View pointerEvents="box-none" style={{ paddingHorizontal: spacing.lg }}>
          <MapNotice message={notice} align="start" />
        </View>
      ) : null}
    </View>
  );
}

/** Kept for screen readers, invisible on screen (transparent, one point, no layout). */
const visuallyHidden: TextStyle = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  color: 'transparent',
};

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

/**
 * Big capsule with an icon and a word (« Carte », « Liste »), floating over the
 * content, on the material tinted with the primary colour.
 */
export function FloatingButton({
  label,
  accessibilityLabel,
  icon,
  onPress,
  testID,
}: FloatingButtonProps) {
  const { colors, spacing, minTouchSize } = useTheme();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{ alignSelf: 'center' }}
    >
      <Material
        tinted
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          minHeight: FLOATING_BUTTON_HEIGHT,
          minWidth: minTouchSize * 2.5,
          justifyContent: 'center',
          paddingHorizontal: spacing.xl,
          borderRadius: FLOATING_BUTTON_HEIGHT / 2,
        }}
      >
        <Icon name={icon} color="onPrimary" size={20} />
        <Text variant="subheading" style={{ color: colors.onPrimary }}>
          {label}
        </Text>
      </Material>
    </PressableScale>
  );
}

export const FLOATING_BUTTON_HEIGHT = 52;

/**
 * Round « Ma position » button over a map, a capsule of the floating material
 * like the pills: recentres the map on the user. Not shown without a position
 * (permission refused or services off: the screen already says so, and there
 * is nothing to centre on). `hidden` makes it give way (and fade).
 */
export function LocateButton({
  location,
  map,
  hidden = false,
  style,
}: {
  location: UserLocation;
  map: RefObject<MapView | null>;
  hidden?: boolean;
  style?: ViewStyle;
}) {
  const { minTouchSize, controlHeight, motion } = useTheme();
  const shown = useSharedValue(hidden ? 0 : 1);
  useEffect(() => {
    shown.set(withTiming(hidden ? 0 : 1, { duration: motion.durations.fade }));
  }, [hidden, shown, motion]);
  const iconStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  const { coords } = location;
  if (location.status !== 'granted' || !coords) return null;
  return (
    <PressableScale
      testID="locate-button"
      accessibilityRole="button"
      accessibilityLabel={t.discover.locate}
      disabled={hidden}
      onPress={() => map.current?.animateToRegion(regionAround(coords), 400)}
      style={[
        {
          width: minTouchSize,
          height: minTouchSize,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Material
        hidden={hidden}
        style={{
          width: controlHeight,
          height: controlHeight,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: controlHeight / 2,
        }}
      >
        <Animated.View style={iconStyle}>
          <Icon name="locate" color="primary" size={20} />
        </Animated.View>
      </Material>
    </PressableScale>
  );
}

/** Small rounded label over the map (hint, empty area, error with retry, notice). */
export function MapNotice({
  message,
  busy,
  action,
  align = 'center',
}: {
  message: string;
  busy?: boolean;
  action?: { label: string; onPress: () => void };
  /** `start`: against the left margin, under the pills. */
  align?: 'center' | 'start';
}) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ alignSelf: align === 'start' ? 'flex-start' : 'center', maxWidth: '100%' }}
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
