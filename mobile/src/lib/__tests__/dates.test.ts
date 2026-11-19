import {
  defaultWalkStart,
  endOfDay,
  formatDay,
  formatDuration,
  formatTime,
  formatWalkStart,
  walkEnd,
  walkTiming,
} from '../dates';

// Jest runs in TZ=Europe/Paris (jest.global-setup.js): local days and UTC days differ here,
// and the clocks change on 29 March and 25 October 2026.
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

describe('the time zone of the tests', () => {
  it('is Europe/Paris: UTC+1 in winter, UTC+2 in summer', () => {
    expect(new Date('2026-01-15T12:00:00Z').getTimezoneOffset()).toBe(-60);
    expect(new Date('2026-07-15T12:00:00Z').getTimezoneOffset()).toBe(-120);
  });

  it('reads an API instant in local time, not in UTC', () => {
    expect(formatTime('2026-11-19T08:30:00Z')).toBe('09:30');
    expect(formatTime('2026-07-19T08:30:00Z')).toBe('10:30');
  });
});

// Clocks go forward on Sunday 29 March 2026 (02:00 becomes 03:00, a 23-hour day)
// and back on Sunday 25 October 2026 (03:00 becomes 02:00, a 25-hour day).
describe('around the change to summer time (29 March 2026)', () => {
  it('shows an instant on both sides of the change in the right local time', () => {
    expect(formatTime('2026-03-29T00:59:00Z')).toBe('01:59'); // CET
    expect(formatTime('2026-03-29T01:00:00Z')).toBe('03:00'); // CEST: 02:xx never exists
    expect(formatTime('2026-03-29T01:30:00Z')).toBe('03:30');
  });

  it('keeps « Demain » and « Aujourd’hui » by calendar day, not by 24 hours', () => {
    const lateEvening = new Date(2026, 2, 28, 23, 30); // Saturday, 23:30
    expect(formatDay(new Date(2026, 2, 29, 10, 0), lateEvening)).toBe('Demain');
    expect(formatDay(new Date(2026, 2, 29, 23, 59), new Date(2026, 2, 29, 0, 30))).toBe(
      'Aujourd’hui',
    );
    // 23 hours after Saturday 23:30 is already Monday 00:30 on the wall clock: still « Demain » for Sunday.
    expect(formatDay(new Date(2026, 2, 30, 0, 30), lateEvening)).not.toBe('Demain');
  });

  it('starts a new walk the next day at 10:00 local, 08:00 UTC after the change', () => {
    const start = defaultWalkStart(new Date(2026, 2, 28, 9, 0));
    expect(start.getHours()).toBe(10);
    expect(start.toISOString()).toBe('2026-03-29T08:00:00.000Z');
  });

  it('ends the day of the change at 23:59:59.999 local, after 22 hours of UTC', () => {
    const end = endOfDay(new Date(2026, 2, 29, 6, 0));
    expect(end.getHours()).toBe(23);
    expect(end.toISOString()).toBe('2026-03-29T21:59:59.999Z');
  });

  it('counts a walk across the change in real minutes', () => {
    // 01:30 CET, one hour long: it ends at 03:30 on the wall clock.
    const walk = { startsAt: '2026-03-29T00:30:00Z', durationMinutes: 60 };
    expect(walkEnd(walk).toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(formatTime(walkEnd(walk))).toBe('03:30');
    expect(walkTiming(walk, new Date('2026-03-29T01:29:00Z'))).toBe('started');
    expect(walkTiming(walk, new Date('2026-03-29T01:30:00Z'))).toBe('past');
  });
});

describe('around the change to winter time (25 October 2026)', () => {
  it('shows both passes of the repeated hour as 02:xx', () => {
    expect(formatTime('2026-10-25T00:30:00Z')).toBe('02:30'); // CEST
    expect(formatTime('2026-10-25T01:30:00Z')).toBe('02:30'); // CET, one hour later
    expect(formatTime('2026-10-25T02:00:00Z')).toBe('03:00');
  });

  it('keeps « Hier » and « Demain » by calendar day, not by 24 hours', () => {
    expect(formatDay(new Date(2026, 9, 25, 12, 0), new Date(2026, 9, 26, 0, 30))).toBe('Hier');
    expect(formatDay(new Date(2026, 9, 26, 8, 0), new Date(2026, 9, 25, 23, 30))).toBe('Demain');
  });

  it('starts a new walk the next day at 10:00 local, 09:00 UTC after the change', () => {
    const start = defaultWalkStart(new Date(2026, 9, 24, 9, 0));
    expect(start.getHours()).toBe(10);
    expect(start.toISOString()).toBe('2026-10-25T09:00:00.000Z');
  });

  it('ends the day of the change at 23:59:59.999 local, after 25 hours', () => {
    const end = endOfDay(new Date(2026, 9, 25, 6, 0));
    expect(end.getHours()).toBe(23);
    expect(end.toISOString()).toBe('2026-10-25T22:59:59.999Z');
  });

  it('counts a walk across the change in real minutes', () => {
    // 01:30 CEST (23:30Z the day before), two hours long: ends at 02:30 CET, 3 hours of wall clock.
    const walk = { startsAt: '2026-10-24T23:30:00Z', durationMinutes: 120 };
    expect(walkEnd(walk).toISOString()).toBe('2026-10-25T01:30:00.000Z');
    expect(formatTime(walkEnd(walk))).toBe('02:30');
    expect(walkTiming(walk, new Date('2026-10-25T01:29:00Z'))).toBe('started');
    expect(walkTiming(walk, new Date('2026-10-25T01:30:00Z'))).toBe('past');
  });
});
