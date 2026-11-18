# dogo — Spécification technique V1

**Version :** 0.1 · 18/11/2026

Ce document traduit le [périmètre V1](perimetre-v1.md) en modèle de données, règles et points d'entrée. Il sert de contrat entre l'API et l'application mobile. Les identifiants de code sont en anglais ; les textes affichés sont en français.

Les choix faits ici sans validation explicite sont listés à la fin, section « Choix faits en autonomie ».

## 1. Conventions de l'API

- **Base :** `/api/v1`. JSON en camelCase. Les énumérations sont sérialisées en chaînes.
- **Identifiants :** GUID. **Dates :** ISO 8601 en UTC.
- **Authentification :** jeton d'accès `Bearer` (JWT, 15 minutes) et jeton de rafraîchissement (30 jours, renouvelé à chaque usage, stocké haché). Tout exige une authentification, sauf `/auth/*`, `/health` et les fichiers de photos.
- **Erreurs :** `application/problem+json` (RFC 9457), avec une extension `code` stable, par exemple `walk.full`. Les erreurs de validation listent les champs fautifs.
- **Photos :** `photoUrl` est un chemin relatif à l'origine du serveur (`/photos/...`), servi sans authentification sous un nom aléatoire ; voir l'ADR 0010.
- **Listes :** paramètre `limit` (50 par défaut, 100 au plus). Le fil de messages se pagine avec `before`.
- **Compte suspendu :** toute écriture renvoie 403 avec le code `account.suspended`.

## 2. Énumérations

| Énumération | Valeurs | Libellés affichés |
| --- | --- | --- |
| `DogSize` | `Small`, `Medium`, `Large` | Petit, Moyen, Grand |
| `Sociability` | `Easygoing`, `Selective`, `Reserved` | À l'aise, Sélectif, Réservé |
| `Reactivity` | `None`, `Mild`, `Strong` | Aucune, Légère, Marquée |
| `LeashHabit` | `OnLeash`, `LongLine`, `OffLeash` | En laisse, En longe, En liberté |
| `LeashRule` | `LeashRequired`, `OffLeashAllowed` | Laisse obligatoire, Liberté possible |
| `WalkAccess` | `Open`, `Approval` | Ouverte, Sur approbation |
| `WalkStatus` | `Scheduled`, `Cancelled` | Prévue, Annulée |
| `RegistrationStatus` | `Pending`, `Accepted`, `Declined`, `Cancelled` | En attente, Acceptée, Refusée, Annulée |
| `OrganizationStatus` | `Pending`, `Approved`, `Rejected`, `Closed` | En attente, Validée, Refusée, Fermée |
| `MembershipRole` | `Owner`, `Educator`, `Member` | Responsable, Éducateur, Membre |
| `MembershipStatus` | `Pending`, `Accepted`, `Declined` | En attente, Accepté, Refusé |
| `ReportType` | `IncidentNoInjury`, `Altercation`, `BiteOrInjury`, `HumanBehavior` | Incident sans blessure, Altercation, Morsure ou blessure, Comportement d'un humain |
| `ReportStatus` | `Open`, `Reviewed`, `Closed` | Ouvert, Examiné, Clos |
| `UserStatus` | `Active`, `Suspended` | Actif, Suspendu |

## 3. Modèle de données

| Entité | Lot | Champs |
| --- | --- | --- |
| `User` | 1 | `id`, `provider` (`Apple`, `Google`, `Dev`), `providerSubject`, `email` (privé, facultatif), `displayName`, `bio`, `photoUrl`, `status`, `createdAt` |
| `RefreshToken` | 1 | `id`, `userId`, `tokenHash`, `expiresAt`, `revokedAt` |
| `Dog` | 1 | `id`, `ownerId`, `name`, `photoUrl`, `size`, `birthDate` (facultatif), `breed` (facultatif), `sociability`, `reactivity`, `leashHabit`, `description`, `createdAt` |
| `Walk` | 2 | `id`, `organizerId`, `title`, `description`, `startsAt`, `durationMinutes`, `location` (point géographique), `locationLabel`, `maxDogs`, `allowedSizes` (au moins une), `leashRule`, `rules`, `access`, `status`, `organizationId` (lot 4), `seriesId` (lot 3), `createdAt` |
| `Registration` | 2 | `id`, `walkId`, `dogId`, `userId`, `status`, `createdAt` |
| `WalkSeries` | 3 | `id`, `organizerId`, `timeZone` (`Europe/Paris`), `active`, `createdAt` |
| `Message` | 3 | `id`, `walkId`, `authorId` (nul si compte supprimé), `text` (1 000 caractères au plus), `createdAt` |
| `Device` | 3 | `id`, `userId`, `expoPushToken`, `platform`, `updatedAt` |
| `NotificationPreferences` | 3 | `userId`, `registrations`, `walkChanges`, `messages`, `reminders` (booléens, vrais par défaut) |
| `Organization` | 4 | `id`, `name`, `description`, `city`, `status`, `createdById`, `createdAt` |
| `Membership` | 4 | `id`, `organizationId`, `userId`, `role`, `status`, `createdAt` |
| `Block` | 4 | `id`, `blockerId`, `blockedId`, `createdAt` |
| `Report` | 4 | `id`, `reporterId` (nul si compte supprimé), `targetUserId`, `targetDogId`, `walkId` (tous facultatifs, au moins une cible), `type`, `facts`, `status`, `adminNote`, `createdAt` |

