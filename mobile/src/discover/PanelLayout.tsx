import BottomSheet, {
  BottomSheetFlatList,
  type BottomSheetBackgroundProps,
  type BottomSheetFlatListMethods,
} from '@gorhom/bottom-sheet';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import type MapView from 'react-native-maps';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import type { WalkSearchResult } from '@/api/types';
import { isSearchCapped } from '@/api/walks';
import {
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  Material,
  Text,
  WalkCard,
  WalksMap,
} from '@/components';
import { DEFAULT_CENTER, regionAround } from '@/lib/geo';
import { haptics } from '@/lib/haptics';
import type { UserLocation } from '@/lib/location';
import { format, plural, t } from '@/strings';
import { useTheme } from '@/theme';

import {
  byStartDate,
  LocateButton,
  locationNoticeAction,
  locationUnknown,
  MapTopControls,
  useDiscoverNavigation,
  useMapAreaSearch,
  type DiscoverFilterState,
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
/** Size of the grabber at the top of the panel (as on iOS sheets). */
const GRABBER = { width: 36, height: 5 };

/**
 * « Panneau » view (the default): the map fills the tab up to the top of the
 * screen, with controls floating over it (filter pills, « Créer »); the walks
 * of the visible area live in a bottom panel with three positions, the high
 * one stopping under the controls. The panel's handle is a real button that
 * moves it (low → middle → high → low), so dragging is optional. Tapping a pin
 * brings its card to the top of the panel, highlighted.
 */
export function PanelLayout({
  location,
  filterState,
}: {
  location: UserLocation;
  filterState: DiscoverFilterState;
}) {
  const { colors, radii, spacing, shadows, minTouchSize, controlHeight } = useTheme();
  const { openWalk, createWalk } = useDiscoverNavigation();
  const { filters, setFilters } = filterState;
  const map = useRef<MapView>(null);
  const sheet = useRef<BottomSheet>(null);
  const list = useRef<BottomSheetFlatListMethods>(null);
  const [position, setPosition] = useState<PanelPosition>(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [handleHeight, setHandleHeight] = useState(64);
  const [containerHeight, setContainerHeight] = useState(0);
  const [controlsHeight, setControlsHeight] = useState(0);
  // Top of the panel in the view, followed frame by frame (drag or snap).
  const sheetTop = useSharedValue(0);

  const located = location.status !== 'pending';
  const startRegion = useMemo(
    () => regionAround(location.coords ?? DEFAULT_CENTER),
    [location.coords],
  );
  const { search, walks, searching, refresh, onRegionChange } = useMapAreaSearch({
    located,
    startRegion,
    filters,
    map,
  });
  const sorted = useMemo(() => byStartDate(walks), [walks]);

  // The low position follows the handle's real height (larger text makes it taller).
  // On a small screen with large text, half the visible map would barely differ from
  // the low position: the middle one then shows at least one more card's worth.
  const { snapPoints, lowHeight, middleHeight } = useMemo(() => {
    const low = handleHeight + PEEK_HEIGHT;
    const visible = containerHeight - controlsHeight;
    if (visible <= 0) {
      return { snapPoints: [low, '50%', '100%'], lowHeight: low, middleHeight: low + 140 };
    }
    const middle = Math.max(Math.min(Math.max(visible / 2, low + 140), visible - 80), low + 1);
    return { snapPoints: [low, middle, '100%'], lowHeight: low, middleHeight: middle };
  }, [handleHeight, containerHeight, controlsHeight]);

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
    haptics.selection();
    if (position === 0) moveTo(1);
    list.current?.scrollToOffset({ offset: 0, animated: true });
  }

  // « Ma position » rides on the panel's top edge, never above the controls at
  // the top (while the panel is dragged up); it gives way at the high position.
  const locateStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: Math.max(sheetTop.value - minTouchSize - spacing.sm, controlsHeight) },
    ],
  }));

  // The map's own controls (the « Plans » logo, « Légal ») sit just above the
  // panel where it rests, low or middle; at the high position the list covers
  // the map, so they stay where they were. This follows the position the panel
  // is heading to, not each frame of a drag, and only moves those controls:
  // the area searched is the whole map, under the panel too, so moving the
  // panel searches nothing and the count does not change. On iOS the padding
  // only moves those controls (checked); Google Maps (Android) would recentre
  // the camera on each change, so there it keeps the middle position's.
  const coveredBottom = Platform.OS === 'ios' && position === 0 ? lowHeight : middleHeight;

  const count =
    !located || search.isPending
      ? t.discover.panelLoading
      : search.isError && sorted.length === 0
        ? t.discover.panelError
        : searchCountLabel(sorted);
  const action = HANDLE_ACTION[position];

  const listEmpty =
    !located || search.isPending ? (
      <LoadingState />
    ) : search.isError ? (
      <ErrorState error={search.error} onRetry={() => search.refetch()} />
    ) : (
      <EmptyState
        icon="paw"
        title={t.discover.emptyTitle}
        message={t.discover.emptyMessage}
        action={{ label: t.discover.emptyAction, onPress: createWalk }}
      />
    );

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(event) => setContainerHeight(Math.round(event.nativeEvent.layout.height))}
    >
      <WalksMap
        ref={map}
        initialRegion={startRegion}
        walks={walks}
        onRegionChange={onRegionChange}
        onOpenWalk={openWalk}
        onSelectWalk={selectWalk}
        selectedId={selectedId}
        topInset={controlsHeight}
        bottomInset={coveredBottom}
        searching={searching}
        showsUserLocation={location.status === 'granted'}
      />
      {/* At the high position the list covers the map: the button gives way. */}
      <Animated.View
        testID="locate-anchor"
        pointerEvents={position === 2 ? 'none' : 'box-none'}
        accessibilityElementsHidden={position === 2}
        importantForAccessibility={position === 2 ? 'no-hide-descendants' : 'auto'}
        // The button (not its larger touch area) keeps the screen's margin.
        style={[
          { position: 'absolute', top: 0, right: spacing.lg - (minTouchSize - controlHeight) / 2 },
          locateStyle,
        ]}
      >
        <LocateButton location={location} map={map} hidden={position === 2} />
      </Animated.View>
      <BottomSheet
        ref={sheet}
        index={1}
        snapPoints={snapPoints}
        topInset={controlsHeight}
        animatedPosition={sheetTop}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        // Follow the target position as soon as a drag or a button starts the move.
        onAnimate={(from, to) => {
          if (to < 0) return;
          if (from >= 0 && to !== from) haptics.selection();
          setPosition(to as PanelPosition);
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
        backgroundComponent={PanelBackground}
        style={shadows.panel}
      >
        <View
          // The handle's real height (with its refresh button) sets the low position.
          onLayout={(event: LayoutChangeEvent) => {
            const height = Math.ceil(event.nativeEvent.layout.height);
            if (Math.abs(height - handleHeight) > 1) setHandleHeight(height);
          }}
          style={{ paddingTop: spacing.sm }}
        >
          <View
            pointerEvents="none"
            style={{
              alignSelf: 'center',
              width: GRABBER.width,
              height: GRABBER.height,
              borderRadius: radii.pill,
              backgroundColor: colors.border,
            }}
          />
          {/* One line: the count on the left, the panel's actions on the right. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: spacing.xs }}>
            <Pressable
              testID="panel-handle"
              accessibilityRole="button"
              accessibilityLabel={`${count}. ${action}`}
              accessibilityHint={t.discover.panelA11yHint}
              accessibilityValue={{ min: 0, max: 2, now: position }}
              onPress={() => moveTo(NEXT_POSITION[position])}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                minHeight: minTouchSize,
                paddingLeft: spacing.lg,
              }}
            >
              {({ pressed }) => (
                <>
                  {/* Wraps with large text rather than being cut. */}
                  <Text variant="subheading" style={{ flex: 1 }}>
                    {count}
                  </Text>
                  <View
                    style={{
                      width: minTouchSize - spacing.lg,
                      height: minTouchSize - spacing.lg,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: radii.pill,
                      backgroundColor: pressed ? colors.border : colors.surfaceMuted,
                    }}
                  >
                    <Icon name={HANDLE_ICON[position]} color="textMuted" size={14} />
                  </View>
                </>
              )}
            </Pressable>
            {/* Beside the handle, not inside it: a button cannot nest in a button. */}
            <RefreshButton busy={search.isFetching} onPress={() => void refresh()} />
          </View>
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
            paddingTop: spacing.xs,
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
      <MapTopControls
        filters={filters}
        onFiltersChange={setFilters}
        onCreate={createWalk}
        notice={locationUnknown(location) ? t.discover.locationDenied : null}
        noticeAction={locationNoticeAction(location)}
        onHeightChange={setControlsHeight}
      />
    </View>
  );
}

