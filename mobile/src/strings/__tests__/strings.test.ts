import { enumValues, type EnumName } from '@/api/enums';

import { enumLabel, format, t } from '..';

/** Labels of spec §2, copied from the specification table. */
const specLabels: Record<EnumName, string[]> = {
  DogSize: ['Petit', 'Moyen', 'Grand'],
  Sociability: ['À l’aise', 'Sélectif', 'Réservé'],
  Reactivity: ['Aucune', 'Légère', 'Marquée'],
  LeashHabit: ['En laisse', 'En longe', 'En liberté'],
  LeashRule: ['Laisse obligatoire', 'Liberté possible'],
  WalkAccess: ['Ouverte', 'Sur approbation'],
  WalkStatus: ['Prévue', 'Annulée'],
  RegistrationStatus: ['En attente', 'Acceptée', 'Refusée', 'Annulée'],
  OrganizationStatus: ['En attente', 'Validée', 'Refusée', 'Fermée'],
  MembershipRole: ['Responsable', 'Éducateur', 'Membre'],
  MembershipStatus: ['En attente', 'Accepté', 'Refusé'],
  ReportType: [
    'Incident sans blessure',
    'Altercation',
    'Morsure ou blessure',
    'Comportement d’un humain',
  ],
  ReportStatus: ['Ouvert', 'Examiné', 'Clos'],
  UserStatus: ['Actif', 'Suspendu'],
};

// The spec writes apostrophes as ' ; the app uses the typographic ’.
const normalize = (label: string) => label.replace(/'/g, '’');

describe('enum labels', () => {
  it('covers every enumeration of the specification', () => {
    expect(Object.keys(t.enums).sort()).toEqual(Object.keys(enumValues).sort());
  });

  it.each(Object.keys(enumValues) as EnumName[])('%s: every value has its French label', (name) => {
    const labels = enumValues[name].map((value) => enumLabel(name, value as never));
    expect(labels).toEqual(specLabels[name].map(normalize));
    expect(Object.keys(t.enums[name])).toEqual([...enumValues[name]]);
  });
});

describe('error messages', () => {
  it.each([
    'walk.full',
    'walk.size_not_allowed',
    'registration.duplicate',
    'walk.not_open',
    'walk.not_allowed',
    'walk.members_only',
    'walk.organization_forbidden',
    'organization.not_found',
    'organization.forbidden',
    'organization.closed',
    'organization.not_approved',
    'organization.too_many_pending',
    'membership.duplicate',
    'membership.not_found',
    'membership.not_pending',
    'membership.owner_role',
    'membership.not_accepted',
    'membership.sole_owner',
    'block.self',
    'report.self',
    'report.not_found',
    'admin.forbidden',
    'admin.self_suspension',
    'walk.capacity_below_registered',
    'account.suspended',
    'validation.failed',
    'photo.too_large',
    'photo.unsupported_type',
    'photo.missing',
    'dog.not_found',
    'dog.forbidden',
    'user.not_found',
    'auth.invalid_token',
    'generic',
    'network',
  ])('has a French message for %s', (code) => {
    expect((t.errors as Record<string, string>)[code]).toMatch(/\S/);
  });
});

describe('refusals that must not reveal anything', () => {
  it('the message of walk.not_allowed does not suggest a block', () => {
    expect(t.errors['walk.not_allowed']).not.toMatch(/bloqu|interdit|banni|refus/i);
  });
});

describe('format', () => {
  it('fills placeholders and keeps unknown ones', () => {
    expect(format('Bonjour {name} ({missing})', { name: 'Léa' })).toBe('Bonjour Léa ({missing})');
  });
});

describe('API error codes of walks and registrations', () => {
  it.each([
    'walk.not_found',
    'walk.forbidden',
    'walk.not_open',
    'walk.full',
    'walk.size_not_allowed',
    'walk.capacity_below_registered',
    'walk.size_in_use',
    'walk.not_allowed',
    'walk.members_only',
    'registration.not_found',
    'registration.forbidden',
    'registration.duplicate',
    'registration.not_active',
  ])('%s has a French message', (code) => {
    expect((t.errors as Record<string, string>)[code]).toEqual(expect.any(String));
  });
});
