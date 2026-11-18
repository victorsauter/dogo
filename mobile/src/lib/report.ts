import type { Href } from 'expo-router';

/** What a report can be about: a person, a dog or a walk. */
export const reportKinds = ['user', 'dog', 'walk'] as const;
export type ReportKind = (typeof reportKinds)[number];

export const isReportKind = (value: unknown): value is ReportKind =>
  reportKinds.includes(value as ReportKind);

/** Link to the report screen, with the target and its display name already filled in. */
export function reportHref(kind: ReportKind, id: string, name: string): Href {
  return { pathname: '/report', params: { kind, id, name } };
}
