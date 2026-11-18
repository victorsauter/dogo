import { searchParamsAround, searchParamsFor } from '@/api/walks';

import {
  DEFAULT_CENTER,
  formatDistance,
  MAX_SEARCH_RADIUS_KM,
  radiusForRegion,
  regionForRadius,
} from '../geo';

const seppois = { latitude: 47.5339, longitude: 7.1844 };

describe('DEFAULT_CENTER', () => {
  it('is Seppois-le-Haut when no default position is configured', () => {
    expect(DEFAULT_CENTER).toEqual(seppois);
  });
});

describe('radiusForRegion', () => {
  it('covers the visible area (half its diagonal)', () => {
    const radius = radiusForRegion({ ...seppois, latitudeDelta: 0.08, longitudeDelta: 0.08 });
    // 4.45 km north-south, 3.01 km east-west at this latitude → 5.4 km.
    expect(radius).toBe(5.4);
  });

  it('is capped to the API maximum and has a floor', () => {
    expect(radiusForRegion({ ...seppois, latitudeDelta: 10, longitudeDelta: 10 })).toBe(
      MAX_SEARCH_RADIUS_KM,
    );
    expect(radiusForRegion({ ...seppois, latitudeDelta: 0.0001, longitudeDelta: 0.0001 })).toBe(
      0.5,
    );
  });
});

describe('searchParamsFor', () => {
  const region = { ...seppois, latitudeDelta: 0.08, longitudeDelta: 0.08 };
  const now = new Date('2026-11-18T08:00:20Z');

  it('derives the centre, the radius and the 7-day period', () => {
    expect(searchParamsFor(region, { period: 'week', size: 'all' }, now)).toEqual({
      lat: 47.5339,
      lng: 7.1844,
      radiusKm: 5.4,
      limit: 100,
      to: '2026-11-25T08:01:00.000Z',
    });
  });

  it('limits to the end of today and to one size', () => {
    const params = searchParamsFor(region, { period: 'today', size: 'Large' }, now);
    expect(params.size).toBe('Large');
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    expect(params.to).toBe(end.toISOString());
  });

  it('sends no end and no size for « Toutes » and « Tous »', () => {
    const params = searchParamsFor(region, { period: 'all', size: 'all' }, now);
    expect(params.to).toBeUndefined();
    expect(params.size).toBeUndefined();
  });

  it('rounds the centre so tiny pans share the cache', () => {
    const a = searchParamsFor({ ...region, latitude: 47.533912 }, { period: 'all', size: 'all' });
    const b = searchParamsFor({ ...region, latitude: 47.533941 }, { period: 'all', size: 'all' });
    expect(a.lat).toBe(b.lat);
  });
});

describe('formatDistance', () => {
  it('uses metres then kilometres, French decimals', () => {
    expect(formatDistance(342)).toBe('340 m');
    expect(formatDistance(2440)).toBe('2,4 km');
    expect(formatDistance(12_400)).toBe('12 km');
  });
});

describe('search around a point (list-first layout)', () => {
  it('searches the chosen radius around the point, with the filters', () => {
    const params = searchParamsAround(seppois, 25, { period: 'all', size: 'Small' });
    expect(params).toEqual({ lat: 47.5339, lng: 7.1844, radiusKm: 25, limit: 100, size: 'Small' });
  });

  it('opens the map on a region that shows the whole circle', () => {
    const region = regionForRadius(seppois, 10);
    expect(region).toMatchObject(seppois);
    expect(radiusForRegion(region)).toBeGreaterThanOrEqual(10);
  });
});
