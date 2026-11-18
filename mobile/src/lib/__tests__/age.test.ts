import { computeAge, formatAge, parseBirthDate, toApiDate } from '../age';

const now = new Date(2026, 10, 18); // 18 November 2026

describe('birth dates', () => {
  it('parses and formats API dates without time zone shifts', () => {
    const date = parseBirthDate('2022-03-15');
    expect(date).toEqual(new Date(2022, 2, 15));
    expect(toApiDate(date!)).toBe('2022-03-15');
    expect(toApiDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('rejects invalid dates', () => {
    expect(parseBirthDate('not a date')).toBeNull();
    expect(parseBirthDate('2022-02-31')).toBeNull();
  });
});

describe('computeAge', () => {
  it.each([
    ['2022-03-15', 4, 8],
    ['2022-11-18', 4, 0],
    ['2022-11-19', 3, 11], // birthday tomorrow
    ['2026-08-18', 0, 3],
    ['2026-11-18', 0, 0],
    ['2026-10-19', 0, 0], // one day short of a month
  ])('%s → %i years %i months', (birth, years, months) => {
    expect(computeAge(parseBirthDate(birth)!, now)).toEqual({ years, months });
  });

  it('never goes negative for a future date', () => {
    expect(computeAge(new Date(2027, 0, 1), now)).toEqual({ years: 0, months: 0 });
  });
});

describe('formatAge', () => {
  it.each([
    ['2022-03-15', '4 ans'],
    ['2025-11-18', '1 an'],
    ['2026-06-10', '5 mois'],
    ['2026-11-10', 'Moins d’un mois'],
  ])('%s → %s', (birth, label) => {
    expect(formatAge(birth, now)).toBe(label);
  });

  it('is null without a valid date', () => {
    expect(formatAge(null, now)).toBeNull();
    expect(formatAge(undefined, now)).toBeNull();
    expect(formatAge('garbage', now)).toBeNull();
  });
});