/**
 * The panel's background: the floating material at the low and middle
 * positions, where it sits over the map like the pills; it turns opaque on the
 * way to the high position, where it holds a long list (as iOS sheets do).
 * The fade is a layer inside the material: glass must keep its full opacity.
 * At rest the layer already veils the glass a little (`PANEL_VEIL`), so that
 * the panel leans towards the warm background rather than the green of the map.
 */
/** Opacity of the background layer over the panel's glass at the low and middle positions. */
const PANEL_VEIL = 0.5;

function PanelBackground({ style, animatedIndex }: BottomSheetBackgroundProps) {
  const { colors, radii } = useTheme();
  const corners = { borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg };
  const opaqueStyle = useAnimatedStyle(() => ({
    opacity: interpolate(animatedIndex.value, [1, 2], [PANEL_VEIL, 1], Extrapolation.CLAMP),
  }));
  return (
    <Material style={[style, corners]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          corners,
          { backgroundColor: colors.background },
          opaqueStyle,
        ]}
      />
    </Material>
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
        <Icon name="refresh" color="primary" size={18} />
      )}
    </Pressable>
  );
}

function searchCountLabel(walks: readonly WalkSearchResult[]): string {
  if (walks.length === 0) return t.discover.emptyTitle;
  if (isSearchCapped(walks.length)) {
    return format(t.discover.zoneCountPartial, { count: walks.length });
  }
  return plural(t.discover.zoneCount, walks.length);
}
