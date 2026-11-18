import BottomSheet, {
  BottomSheetFlatList,
  type BottomSheetFlatListMethods,
} from '@gorhom/bottom-sheet';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View, type LayoutChangeEvent } from 'react-native';
import type MapView from 'react-native-maps';

import type { WalkSearchResult } from '@/api/types';
import { defaultWalkFilters, type WalkFilters } from '@/api/walks';
import { EmptyState, ErrorState, Icon, LoadingState, Text, WalkCard, WalksMap } from '@/components';
import { DEFAULT_CENTER, regionAround } from '@/lib/geo';
import type { UserLocation } from '@/lib/location';
import { plural, t } from '@/strings';
import { useTheme } from '@/theme';

import { FiltersSheet } from './FiltersSheet';
import {
  ActiveFilterTags,
  byStartDate,
  DiscoverHeader,
  locationUnknown,
  useDiscoverNavigation,
  useMapAreaSearch,
} from './shared';

/** Panel positions: 0 low (handle and the top of the first card), 1 middle, 2 high. */
export type PanelPosition = 0 | 1 | 2;

/** What the handle button does at each position: low → middle → high → low. */
const NEXT_POSITION: Record<PanelPosition, PanelPosition> = { 0: 1, 1: 2, 2: 0 };
const HANDLE_ACTION: Record<PanelPosition, string> = {
  0: t.discover.panelShowList,
  1: t.discover.panelExpand,
  2: t.discover.panelShowMap,
};
const HANDLE_ICON = { 0: 'chevronUp', 1: 'chevronUp', 2: 'chevronDown' } as const;

/** Height of the top of the first card shown under the handle at the low position. */
const PEEK_HEIGHT = 72;

/**
 * « Panneau » view (the default): the map fills the tab, the walks of the
 * visible area live in a bottom panel with three positions. Filters stay above
 * the map (the high position stops under them). The panel's handle is a real
 * button that moves it (low → middle → high → low), so dragging is optional.
 * Tapping a pin brings its card to the top of the panel, highlighted.
 */
