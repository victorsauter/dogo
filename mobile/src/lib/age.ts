import { format, plural, t } from '@/strings';

/** Parses an API `birthDate` (`AAAA-MM-JJ`) as a local calendar date; `null` when invalid. */
export function parseBirthDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

/** `AAAA-MM-JJ` of a local date, as the API expects. */
export function toApiDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole years and remaining whole months between a birth date and `now`. */
export function computeAge(birth: Date, now: Date = new Date()): { years: number; months: number } {
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  months = Math.max(0, months);
  return { years: Math.floor(months / 12), months: months % 12 };
}

/** « 3 ans », « 1 an », « 8 mois », « Moins d’un mois »; `null` when there is no valid date. */
export function formatAge(
  birthDate: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const birth = birthDate ? parseBirthDate(birthDate) : null;
  if (!birth) return null;
  const { years, months } = computeAge(birth, now);
  if (years >= 1) {
    return plural(t.dog.ageYears, years);
  }
  if (months >= 1) return format(t.dog.ageMonths, { count: months });
  return t.dog.ageNewborn;
}
