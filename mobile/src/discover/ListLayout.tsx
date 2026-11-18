import { useMemo, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import type MapView from 'react-native-maps';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { WalkSearchResult } from '@/api/types';
import { isSearchCapped, searchParamsAround } from '@/api/walks';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Material,
  Text,
  WalkCard,
  WalksMap,
} from '@/components';
import { DEFAULT_CENTER, regionForRadius, type MapRegion } from '@/lib/geo';
import { haptics } from '@/lib/haptics';
import type { UserLocation } from '@/lib/location';
import { format, plural, t } from '@/strings';
import { useTheme } from '@/theme';

import {
  byStartDate,
  DiscoverHeader,
  FLOATING_BUTTON_HEIGHT,
  FloatingButton,
  LocateButton,
  locationNoticeAction,
  locationUnknown,
  MapNotice,
  MapTopControls,
  useDiscoverNavigation,
  useMapAreaSearch,
  useRefreshableSearch,
  type DiscoverFilterState,
  type FiltersUpdate,
} from './shared';

/**
 * « Liste » view (list first, map on demand): the walks within a radius of the
 * user (or of the default centre), soonest first, over the whole screen. A
 * floating « Carte » button opens a full-screen map with the same filters,
 * where the search follows the visible area and a tapped pin shows its walk.
 * The list stays mounted under the map, so its scroll position survives.
 */
export function ListLayout({
  location,
  filterState,
}: {
  location: UserLocation;
  filterState: DiscoverFilterState;
}) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { openWalk, createWalk } = useDiscoverNavigation();
  const { filters, setFilters, radiusKm, setRadiusKm } = filterState;
  const [mapOpen, setMapOpen] = useState(false);
  // Last area seen on the map: reopening the map shows it again.
  const [mapArea, setMapArea] = useState<MapRegion | null>(null);

  const located = location.status !== 'pending';
  const center = location.coords ?? DEFAULT_CENTER;
  const params = useMemo(
    () => (located ? searchParamsAround(center, radiusKm, filters) : null),
    [located, center, radiusKm, filters],
  );
  const { search, walks, refreshing, refresh } = useRefreshableSearch(params);
  const sorted = useMemo(() => byStartDate(walks), [walks]);
  // The status bar gets its material only once the list scrolls under it, as on iOS.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const statusBarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, spacing.lg], [0, 1], Extrapolation.CLAMP),
  }));

  const listEmpty =
    !located || search.isPending ? (
      <LoadingState />
    ) : search.isError ? (
      <ErrorState error={search.error} onRetry={() => search.refetch()} />
    ) : (
      <EmptyState
        icon="paw"
        title={t.discover.listEmptyTitle}
        message={t.discover.listEmptyMessage}
        action={{ label: t.discover.emptyAction, onPress: createWalk }}
      />
    );

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        accessibilityElementsHidden={mapOpen}
        importantForAccessibility={mapOpen ? 'no-hide-descendants' : 'auto'}
      >
        <Animated.FlatList
          testID="walks-list"
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          data={sorted}
          keyExtractor={(walk) => walk.id}
          // The list scrolls under the status bar, which keeps a translucent strip.
          contentContainerStyle={{
            padding: spacing.lg,
            paddingTop: insets.top + spacing.sm,
            // Room for the floating « Carte » button below the last card.
            paddingBottom: FLOATING_BUTTON_HEIGHT + spacing.lg * 2,
            gap: spacing.md,
            flexGrow: 1,
          }}
          scrollIndicatorInsets={{ top: insets.top }}
          ListHeaderComponent={
            <View style={{ gap: spacing.sm }}>
              <DiscoverHeader
                filters={filters}
                onFiltersChange={setFilters}
                radius={{ value: radiusKm, onChange: setRadiusKm }}
                notice={locationUnknown(location) ? t.discover.listLocationDenied : null}
                noticeAction={locationNoticeAction(location)}
              />
              {sorted.length > 0 ? (
                <Text variant="caption" color="textMuted">
                  {isSearchCapped(sorted.length)
                    ? format(t.discover.resultCountPartial, { count: sorted.length })
                    : plural(t.discover.resultCount, sorted.length)}
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <WalkCard walk={item} origin={location.coords} onPress={() => openWalk(item.id)} />
          )}
          ListEmptyComponent={listEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
              progressViewOffset={insets.top}
            />
          }
        />
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', top: 0, left: 0, right: 0, height: insets.top },
            statusBarStyle,
          ]}
        >
          <Material variant="bar" style={{ flex: 1 }} />
        </Animated.View>
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: spacing.lg }}
        >
          <FloatingButton
            label={t.discover.showMap}
            accessibilityLabel={t.discover.showMapA11y}
            icon="map"
            onPress={() => setMapOpen(true)}
          />
        </View>
      </View>
      {mapOpen ? (
        <FullScreenMap
          location={location}
          filters={filters}
          onFiltersChange={setFilters}
          startRegion={mapArea ?? regionForRadius(center, radiusKm)}
          onAreaChange={setMapArea}
          onClose={() => setMapOpen(false)}
          onOpenWalk={openWalk}
        />
      ) : null}
    </View>
  );
}

