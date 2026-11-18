/**
 * Enumerations of the API (spec §2), serialized as strings.
 *
 * Hand-written because `api/openapi.json` does not exist yet. Once the schema
 * is generated, prefer the generated types (`components['schemas']['DogSize']`)
 * and keep these arrays only to iterate over values (chips, filters).
 */
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

export type DogSize = EnumValue<'DogSize'>;
export type Sociability = EnumValue<'Sociability'>;
export type Reactivity = EnumValue<'Reactivity'>;
export type LeashHabit = EnumValue<'LeashHabit'>;
export type LeashRule = EnumValue<'LeashRule'>;
export type WalkAccess = EnumValue<'WalkAccess'>;
export type WalkStatus = EnumValue<'WalkStatus'>;
export type RegistrationStatus = EnumValue<'RegistrationStatus'>;
export type OrganizationStatus = EnumValue<'OrganizationStatus'>;
export type MembershipRole = EnumValue<'MembershipRole'>;
export type MembershipStatus = EnumValue<'MembershipStatus'>;
export type ReportType = EnumValue<'ReportType'>;
export type ReportStatus = EnumValue<'ReportStatus'>;
export type UserStatus = EnumValue<'UserStatus'>;
