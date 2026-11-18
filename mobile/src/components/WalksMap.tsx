import { forwardRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import type { WalkSummary } from '@/api/types';
import { formatWalkStart } from '@/lib/dates';
import type { MapRegion } from '@/lib/geo';
import { t } from '@/strings';
import { useTheme } from '@/theme';

import { Text } from './Text';

export interface WalksMapProps {
  initialRegion: MapRegion;
  walks: readonly WalkSummary[];
  onRegionChange: (region: MapRegion) => void;
  onOpenWalk: (id: string) => void;
  /** Shows a « Recherche… » pill over the map. */
  searching?: boolean;
  showsUserLocation?: boolean;
}

/** Map of walks: one pin per walk (accent colour for professional walks), callout opens it. */
export const WalksMap = forwardRef<MapView, WalksMapProps>(function WalksMap(
  { initialRegion, walks, onRegionChange, onOpenWalk, searching, showsUserLocation },
  ref,
) {
  const { colors, radii, spacing } = useTheme();
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
      >
        {walks.map((walk) => (
          <Marker
            key={walk.id}
            identifier={walk.id}
            coordinate={walk.location}
            title={walk.title}
            description={formatWalkStart(walk.startsAt)}
            pinColor={walk.isProfessional ? colors.accent : colors.primary}
            onCalloutPress={() => onOpenWalk(walk.id)}
          />
        ))}
      </MapView>
      {searching ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t.discover.searching}
          style={{
            position: 'absolute',
            top: spacing.sm,
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
            borderRadius: radii.pill,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <ActivityIndicator size="small" color={colors.primary} />
          <Text variant="caption">{t.discover.searching}</Text>
        </View>
      ) : null}
    </View>
  );
});
