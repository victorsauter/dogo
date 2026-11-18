import type { GeoPoint } from '@/api/types';
import { config } from '@/lib/config';

/** A visible map area, as `react-native-maps` describes it. */
export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Search radius limit of `GET /walks` (`radiusKm`, 100 at most). */
export const MAX_SEARCH_RADIUS_KM = 100;
const MIN_SEARCH_RADIUS_KM = 0.5;
const KM_PER_DEGREE = 111.32;

/**
 * Where the map opens when the position is unknown: Seppois-le-Haut, where the
 * pilot starts, unless `EXPO_PUBLIC_DEFAULT_LATITUDE`/`_LONGITUDE` say otherwise.
 */
export const DEFAULT_CENTER: GeoPoint = config.defaultCenter;

/** About 8 km across: a neighbourhood and its surroundings. */
export const NEIGHBOURHOOD_DELTA = 0.08;

export function regionAround(point: GeoPoint, delta: number = NEIGHBOURHOOD_DELTA): MapRegion {
  return { ...point, latitudeDelta: delta, longitudeDelta: delta };
}

/**
 * Radius (km) of the circle that covers the visible area: half its diagonal,
 * capped to the API maximum and rounded up to 100 m so tiny pans reuse the cache.
 */
export function radiusForRegion(region: MapRegion): number {
  const halfHeight = (region.latitudeDelta / 2) * KM_PER_DEGREE;
  const halfWidth =
    (region.longitudeDelta / 2) * KM_PER_DEGREE * Math.cos((region.latitude * Math.PI) / 180);
  const radius = Math.ceil(Math.hypot(halfHeight, halfWidth) * 10) / 10;
  return Math.min(MAX_SEARCH_RADIUS_KM, Math.max(MIN_SEARCH_RADIUS_KM, radius));
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in metres. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

const kmFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** « 350 m », « 2,4 km », « 12 km » */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  const km = meters / 1000;
  return `${km >= 10 ? Math.round(km) : kmFormat.format(km)} km`;
}

/** Rounds a coordinate to about 10 m, to keep query keys stable while panning. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
