import type { EnumName, EnumValue } from '@/api/enums';

import { fr } from './fr';

export type { ApiErrorCode, Strings } from './fr';

/**
 * Typed accessor to the French texts: `t.tabs.discover`, `t.auth.signOut`…
 * The app is French-only (V1); keep this indirection so a locale can be added later.
 */
export const t = fr;

/** Fills `{name}` placeholders: `format(t.profile.greeting, { name: 'Léa' })`. */
export function format(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/** French label of an API enum value: `enumLabel('DogSize', 'Small')` → « Petit ». */
export function enumLabel<E extends EnumName>(name: E, value: EnumValue<E>): string {
  return (fr.enums[name] as Record<string, string>)[value] ?? value;
}
