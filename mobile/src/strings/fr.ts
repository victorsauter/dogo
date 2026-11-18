import type { EnumName, EnumValue } from '@/api/enums';

/**
 * Every user-facing text of the app, in French.
 * Add new texts here, grouped by screen or feature; never hard-code them in components.
 * Placeholders use `{name}` and are filled with `format()`.
 */
export const fr = {
  app: {
    name: 'dogo',
    tagline: 'Des balades tranquilles entre chiens, près de chez toi.',
  },
  common: {
    retry: 'Réessayer',
    loading: 'Chargement…',
    cancel: 'Annuler',
    save: 'Enregistrer',
    close: 'Fermer',
    required: 'Ce champ est obligatoire.',
  },
  auth: {
    signInTitle: 'Connexion',
    devLoginSection: 'Connexion de test',
    devLoginHint: 'Réservée au développement : crée une session sur un compte de test.',
    devLoginButton: 'Se connecter avec un compte de test',
    signOut: 'Se déconnecter',
    sessionExpired: 'Ta session a expiré. Reconnecte-toi.',
  },
  tabs: {
    discover: 'Balades',
    myWalks: 'Mes balades',
    profile: 'Profil',
  },
  discover: {
    emptyTitle: 'Bientôt, les balades près de chez toi',
    emptyMessage: 'La carte et la liste des balades proches arrivent ici.',
  },
  myWalks: {
    emptyTitle: 'Aucune balade pour l’instant',
    emptyMessage: 'Les balades que tu organises ou rejoins apparaîtront ici.',
  },
  profile: {
    greeting: 'Bonjour {name} !',
    emptyTitle: 'Ton profil et tes chiens',
    emptyMessage: 'Tu pourras bientôt compléter ton profil et présenter tes chiens.',
  },
  states: {
    errorTitle: 'Oups, un problème est survenu',
    emptyDefaultTitle: 'Rien à afficher',
  },
  permissions: {
    // iOS and Android permission texts live in app.config.ts; this one is shown
    // in-app before asking for notification permission (lot 3).
    notifications:
      'Active les notifications pour être prévenu des inscriptions, des changements de balade, des messages et des rappels.',
  },
  a11y: {
    avatarOf: 'Photo de {name}',
    loading: 'Chargement en cours',
  },
  enums: {
    DogSize: { Small: 'Petit', Medium: 'Moyen', Large: 'Grand' },
    Sociability: { Easygoing: 'À l’aise', Selective: 'Sélectif', Reserved: 'Réservé' },
    Reactivity: { None: 'Aucune', Mild: 'Légère', Strong: 'Marquée' },
    LeashHabit: { OnLeash: 'En laisse', LongLine: 'En longe', OffLeash: 'En liberté' },
    LeashRule: { LeashRequired: 'Laisse obligatoire', OffLeashAllowed: 'Liberté possible' },
    WalkAccess: { Open: 'Ouverte', Approval: 'Sur approbation' },
    WalkStatus: { Scheduled: 'Prévue', Cancelled: 'Annulée' },
    RegistrationStatus: {
      Pending: 'En attente',
      Accepted: 'Acceptée',
      Declined: 'Refusée',
      Cancelled: 'Annulée',
    },
    OrganizationStatus: {
      Pending: 'En attente',
      Approved: 'Validée',
      Rejected: 'Refusée',
      Closed: 'Fermée',
    },
    MembershipRole: { Owner: 'Responsable', Educator: 'Éducateur', Member: 'Membre' },
    MembershipStatus: { Pending: 'En attente', Accepted: 'Accepté', Declined: 'Refusé' },
    ReportType: {
      IncidentNoInjury: 'Incident sans blessure',
      Altercation: 'Altercation',
      BiteOrInjury: 'Morsure ou blessure',
      HumanBehavior: 'Comportement d’un humain',
    },
    ReportStatus: { Open: 'Ouvert', Reviewed: 'Examiné', Closed: 'Clos' },
    UserStatus: { Active: 'Actif', Suspended: 'Suspendu' },
  } satisfies { [E in EnumName]: Record<EnumValue<E>, string> },
  /** Messages for the stable `code` extension of API problem responses (spec §1, §4). */
  errors: {
    'walk.full': 'Cette balade est complète.',
    'walk.size_not_allowed': 'Le gabarit de ce chien n’est pas admis sur cette balade.',
    'registration.duplicate': 'Ce chien est déjà inscrit à cette balade.',
    'walk.not_open': 'Les inscriptions à cette balade ne sont pas ouvertes.',
    'walk.not_allowed': 'Tu ne peux pas t’inscrire à cette balade.',
    'walk.members_only': 'Cette balade est réservée aux membres de l’organisation.',
    'walk.capacity_below_registered':
      'Le nombre maximum de chiens ne peut pas être inférieur au nombre de chiens déjà acceptés.',
    'account.suspended': 'Ton compte est suspendu : tu ne peux plus rien modifier.',
    'validation.failed': 'Certains champs sont invalides. Vérifie le formulaire.',
    notFound: 'Cet élément n’existe pas ou plus.',
    forbidden: 'Tu n’as pas accès à cette action.',
    server: 'Le service rencontre un problème. Réessaie dans un instant.',
    network: 'Impossible de joindre le serveur. Vérifie ta connexion internet.',
    generic: 'Une erreur est survenue. Réessaie.',
  },
} as const;

export type Strings = typeof fr;
export type ApiErrorCode = Exclude<
  keyof Strings['errors'],
  'notFound' | 'forbidden' | 'server' | 'network' | 'generic'
>;