## 4. Règles métier

### 4.1 Profils

- Un utilisateur ne modifie que son profil et ses chiens.
- Le profil public d'un utilisateur montre `displayName`, `bio`, `photoUrl` et ses chiens. L'e-mail n'est jamais exposé.
- Supprimer un chien annule ses inscriptions à venir.

### 4.2 Balades

- Seul l'organisateur modifie ou annule une balade, et seulement avant son début.
- `maxDogs` ne peut pas descendre sous le nombre de chiens déjà acceptés : code `walk.capacity_below_registered`.
- Annuler une balade la passe à `Cancelled` et prévient les inscrits.
- La recherche renvoie les balades `Scheduled` à venir, dans un rayon autour d'un point, filtrables par période et par gabarit admis. Elle indique pour chacune la distance, le nombre de places prises et si elle est professionnelle.
- Le point de rendez-vous exact est visible par tous.
- Retirer un gabarit admis qu'un chien accepté possède est refusé : code `walk.size_in_use`.

### 4.3 Inscriptions

Une inscription concerne un chien. On peut inscrire plusieurs de ses chiens en une demande ; elle réussit ou échoue en bloc.

| Règle | Code d'erreur |
| --- | --- |
| La balade est `Scheduled` et n'a pas commencé | `walk.not_open` |
| Le chien appartient à l'utilisateur | 404 |
| Le gabarit du chien est admis | `walk.size_not_allowed` |
| Le chien n'a pas déjà une inscription `Pending` ou `Accepted` | `registration.duplicate` |
| Il reste assez de places (seules les inscriptions `Accepted` comptent) | `walk.full` |
| L'organisateur n'a pas bloqué l'utilisateur | `walk.not_allowed` |
| Balade professionnelle : l'utilisateur est membre accepté de l'organisation | `walk.members_only` |

- Accès `Open` : l'inscription est `Accepted` tout de suite. Accès `Approval` : elle est `Pending` jusqu'à la décision de l'organisateur.
- L'acceptation revérifie la capacité et le gabarit.
- Sur une balade `Approval` déjà complète, une nouvelle demande est refusée avec `walk.full`.
- L'organisateur peut inscrire ses propres chiens ; ils sont acceptés d'office et comptent dans la capacité.
- Le propriétaire annule son inscription avant le début ; la place est libérée.
- L'organisateur peut refuser ou retirer un participant ; l'inscription passe à `Declined`.
- La fiche d'une balade montre les chiens `Accepted` avec leur profil et leur propriétaire. Les inscriptions `Pending` ne sont visibles que de l'organisateur et de leur auteur.

### 4.4 Fil de balade et notifications

- Seuls l'organisateur et les propriétaires de chiens `Accepted` lisent et écrivent dans le fil.
- Les notifications sont envoyées par le service d'Expo, derrière une interface. Chaque type respecte les préférences du destinataire.

| Événement | Destinataires | Préférence |
| --- | --- | --- |
| Nouvelle inscription ou demande | Organisateur | `registrations` |
| Inscription acceptée ou refusée | Auteur de l'inscription | `registrations` |
| Balade modifiée ou annulée | Inscrits `Accepted` et `Pending` | `walkChanges` |
| Nouveau message | Organisateur et inscrits `Accepted`, sauf l'auteur | `messages` |
| Rappel, 2 heures avant le début | Organisateur et inscrits `Accepted` | `reminders` |
| Prochaine balade d'une série créée | Inscrits `Accepted` de la précédente | `walkChanges` |
| Demande d'adhésion reçue, adhésion acceptée, organisation validée | Personnes concernées | `registrations` |