export function PanelLayout({ location }: { location: UserLocation }) {
  const { colors, radii, spacing } = useTheme();
  const { openWalk, createWalk } = useDiscoverNavigation();
  const map = useRef<MapView>(null);
  const sheet = useRef<BottomSheet>(null);
  const list = useRef<BottomSheetFlatListMethods>(null);
  const [filters, setFilters] = useState<WalkFilters>(defaultWalkFilters);
  const [position, setPosition] = useState<PanelPosition>(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [handleHeight, setHandleHeight] = useState(64);
  const [mapHeight, setMapHeight] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const located = location.status !== 'pending';
  const startRegion = useMemo(
    () => regionAround(location.coords ?? DEFAULT_CENTER),
    [location.coords],
  );
  const { search, walks, searching, refresh, onRegionChange, resultCount } = useMapAreaSearch({
    located,
    startRegion,
    filters,
    map,
  });
  const sorted = useMemo(() => byStartDate(walks), [walks]);

  // The low position follows the handle's real height (larger text makes it taller).
  // On a small screen with large text, half the area would barely differ from the
  // low position: the middle one then shows at least one more card's worth.
  const snapPoints = useMemo(() => {
    const low = handleHeight + PEEK_HEIGHT;
    if (mapHeight === 0) return [low, '50%', '100%'];
    const middle = Math.min(Math.max(mapHeight / 2, low + 140), mapHeight - 80);
    return [low, Math.max(middle, low + 1), '100%'];
  }, [handleHeight, mapHeight]);

  const moveTo = useCallback((next: PanelPosition) => {
    sheet.current?.snapToIndex(next);
  }, []);

  // The selected walk comes first in the panel: gorhom only scrolls the list at
  // the high position, so scrolling to it would not work at mid-height.
  const shown = useMemo(() => {
    const selected = sorted.find((walk) => walk.id === selectedId);
    return selected ? [selected, ...sorted.filter((walk) => walk !== selected)] : sorted;
  }, [sorted, selectedId]);

  function selectWalk(id: string | null) {
    setSelectedId(id);
    if (!id) return;
    if (position === 0) moveTo(1);
    list.current?.scrollToOffset({ offset: 0, animated: true });
  }

  const count = !located || search.isPending ? t.discover.panelLoading : searchCountLabel(sorted);
  const action = HANDLE_ACTION[position];

  const listEmpty =
    !located || search.isPending ? (
      <LoadingState />
    ) : search.isError ? (
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
    <View style={{ flex: 1 }}>
      <DiscoverHeader
        filters={filters}
        onFiltersChange={setFilters}
        onOpenFilters={() => setFiltersOpen(true)}
        notice={locationUnknown(location) ? t.discover.locationDenied : null}
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.sm,
          borderBottomWidth: 1,
          borderColor: colors.border,
        }}
      />
      <View
        style={{ flex: 1 }}
        onLayout={(event) => setMapHeight(Math.round(event.nativeEvent.layout.height))}
      >
        <WalksMap
          ref={map}
          initialRegion={startRegion}
          walks={walks}
          onRegionChange={onRegionChange}
          onOpenWalk={openWalk}
          onSelectWalk={selectWalk}
          selectedId={selectedId}
          // The panel opens at mid-height: centre the user in the half that stays visible.
          bottomInset={mapHeight / 2}
          searching={searching}
          showsUserLocation={location.status === 'granted'}
        />
        <BottomSheet
          ref={sheet}
          index={1}
          snapPoints={snapPoints}
          enableDynamicSizing={false}
          enablePanDownToClose={false}
          // Follow the target position as soon as a drag or a button starts the move.
          onAnimate={(_from, to) => {
            if (to >= 0) setPosition(to as PanelPosition);
          }}
          onChange={(index) => {
            if (index < 0) return;
            setPosition(index as PanelPosition);
            // Low shows the top of the first card, whatever was scrolled before.
            if (index === 0) list.current?.scrollToOffset({ offset: 0, animated: false });
          }}
          handleComponent={null}
          // The panel itself is not one accessible element: its handle and cards are.
          accessible={false}
          backgroundStyle={{
            backgroundColor: colors.background,
            borderTopLeftRadius: radii.lg,
            borderTopRightRadius: radii.lg,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: -2 },
            elevation: 12,
          }}
        >
          <View
            // The handle's real height (with its refresh button) sets the low position.
            onLayout={(event: LayoutChangeEvent) => {
              const height = Math.ceil(event.nativeEvent.layout.height);
              if (Math.abs(height - handleHeight) > 1) setHandleHeight(height);
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <Pressable
                testID="panel-handle"
                accessibilityRole="button"
                accessibilityLabel={`${count}. ${action}`}
                accessibilityHint={t.discover.panelA11yHint}
                accessibilityValue={{ min: 0, max: 2, now: position }}
                onPress={() => moveTo(NEXT_POSITION[position])}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingLeft: spacing.lg,
                  paddingRight: spacing.xs,
                  paddingTop: spacing.sm,
                  paddingBottom: spacing.md,
                  gap: spacing.sm,
                  borderTopLeftRadius: radii.lg,
                  backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
                })}
              >
                <View
                  style={{
                    alignSelf: 'center',
                    width: 44,
                    height: 5,
                    borderRadius: radii.pill,
                    backgroundColor: colors.border,
                  }}
                />
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    columnGap: spacing.md,
                    rowGap: spacing.xs,
                  }}
                >
                  {/* Own line when the buttons leave no room; shrinks rather than being cut. */}
                  <Text variant="subheading" style={{ flexShrink: 1 }}>
                    {count}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.xs,
                      minHeight: 36,
                      paddingHorizontal: spacing.md,
                      borderRadius: radii.pill,
                      borderWidth: 1.5,
                      borderColor: colors.primary,
                      backgroundColor: colors.surface,
                    }}
                  >
                    <Text variant="label" color="primary">
                      {action}
                    </Text>
                    <Icon name={HANDLE_ICON[position]} color="primary" size={18} />
                  </View>
                </View>
              </Pressable>
              {/* Beside the handle, not inside it (a button cannot nest in a button), at the
                height of its second row. */}
              <View style={{ paddingRight: spacing.sm, paddingBottom: spacing.xs }}>
                <RefreshButton busy={search.isFetching} onPress={() => void refresh()} />
              </View>
            </View>
            {/* Inside the measured block: the low position leaves room for the label. */}
            <ActiveFilterTags
              filters={filters}
              onFiltersChange={setFilters}
              style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}
            />
          </View>
          {/* No pull-to-refresh here: at the high position it captures the downward
              drag meant to lower the panel. The refresh button next to the handle, coming
              back to the tab, moving the map or a filter search again. */}
          <BottomSheetFlatList
            ref={list}
            testID="walks-panel-list"
            data={shown}
            extraData={selectedId}
            keyExtractor={(walk: WalkSearchResult) => walk.id}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.xl,
              gap: spacing.md,
              flexGrow: 1,
            }}
            renderItem={({ item }: { item: WalkSearchResult }) => (
              <WalkCard
                walk={item}
                origin={location.coords}
                selected={item.id === selectedId}
                onPress={() => openWalk(item.id)}
              />
            )}
            ListEmptyComponent={listEmpty}
          />
        </BottomSheet>
      </View>
      <FiltersSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onFiltersChange={setFilters}
        resultCount={resultCount}
      />
    </View>
  );
}

/** Discreet icon button of the panel header: spinner while the walks are being fetched. */
function RefreshButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const { colors, radii, minTouchSize } = useTheme();
  return (
    <Pressable
      testID="panel-refresh"
      accessibilityRole="button"
      accessibilityLabel={t.discover.refresh}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({
        width: minTouchSize,
        height: minTouchSize,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radii.pill,
        backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Icon name="refresh" color="primary" size={20} />
      )}
    </Pressable>
  );
}

function searchCountLabel(walks: readonly WalkSearchResult[]): string {
  return walks.length === 0 ? t.discover.emptyTitle : plural(t.discover.zoneCount, walks.length);
}
