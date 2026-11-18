import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import type MapView from 'react-native-maps';

import { enumValues, type DogSize } from '@/api/enums';
import {
  defaultWalkFilters,
  searchParamsFor,
  useWalkSearch,
  type PeriodFilter,
  type SizeFilter,
  type WalkFilters,
} from '@/api/walks';
import {
  Button,
  ChoiceGroup,
  EmptyState,
  ErrorState,
  Screen,
  Text,
  WalkCard,
  WalksMap,
} from '@/components';
import { DEFAULT_CENTER, regionAround, type MapRegion } from '@/lib/geo';
import { useDebouncedValue, useDelayedFlag } from '@/lib/hooks';
import { useUserLocation } from '@/lib/location';
import { enumLabel, plural, t } from '@/strings';
import { useTheme } from '@/theme';

const SEARCH_DEBOUNCE_MS = 400;
const LOADING_DELAY_MS = 300;

const periodOptions: { value: PeriodFilter; label: string }[] = [
  { value: 'today', label: t.discover.periodToday },
  { value: 'week', label: t.discover.periodWeek },
  { value: 'all', label: t.discover.periodAll },
];
const sizeOptions: { value: SizeFilter; label: string }[] = [
  { value: 'all', label: t.discover.sizeAll },
  ...enumValues.DogSize.map((size) => ({
    value: size as DogSize,
    label: enumLabel('DogSize', size),
  })),
];

/**
 * « Balades » tab: map of the walks around the user with the same walks listed
 * underneath. The search follows the visible map area.
 */
export default function DiscoverScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const location = useUserLocation();
  const map = useRef<MapView>(null);
  const [filters, setFilters] = useState<WalkFilters>(defaultWalkFilters);
  const [pannedRegion, setPannedRegion] = useState<MapRegion | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Centre on the user once the position is known; otherwise on the default centre.
  const located = location.status !== 'pending';
  const startRegion = useMemo(
    () => regionAround(location.coords ?? DEFAULT_CENTER),
    [location.coords],
  );
  useEffect(() => {
    if (located) map.current?.animateToRegion(startRegion, 300);
  }, [located, startRegion]);
  // Before the position is known the map shows the default centre: no search yet.
  const region = located ? (pannedRegion ?? startRegion) : null;

  const searchRegion = useDebouncedValue(region, SEARCH_DEBOUNCE_MS);
  const params = useMemo(
    () => (searchRegion ? searchParamsFor(searchRegion, filters) : null),
    [searchRegion, filters],
  );
  const search = useWalkSearch(params);
  const walks = search.data ?? [];
  const searching = useDelayedFlag(
    located && (search.isFetching || region !== searchRegion) && !refreshing,
    LOADING_DELAY_MS,
  );

  const openWalk = (id: string) => router.push({ pathname: '/walks/[id]', params: { id } });
  const createWalk = () => router.push('/walks/new');

  async function refresh() {
    setRefreshing(true);
    try {
      await search.refetch();
    } finally {
      setRefreshing(false);
    }
  }

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
    <Screen scroll={false} padded={false} edges={['top', 'left', 'right']}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm }}>
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
        <ChoiceGroup
          accessibilityLabel={t.discover.period}
          options={periodOptions}
          value={filters.period}
          onChange={(period) => setFilters((current) => ({ ...current, period }))}
        />
        <ChoiceGroup
          accessibilityLabel={t.discover.size}
          options={sizeOptions}
          value={filters.size}
          onChange={(size) => setFilters((current) => ({ ...current, size }))}
        />
        {location.status === 'denied' || location.status === 'unavailable' ? (
          <Text variant="caption" color="textMuted">
            {t.discover.locationDenied}
          </Text>
        ) : null}
      </View>
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
          onRegionChange={(next) => {
            if (located) setPannedRegion(next);
          }}
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
    </Screen>
  );
}