- Chaque rappel n'est envoyé qu'une fois, même si le serveur redémarre.

### 4.5 Récurrence

- Une balade créée avec `repeatWeekly` appartient à une série.
- Quand une balade de série commence, la suivante est créée sept jours plus tard à la même heure locale (`Europe/Paris`, changements d'heure compris). Il n'existe jamais plus d'une balade à venir par série.
- Les inscriptions ne sont pas reportées ; les inscrits de la précédente sont prévenus.
- L'organisateur peut arrêter la série. Annuler une balade n'arrête pas la série.

### 4.6 Organisations

- Tout utilisateur peut demander la création d'une organisation. Elle est `Pending` jusqu'à validation par un administrateur ; son créateur en est `Owner`.
- Seule une organisation `Approved` est visible des autres utilisateurs et peut porter des balades.
- Un utilisateur demande à rejoindre ; un `Owner` ou un `Educator` accepte ou refuse. L'`Owner` peut nommer un membre `Educator`.
- Une balade professionnelle porte un `organizationId`. Seuls l'`Owner` et les `Educator` d'une organisation `Approved` en créent. Elle est visible de tous et marquée comme professionnelle, mais l'inscription est réservée aux membres acceptés.
- La liste des membres n'est visible que de l'`Owner` et des `Educator`.

### 4.7 Blocage, signalement, administration

- Bloquer une personne l'empêche de s'inscrire aux balades que j'organise. Elle n'est pas prévenue et l'erreur renvoyée ne révèle pas le blocage.
- La fiche et la liste des balades indiquent `hasBlockedParticipant` quand l'organisateur ou un inscrit `Accepted` fait partie des personnes que j'ai bloquées.
- Un signalement vise une personne, un chien ou une balade. Il n'est visible que des administrateurs. À sa création, une interface d'envoi prévient l'adresse d'administration ; en V1 son implémentation se contente de journaliser, faute de fournisseur d'e-mails choisi.
- Les administrateurs sont les comptes dont l'e-mail figure dans la configuration `Admin:Emails`. Ils valident ou refusent les organisations, lisent et classent les signalements, suspendent ou rétablissent un compte.

### 4.8 Suppression de compte

Supprimer son compte :

- annule ses balades à venir et prévient les inscrits ;
- supprime ses chiens, inscriptions, appareils, adhésions, blocages et jetons ;
- ferme (`Closed`) les organisations dont il était le seul `Owner` ;
- conserve ses messages et ses signalements, sans auteur.

## 5. Points d'entrée

Tous sous `/api/v1`.

### Lot 1

| Méthode et chemin | Rôle |
| --- | --- |
| `POST /auth/apple` | Échange un jeton d'identité Apple contre une session ; crée le compte au premier passage |
| `POST /auth/google` | Idem avec un jeton d'identité Google |
| `POST /auth/dev` | Session pour un compte de test ; actif seulement si `Auth:AllowDevLogin` vaut vrai |
| `POST /auth/refresh` | Renouvelle la session |
| `POST /auth/logout` | Révoque le jeton de rafraîchissement |
| `GET /me`, `PATCH /me` | Lire et modifier son profil |
| `PUT /me/photo` | Envoyer sa photo (multipart) |
| `GET /me/dogs`, `POST /dogs` | Lister et créer ses chiens |
| `GET /dogs/{id}`, `PATCH /dogs/{id}`, `DELETE /dogs/{id}` | Lire, modifier, supprimer un chien |
| `PUT /dogs/{id}/photo` | Envoyer la photo d'un chien |
| `GET /users/{id}` | Profil public et chiens d'un utilisateur |
| `GET /health` | État du service |

### Lot 2

| Méthode et chemin | Rôle |
| --- | --- |
| `POST /walks` | Créer une balade |
| `GET /walks?lat&lng&radiusKm&from&to&size` | Rechercher les balades proches |
| `GET /walks/{id}` | Fiche, avec les participants |
| `PATCH /walks/{id}`, `POST /walks/{id}/cancel` | Modifier, annuler |
| `GET /me/walks?role&when` | Mes balades : `role` vaut `Organizer` ou `Participant`, `when` vaut `Upcoming` ou `Past` |
| `POST /walks/{id}/registrations` | Inscrire un ou plusieurs chiens |
| `DELETE /walks/{id}/registrations/{registrationId}` | Annuler une inscription |
| `POST /walks/{id}/registrations/{registrationId}/accept` et `/decline` | Décision de l'organisateur |

### Lot 3

| Méthode et chemin | Rôle |
| --- | --- |
| `GET /walks/{id}/messages?before&limit`, `POST /walks/{id}/messages` | Lire et écrire dans le fil |
| `PUT /me/devices`, `DELETE /me/devices/{token}` | Enregistrer ou retirer un appareil |
| `GET /me/notification-preferences`, `PUT /me/notification-preferences` | Préférences de notification |
| `POST /walks` avec `repeatWeekly` | Créer une balade hebdomadaire |
| `POST /walks/{id}/stop-series` | Arrêter la série |

### Lot 4

| Méthode et chemin | Rôle |
| --- | --- |
| `POST /organizations`, `GET /organizations?query`, `GET /organizations/{id}`, `PATCH /organizations/{id}` | Demander, chercher, lire, modifier une organisation |
| `GET /me/organizations` | Mes organisations et mon rôle |
| `POST /organizations/{id}/memberships` | Demander à rejoindre |
| `GET /organizations/{id}/memberships` | Membres et demandes |
| `POST /organizations/{id}/memberships/{membershipId}/accept` et `/decline` | Décision sur une demande |
| `PATCH /organizations/{id}/memberships/{membershipId}` | Changer le rôle |
| `DELETE /organizations/{id}/memberships/{membershipId}` | Quitter ou retirer |
| `POST /blocks`, `GET /me/blocks`, `DELETE /blocks/{userId}` | Bloquer, lister, débloquer |
| `POST /reports` | Signaler |
| `GET /admin/organizations?status`, `POST /admin/organizations/{id}/approve` et `/reject` | Valider les organisations |
| `GET /admin/reports`, `PATCH /admin/reports/{id}` | Traiter les signalements |
| `POST /admin/users/{id}/suspend` et `/unsuspend` | Suspendre un compte |
| `DELETE /me` | Supprimer son compte |

## 6. Architecture

### API (`api/`)

- .NET 10, minimal API, un dossier par fonctionnalité sous `src/Dogo.Api/Features/`.
- EF Core avec Npgsql et NetTopologySuite ; migrations versionnées.
- Tests d'intégration contre une vraie base PostgreSQL avec PostGIS, lancée par Testcontainers.
- `docker-compose.yml` pour la base locale, sur un port non standard.
- La description OpenAPI est générée à la compilation et versionnée dans `api/openapi.json`.
- Stockage des photos, envoi des notifications et envoi des e-mails derrière des interfaces, avec une implémentation locale ou de journalisation.

### Mobile (`mobile/`)

- Expo, TypeScript strict, navigation par fichiers.
- Client d'API et types générés depuis `api/openapi.json`.
- Session conservée dans le stockage sécurisé de l'appareil ; renouvellement automatique du jeton d'accès.
- Carte, notifications, appareil photo et connexion Apple/Google par les modules Expo ou compatibles.
- Un bouton de connexion de test apparaît seulement si `EXPO_PUBLIC_DEV_LOGIN` vaut `true`.
- Tous les textes affichés sont en français, regroupés dans un module.

## 7. Choix faits en autonomie

Ces points n'étaient pas tranchés dans le périmètre. Ils sont faciles à changer tant que le pilote n'a pas commencé.

| Sujet | Choix | Pourquoi |
| --- | --- | --- |
| Catégories de gabarit | Petit, Moyen, Grand | Le périmètre demande au minimum petit et grand |
| Échelles de sociabilité et de réactivité | Trois niveaux chacune | Assez pour filtrer, sans prétendre à un diagnostic |
| Choix du lieu | L'organisateur pose un point sur la carte et écrit un libellé | Évite de dépendre d'un service de recherche d'adresses |
| Rappel | 2 heures avant le début | Assez tôt pour s'organiser, assez tard pour être utile |
| Connexion de test | Point d'entrée `/auth/dev`, désactivé par défaut | Permet de tester sans comptes Apple ni Google |
| Photos | Fichiers sur le disque du serveur | L'hébergement n'est pas choisi |
| E-mails de signalement | Journalisés seulement | Aucun fournisseur d'e-mails n'est choisi |
| Administration | Points d'entrée `/admin`, sans écran | Suffisant à l'échelle d'un pilote |
| Identifiant de l'application | `com.victorsauter.dogo` | Provisoire ; à confirmer avant toute publication |
| Fuseau des séries | `Europe/Paris` | Le pilote est en France |