/**
 * The full-screen map of the « Liste » view, up to the top of the screen, with
 * the same pills as the list floating over it (no distance: the search follows
 * the visible area). Its last area is reported to the parent.
 */
function FullScreenMap({
  location,
  filters,
  onFiltersChange,
  startRegion,
  onAreaChange,
  onClose,
  onOpenWalk,
}: {
  location: UserLocation;
  filters: DiscoverFilterState['filters'];
  onFiltersChange: FiltersUpdate;
  startRegion: MapRegion;
  onAreaChange: (region: MapRegion) => void;
  onClose: () => void;
  onOpenWalk: (id: string) => void;
}) {
  const { colors, radii, spacing, minTouchSize, controlHeight } = useTheme();
  const map = useRef<MapView>(null);
  const located = location.status !== 'pending';
  // Fixed for this opening: the map must not jump when the reported area comes back as a prop.
  const [initialRegion] = useState(startRegion);
  const [headerHeight, setHeaderHeight] = useState(0);
  const { search, walks, searching, onRegionChange } = useMapAreaSearch({
    located,
    startRegion: initialRegion,
    filters,
    map,
  });
  const [selected, setSelected] = useState<WalkSearchResult | null>(null);

  const notice = search.isError ? (
    <MapNotice
      message={search.error.message}
      action={{ label: t.common.retry, onPress: () => search.refetch() }}
    />
  ) : selected ? null : !search.isPending && !searching && walks.length === 0 ? (
    <MapNotice message={t.discover.mapEmpty} />
  ) : walks.length > 0 ? (
    <MapNotice message={t.discover.mapHint} />
  ) : null;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
      <WalksMap
        ref={map}
        initialRegion={initialRegion}
        walks={walks}
        onRegionChange={(region) => {
          onRegionChange(region);
          onAreaChange(region);
        }}
        onOpenWalk={onOpenWalk}
        onSelectWalk={(id) => {
          if (id) haptics.selection();
          setSelected(id ? (walks.find((w) => w.id === id) ?? null) : null);
        }}
        selectedId={selected?.id}
        searching={searching}
        topInset={headerHeight}
        showsUserLocation={location.status === 'granted'}
      />
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: spacing.lg,
          right: spacing.lg,
          bottom: spacing.lg,
          gap: spacing.md,
        }}
      >
        <LocateButton
          location={location}
          map={map}
          // The button (not its larger touch area) keeps the screen's margin.
          style={{ alignSelf: 'flex-end', marginRight: -(minTouchSize - controlHeight) / 2 }}
        />
        {notice}
        {selected ? (
          <View>
            <Material
              testID="selected-walk"
              style={{ gap: spacing.xs, padding: spacing.sm, borderRadius: radii.lg }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.sm,
                  minHeight: minTouchSize,
                  paddingLeft: spacing.sm,
                }}
              >
                <Text variant="caption" color="textMuted" style={{ flexShrink: 1 }}>
                  {t.discover.openWalkHint}
                </Text>
                <Button
                  variant="secondary"
                  label={t.discover.closeWalk}
                  accessibilityLabel={t.discover.closeWalkA11y}
                  onPress={() => setSelected(null)}
                />
              </View>
              <WalkCard
                compact
                walk={selected}
                origin={location.coords}
                onPress={() => onOpenWalk(selected.id)}
              />
            </Material>
          </View>
        ) : null}
        <FloatingButton
          label={t.discover.showList}
          accessibilityLabel={t.discover.showListA11y}
          icon="list"
          onPress={onClose}
        />
      </View>
      <MapTopControls
        filters={filters}
        onFiltersChange={onFiltersChange}
        onHeightChange={setHeaderHeight}
      />
    </View>
  );
}
