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
    delete: 'Supprimer',
    edit: 'Modifier',
    back: 'Retour',
    fieldInvalid: 'Valeur invalide : vérifie ce champ.',
    tooLong: 'Maximum {max} caractères.',
  },
  auth: {
    signInTitle: 'Connexion',
    signInWithApple: 'Continuer avec Apple',
    signInWithGoogle: 'Continuer avec Google',
    signingIn: 'Connexion en cours…',
    devLoginSection: 'Connexion de test',
    devLoginHint: 'Réservée au développement : crée une session sur un compte de test.',
    devLoginButton: 'Se connecter avec un compte de test',
    devIdentifier: 'Identifiant de test',
    devDisplayName: 'Nom affiché',
    devDefaultIdentifier: 'dev-user-1',
    devDefaultDisplayName: 'Camille Test',
    signOut: 'Se déconnecter',
    sessionExpired: 'Ta session a expiré. Reconnecte-toi.',
    noMethodTitle: 'Aucune méthode de connexion disponible',
    noMethodMessage:
      'La connexion Apple et Google demande une version de développement de l’application.',
    providerFailed: 'La connexion a échoué. Réessaie.',
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
    title: 'Profil',
    greeting: 'Bonjour {name} !',
    later: 'Plus tard',
    noBio: 'Pas encore de présentation.',
    editButton: 'Modifier mon profil',
    editTitle: 'Modifier mon profil',
    welcome: 'Bienvenue sur dogo ! Dis-nous comment t’appeler et présente-toi en quelques mots.',
    displayName: 'Nom affiché',
    bio: 'Présentation',
    bioHint: 'Quelques mots sur toi et tes balades (facultatif).',
    myDogs: 'Mes chiens',
    publicTitle: 'Profil',
    dogsOf: 'Les chiens de {name}',
    noDogsPublic: 'Aucun chien pour l’instant.',
    saved: 'Profil enregistré.',
    photoSaveFailed:
      'Ton profil est enregistré, mais la photo n’a pas pu être envoyée. Choisis-la de nouveau.',
  },
  photo: {
    change: 'Changer la photo',
    add: 'Ajouter une photo',
    fromLibrary: 'Choisir dans la photothèque',
    takePhoto: 'Prendre une photo',
    remove: 'Annuler la photo choisie',
    cameraDenied:
      'L’accès à l’appareil photo est refusé. Autorise-le dans les réglages du téléphone.',
    pickFailed: 'Impossible de récupérer cette photo. Essaie-en une autre.',
  },
  dog: {
    myDogsEmptyTitle: 'Ajoute ton premier chien',
    myDogsEmptyMessage: 'Présente ton chien pour pouvoir l’inscrire à des balades.',
    add: 'Ajouter un chien',
    addTitle: 'Nouveau chien',
    editTitle: 'Modifier le chien',
    detailTitle: 'Chien',
    name: 'Nom',
    size: 'Gabarit',
    sociability: 'Sociabilité',
    reactivity: 'Réactivité',
    leashHabit: 'Habitude de laisse',
    birthDate: 'Date de naissance',
    age: 'Âge',
    birthDateHint: 'Facultatif.',
    birthDatePick: 'Choisir la date',
    birthDateClear: 'Effacer la date',
    breed: 'Race',
    breedHint: 'Facultatif.',
    description: 'Description',
    descriptionHint: 'Caractère, habitudes, ce qu’il faut savoir (facultatif).',
    noBreed: 'Race non renseignée',
    noDescription: 'Pas de description.',
    noBirthDate: 'Âge inconnu',
    birthDateFuture: 'La date de naissance ne peut pas être dans le futur.',
    birthDateInvalid: 'Date de naissance invalide.',
    ageYears: '{count} an|{count} ans',
    ageMonths: '{count} mois',
    ageNewborn: 'Moins d’un mois',
    ownedBy: 'Voir le propriétaire',
    summary: '{size} · {sociability}',
    deleteConfirmTitle: 'Supprimer {name} ?',
    deleteConfirmMessage: 'Ses inscriptions à venir seront annulées. Cette action est définitive.',
    deleteFailed: 'Le chien n’a pas pu être supprimé.',
    createdPhotoFailed:
      'Le chien est enregistré, mais la photo n’a pas pu être envoyée. Ajoute-la depuis sa fiche.',
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
    'photo.too_large': 'Cette photo est trop lourde (5 Mo au maximum).',
    'photo.unsupported_type':
      'Ce format n’est pas accepté. Utilise une photo JPEG, PNG, WebP ou HEIC.',
    'photo.missing': 'Aucune photo n’a été envoyée.',
    'photo.not_found': 'Cette photo n’existe plus.',
    'request.too_large': 'Le fichier envoyé est trop volumineux.',
    'dog.not_found': 'Ce chien n’existe pas ou plus.',
    'dog.forbidden': 'Ce chien ne t’appartient pas.',
    'user.not_found': 'Cette personne n’existe pas ou plus.',
    'auth.invalid_token': 'La connexion a été refusée. Réessaie.',
    'auth.unauthenticated': 'Ta session a expiré. Reconnecte-toi.',
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
