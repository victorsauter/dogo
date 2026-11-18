import {
  defaultWalkStart,
  endOfDay,
  formatDay,
  formatDuration,
  formatTime,
  formatWalkStart,
  walkTiming,
} from '../dates';

// Jest runs in TZ=UTC unless configured: local and UTC days coincide here.
const now = new Date(2026, 10, 18, 9, 0); // mercredi 18 novembre 2026, 09:00

describe('walk dates in French', () => {
  it('names today, tomorrow and yesterday', () => {
    expect(formatDay(new Date(2026, 10, 18, 18, 0), now)).toBe('Aujourd’hui');
    expect(formatDay(new Date(2026, 10, 19, 8, 0), now)).toBe('Demain');
    expect(formatDay(new Date(2026, 10, 17, 8, 0), now)).toBe('Hier');
  });

  it('writes other days in full, with the year only when it differs', () => {
    expect(formatDay(new Date(2026, 10, 21, 10, 0), now)).toBe('samedi 21 novembre');
    expect(formatDay(new Date(2027, 0, 4, 10, 0), now)).toBe('lundi 4 janvier 2027');
  });

  it('formats the time on 24 hours and the start sentence', () => {
    expect(formatTime(new Date(2026, 10, 19, 9, 5))).toBe('09:05');
    expect(formatWalkStart(new Date(2026, 10, 19, 14, 30), now)).toBe('Demain à 14:30');
  });

  it('reads API instants (UTC) in the device time zone', () => {
    const instant = new Date(2026, 10, 19, 14, 30).toISOString();
    expect(formatWalkStart(instant, now)).toBe('Demain à 14:30');
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30');
    expect(formatDuration(135)).toBe('2 h 15');
  });

  it('tells upcoming, started and past walks apart', () => {
    const walk = { startsAt: new Date(2026, 10, 18, 10, 0).toISOString(), durationMinutes: 60 };
    expect(walkTiming(walk, new Date(2026, 10, 18, 9, 59))).toBe('upcoming');
    expect(walkTiming(walk, new Date(2026, 10, 18, 10, 30))).toBe('started');
    expect(walkTiming(walk, new Date(2026, 10, 18, 11, 1))).toBe('past');
  });

  it('gives the end of the day and the default start of a new walk', () => {
    expect(endOfDay(now)).toEqual(new Date(2026, 10, 18, 23, 59, 59, 999));
    expect(defaultWalkStart(now)).toEqual(new Date(2026, 10, 19, 10, 0, 0, 0));
  });
});
