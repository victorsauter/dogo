import { searchParamsFor } from '@/api/walks';

import { formatDistance, MAX_SEARCH_RADIUS_KM, radiusForRegion } from '../geo';

const paris = { latitude: 48.8566, longitude: 2.3522 };

describe('radiusForRegion', () => {
  it('covers the visible area (half its diagonal)', () => {
    const radius = radiusForRegion({ ...paris, latitudeDelta: 0.08, longitudeDelta: 0.08 });
    // 4.45 km north-south, 2.94 km east-west at this latitude → 5.4 km.
    expect(radius).toBe(5.4);
  });

  it('is capped to the API maximum and has a floor', () => {
    expect(radiusForRegion({ ...paris, latitudeDelta: 10, longitudeDelta: 10 })).toBe(
      MAX_SEARCH_RADIUS_KM,
    );
    expect(radiusForRegion({ ...paris, latitudeDelta: 0.0001, longitudeDelta: 0.0001 })).toBe(0.5);
  });
});

describe('searchParamsFor', () => {
  const region = { ...paris, latitudeDelta: 0.08, longitudeDelta: 0.08 };
  const now = new Date('2026-11-18T08:00:20Z');

  it('derives the centre, the radius and the 7-day period', () => {
    expect(searchParamsFor(region, { period: 'week', size: 'all' }, now)).toEqual({
      lat: 48.8566,
      lng: 2.3522,
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
    const a = searchParamsFor({ ...region, latitude: 48.856612 }, { period: 'all', size: 'all' });
    const b = searchParamsFor({ ...region, latitude: 48.856641 }, { period: 'all', size: 'all' });
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
