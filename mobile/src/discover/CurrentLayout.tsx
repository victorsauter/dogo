import { useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import type MapView from 'react-native-maps';

import { defaultWalkFilters, type WalkFilters } from '@/api/walks';
import { EmptyState, ErrorState, Text, WalkCard, WalksMap } from '@/components';
import { DEFAULT_CENTER, regionAround } from '@/lib/geo';
import type { UserLocation } from '@/lib/location';
import { plural, t } from '@/strings';
import { useTheme } from '@/theme';

import { DiscoverHeader, locationUnknown, useDiscoverNavigation, useMapAreaSearch } from './shared';

/**
 * Current layout: map of the walks around the user (top ~36 %) with the same
 * walks listed underneath. The search follows the visible map area.
 */
export function CurrentLayout({ location }: { location: UserLocation }) {
  const { colors, spacing } = useTheme();
  const { openWalk, createWalk } = useDiscoverNavigation();
  const map = useRef<MapView>(null);
  const [filters, setFilters] = useState<WalkFilters>(defaultWalkFilters);

  // Centre on the user once the position is known; otherwise on the default centre.
  const located = location.status !== 'pending';
  const startRegion = useMemo(
    () => regionAround(location.coords ?? DEFAULT_CENTER),
    [location.coords],
  );
  const { search, walks, searching, refreshing, refresh, onRegionChange } = useMapAreaSearch({
    located,
    startRegion,
    filters,
    map,
  });

  const listEmpty =
    !located || search.isPending ? undefined : search.isError ? (
      <ErrorState error={search.error} onRetry={() => search.refetch()} />
    ) : (
      <EmptyState
        icon="map"
        title={t.discover.emptyTitle}
        message={t.discover.emptyMessage}
        action={{ label: t.discover.emptyAction, onPress: createWalk }}
      />
    );

  return (
    // Same spacing as before the prototype: the screen's gap between header, map and list.
    <View style={{ flex: 1, gap: spacing.lg }}>
      <DiscoverHeader
        filters={filters}
        onFiltersChange={setFilters}
        notice={locationUnknown(location) ? t.discover.locationDenied : null}
        style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}
      />
      <View
        style={{
          height: '36%',
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: colors.border,
        }}
      >
        <WalksMap
          ref={map}
          initialRegion={startRegion}
          walks={walks}
          onRegionChange={onRegionChange}
          onOpenWalk={openWalk}
          searching={searching}
          showsUserLocation={location.status === 'granted'}
        />
      </View>
      <FlatList
        style={{ flex: 1 }}
        data={walks}
        keyExtractor={(walk) => walk.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
        ListHeaderComponent={
          walks.length > 0 ? (
            <Text variant="caption" color="textMuted">
              {plural(t.discover.resultCount, walks.length)}
            </Text>
          ) : undefined
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
    </View>
  );
}
