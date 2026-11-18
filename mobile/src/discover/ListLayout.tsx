import { useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import type MapView from 'react-native-maps';

import type { WalkSearchResult } from '@/api/types';
import {
  DEFAULT_SEARCH_RADIUS_KM,
  defaultWalkFilters,
  searchParamsAround,
  type SearchRadiusKm,
  type WalkFilters,
} from '@/api/walks';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Text,
  WalkCard,
  WalksMap,
} from '@/components';
import { DEFAULT_CENTER, regionForRadius, type MapRegion } from '@/lib/geo';
import type { UserLocation } from '@/lib/location';
import { plural, t } from '@/strings';
import { useTheme } from '@/theme';

import {
  byStartDate,
  DiscoverHeader,
  FLOATING_BUTTON_HEIGHT,
  FloatingButton,
  locationUnknown,
  MapNotice,
  useDiscoverNavigation,
  useMapAreaSearch,
  useRefreshableSearch,
} from './shared';

/**
 * Layout A, « Liste, carte à la demande »: the walks within a radius of the
 * user (or of the default centre), soonest first, over the whole screen. A
 * floating « Carte » button opens a full-screen map with the same filters,
 * where the search follows the visible area and a tapped pin shows its walk.
 * The list stays mounted under the map, so its scroll position survives.
 */
export function ListLayout({ location }: { location: UserLocation }) {
  const { colors, spacing } = useTheme();
  const { openWalk, createWalk } = useDiscoverNavigation();
  const [filters, setFilters] = useState<WalkFilters>(defaultWalkFilters);
  const [radiusKm, setRadiusKm] = useState<SearchRadiusKm>(DEFAULT_SEARCH_RADIUS_KM);
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
        <FlatList
          testID="walks-list"
          style={{ flex: 1 }}
          data={sorted}
          keyExtractor={(walk) => walk.id}
          contentContainerStyle={{
            padding: spacing.lg,
            paddingTop: spacing.sm,
            // Room for the floating « Carte » button below the last card.
            paddingBottom: FLOATING_BUTTON_HEIGHT + spacing.lg * 2,
            gap: spacing.md,
            flexGrow: 1,
          }}
          ListHeaderComponent={
            <View style={{ gap: spacing.md }}>
              <DiscoverHeader
                filters={filters}
                onFiltersChange={setFilters}
                radius={{ value: radiusKm, onChange: setRadiusKm }}
                notice={locationUnknown(location) ? t.discover.listLocationDenied : null}
              />
              {sorted.length > 0 ? (
                <Text variant="caption" color="textMuted">
                  {plural(t.discover.resultCount, sorted.length)}
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
            />
          }
        />
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
 * The full-screen map of layout A: same filters as the list, search on the
 * visible area, its last area reported to the parent (`onAreaChange`).
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
  filters: WalkFilters;
  onFiltersChange: (update: (current: WalkFilters) => WalkFilters) => void;
  startRegion: MapRegion;
  onAreaChange: (region: MapRegion) => void;
  onClose: () => void;
  onOpenWalk: (id: string) => void;
}) {
  const { colors, radii, spacing, minTouchSize } = useTheme();
  const map = useRef<MapView>(null);
  const located = location.status !== 'pending';
  // Fixed for this opening: the map must not jump when the reported area comes back as a prop.
  const [initialRegion] = useState(startRegion);
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
      <DiscoverHeader
        filters={filters}
        onFiltersChange={onFiltersChange}
        showTitle={false}
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.sm,
          borderBottomWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        }}
      />
      <View style={{ flex: 1 }}>
        <WalksMap
          ref={map}
          initialRegion={initialRegion}
          walks={walks}
          onRegionChange={(region) => {
            onRegionChange(region);
            onAreaChange(region);
          }}
          onOpenWalk={onOpenWalk}
          onSelectWalk={(id) => setSelected(id ? (walks.find((w) => w.id === id) ?? null) : null)}
          selectedId={selected?.id}
          searching={searching}
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
          {notice}
          {selected ? (
            <View
              testID="selected-walk"
              style={{
                gap: spacing.xs,
                padding: spacing.sm,
                borderRadius: radii.lg,
                backgroundColor: colors.surfaceMuted,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.sm,
                  minHeight: minTouchSize,
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
            </View>
          ) : null}
          <FloatingButton
            label={t.discover.showList}
            accessibilityLabel={t.discover.showListA11y}
            icon="list"
            onPress={onClose}
          />
        </View>
      </View>
    </View>
  );
}
