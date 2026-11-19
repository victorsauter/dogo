import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import type { GeoPoint } from '@/api/types';
import { regionAround } from '@/lib/geo';
import { t } from '@/strings';
import { useTheme } from '@/theme';

import { FieldAnchor } from './FormScroll';
import { Text } from './Text';

export interface MeetingPointPickerProps {
  value: GeoPoint;
  onChange: (point: GeoPoint) => void;
  /** Moves the map (not the pin) when the user's position arrives after mount. */
  recenterOn?: GeoPoint | null;
  error?: string;
  name?: string;
}

const PICKER_DELTA = 0.01;

/** Map to place the meeting point: tap anywhere or drag the pin. */
export function MeetingPointPicker({
  value,
  onChange,
  recenterOn,
  error,
  name,
}: MeetingPointPickerProps) {
  const { colors, radii, spacing, dark } = useTheme();
  const map = useRef<MapView>(null);

  useEffect(() => {
    if (recenterOn) map.current?.animateToRegion(regionAround(recenterOn, PICKER_DELTA), 300);
  }, [recenterOn]);

  return (
    <FieldAnchor name={name} style={{ gap: spacing.xs }}>
      <Text variant="label">{t.walk.meetingPoint}</Text>
      <View
        style={{
          height: 240,
          borderRadius: radii.md,
          overflow: 'hidden',
          borderWidth: 1.5,
          borderColor: error ? colors.danger : colors.border,
        }}
      >
        <MapView
          ref={map}
          testID="meeting-point-map"
          userInterfaceStyle={dark ? 'dark' : 'light'}
          accessibilityLabel={t.walk.meetingPointMap}
          style={{ flex: 1 }}
          initialRegion={regionAround(value, PICKER_DELTA)}
          onPress={(event) => onChange(event.nativeEvent.coordinate)}
          showsUserLocation
          toolbarEnabled={false}
        >
          <Marker
            coordinate={value}
            draggable
            pinColor={colors.primary}
            onDragEnd={(event) => onChange(event.nativeEvent.coordinate)}
          />
        </MapView>
      </View>
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : (
        <Text variant="caption" color="textMuted">
          {t.walk.meetingPointHint}
        </Text>
      )}
    </FieldAnchor>
  );
}
