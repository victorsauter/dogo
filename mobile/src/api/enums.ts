/**
 * Enumerations of the API (spec §2), serialized as strings.
 *
 * The types of the enumerations covered by `api/openapi.json` come from the
 * generated schema; the arrays below only serve to iterate over values (chips,
 * filters) and for the enumerations the API does not expose yet.
 */
import type { components } from './schema';

export const enumValues = {
  DogSize: ['Small', 'Medium', 'Large'],
  Sociability: ['Easygoing', 'Selective', 'Reserved'],
  Reactivity: ['None', 'Mild', 'Strong'],
  LeashHabit: ['OnLeash', 'LongLine', 'OffLeash'],
  LeashRule: ['LeashRequired', 'OffLeashAllowed'],
  WalkAccess: ['Open', 'Approval'],
  WalkStatus: ['Scheduled', 'Cancelled'],
  RegistrationStatus: ['Pending', 'Accepted', 'Declined', 'Cancelled'],
  OrganizationStatus: ['Pending', 'Approved', 'Rejected', 'Closed'],
  MembershipRole: ['Owner', 'Educator', 'Member'],
  MembershipStatus: ['Pending', 'Accepted', 'Declined'],
  ReportType: ['IncidentNoInjury', 'Altercation', 'BiteOrInjury', 'HumanBehavior'],
  ReportStatus: ['Open', 'Reviewed', 'Closed'],
  UserStatus: ['Active', 'Suspended'],
} as const;

export type EnumName = keyof typeof enumValues;
export type EnumValue<E extends EnumName> = (typeof enumValues)[E][number];

export type DogSize = components['schemas']['DogSize'];
export type Sociability = components['schemas']['Sociability'];
export type Reactivity = components['schemas']['Reactivity'];
export type LeashHabit = components['schemas']['LeashHabit'];
export type LeashRule = components['schemas']['LeashRule'];
export type WalkAccess = components['schemas']['WalkAccess'];
export type WalkStatus = components['schemas']['WalkStatus'];
export type RegistrationStatus = components['schemas']['RegistrationStatus'];
export type MyWalksRole = components['schemas']['MyWalksRole'];
export type MyWalksPeriod = components['schemas']['MyWalksPeriod'];
export type OrganizationStatus = EnumValue<'OrganizationStatus'>;
export type MembershipRole = EnumValue<'MembershipRole'>;
export type MembershipStatus = EnumValue<'MembershipStatus'>;
export type ReportType = EnumValue<'ReportType'>;
export type ReportStatus = EnumValue<'ReportStatus'>;
export type UserStatus = components['schemas']['UserStatus'];
