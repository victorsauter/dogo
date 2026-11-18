import { forwardRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import type { WalkSummary } from '@/api/types';
import { formatWalkStart } from '@/lib/dates';
import type { MapRegion } from '@/lib/geo';
import { t } from '@/strings';
import { useTheme } from '@/theme';

import { Material } from './Material';
import { Text } from './Text';

export interface WalksMapProps {
  initialRegion: MapRegion;
  walks: readonly WalkSummary[];
  onRegionChange: (region: MapRegion) => void;
  onOpenWalk: (id: string) => void;
  /**
   * When given, tapping a pin selects its walk (no native callout): the screen
   * shows the walk itself. Tapping the map elsewhere selects nothing (`null`).
   */
  onSelectWalk?: (id: string | null) => void;
  /** The selected walk's pin is drawn larger, in the text colour. */
  selectedId?: string | null;
  /** Shows a « Recherche… » pill over the map. */
  searching?: boolean;
  showsUserLocation?: boolean;
  /** Height (pt) covered at the bottom by a panel: centring and the map's logo stay above it. */
  bottomInset?: number;
  /** Height (pt) covered at the top by a floating header: centring and controls stay below it. */
  topInset?: number;
}

/** Height of the « Recherche… » capsule. */
const SEARCHING_HEIGHT = 32;

/** Map of walks: one pin per walk (`pro` colour for professional walks), callout opens it. */
export const WalksMap = forwardRef<MapView, WalksMapProps>(function WalksMap(
  {
    initialRegion,
    walks,
    onRegionChange,
    onOpenWalk,
    onSelectWalk,
    selectedId,
    searching,
    showsUserLocation,
    bottomInset = 0,
    topInset = 0,
  },
  ref,
) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={ref}
        testID="walks-map"
        accessibilityLabel={t.discover.mapLabel}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        onRegionChangeComplete={(region) => onRegionChange(region)}
        showsUserLocation={showsUserLocation}
        toolbarEnabled={false}
        mapPadding={
          bottomInset > 0 || topInset > 0
            ? { top: topInset, left: 0, right: 0, bottom: bottomInset }
            : undefined
        }
        onPress={
          onSelectWalk
            ? (event) => {
                // iOS also reports pin taps to the map, flagged as such.
                if (event.nativeEvent.action !== 'marker-press') onSelectWalk(null);
              }
            : undefined
        }
      >
        {walks.map((walk) =>
          onSelectWalk ? (
            <Marker
              key={walk.id}
              identifier={walk.id}
              coordinate={walk.location}
              accessibilityLabel={`${walk.title}, ${formatWalkStart(walk.startsAt)}`}
              pinColor={
                walk.id === selectedId
                  ? colors.text
                  : walk.isProfessional
                    ? colors.pro
                    : colors.primary
              }
              zIndex={walk.id === selectedId ? 1 : 0}
              onPress={() => onSelectWalk(walk.id)}
            />
          ) : (
            <Marker
              key={walk.id}
              identifier={walk.id}
              coordinate={walk.location}
              title={walk.title}
              description={formatWalkStart(walk.startsAt)}
              pinColor={walk.isProfessional ? colors.pro : colors.primary}
              onCalloutPress={() => onOpenWalk(walk.id)}
            />
          ),
        )}
      </MapView>
      {searching ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t.discover.searching}
          style={{ position: 'absolute', top: topInset + spacing.sm, alignSelf: 'center' }}
        >
          <Material
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              minHeight: SEARCHING_HEIGHT,
              paddingHorizontal: spacing.md,
              borderRadius: SEARCHING_HEIGHT / 2,
            }}
          >
            <ActivityIndicator size="small" color={colors.primary} />
            <Text variant="caption">{t.discover.searching}</Text>
          </Material>
        </View>
      ) : null}
    </View>
  );
});
