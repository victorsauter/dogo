# Uzu — Spécification technique V1

**Version :** 0.2 · 19/11/2026

Ce document traduit le [périmètre V1](perimetre-v1.md) en modèle de données, règles et points d'entrée. Il sert de contrat entre l'API et l'application mobile. Les identifiants de code sont en anglais ; les textes affichés sont en français.

Les choix faits ici sans validation explicite sont listés à la fin, section « Choix faits en autonomie ». La forme exacte des réponses (champs, types, codes de statut) est celle de [`api/openapi.json`](../api/openapi.json), qui fait foi ; ce document en donne les règles.

La version 0.2 reporte les décisions de la revue de la V1 (ADR 0031 à 0037). Ces ADR sont « Proposé » tant que le porteur du projet ne les a pas validés.

## 1. Conventions de l'API

- **Base :** `/api/v1`. JSON en camelCase. Les énumérations sont sérialisées en chaînes et acceptées seulement sous leur nom, jamais sous leur valeur entière.
- **Identifiants :** GUID. **Dates :** ISO 8601 ; en sortie en UTC, en entrée avec un décalage explicite obligatoire (`Z` ou `±hh:mm`).
- **Authentification :** jeton d'accès `Bearer` (JWT, 15 minutes) et jeton de rafraîchissement (30 jours, renouvelé à chaque usage, stocké haché). Tout exige une authentification, sauf `/auth/*`, `/health`, `/dev/demo-data` (développement seulement, ADR 0027) et les fichiers de photos.
- **Jeton de rafraîchissement :** un jeton remplacé reste accepté 60 secondes et donne alors une nouvelle session de la même famille ; au-delà, le présenter de nouveau révoque la famille de jetons issue de la même connexion, pas toutes les sessions de la personne. La déconnexion révoque la famille (ADR 0035).
- **Erreurs :** `application/problem+json` (RFC 9457), avec une extension `code` stable, par exemple `walk.full`. Les erreurs de validation listent les champs fautifs.
- **Photos :** `photoUrl` est un chemin relatif à l'origine du serveur (`/photos/...`), servi sans authentification sous un nom aléatoire ; voir l'ADR 0010. Seuls le JPEG, le PNG et le WebP sont acceptés (le HEIC est refusé). Le serveur réencode l'image et en retire toutes les métadonnées, dont la position GPS ; il refuse plus de 25 mégapixels et réduit à 2 048 pixels le grand côté. Le fichier est servi avec un cache privé d'un jour (ADR 0032).
- **Listes :** paramètre `limit` (50 par défaut, 100 au plus). Le fil de messages se pagine avec `before`.
- **Compte suspendu :** toute écriture renvoie 403 avec le code `account.suspended`, sauf `DELETE /me` (ADR 0036).
- **Limites (ADR 0031) :**
  - la limitation de débit répond 429 `rate_limit.exceeded` avec un en-tête `Retry-After` ;
  - un corps de requête fait 256 Ko au plus, hors photos ; au-delà, 413 `request.too_large` ;
  - un jeton d'appareil doit avoir la forme d'un jeton Expo ;
  - un compte garde dix appareils au plus : l'enregistrement d'un onzième remplace le plus ancien.
- **Environnements (ADR 0031) :** la connexion de test et les données de démonstration ne sont permises qu'en `Development` et `Testing`. Tout autre nom d'environnement est traité comme la production, où un compte de test n'est jamais administrateur.

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
| `RefreshToken` | 1 | `id`, `userId`, `familyId`, `tokenHash`, `expiresAt`, `revokedAt`, `replacedAt` |
| `Dog` | 1 | `id`, `ownerId`, `name`, `photoUrl`, `size`, `birthDate` (facultatif), `breed` (facultatif), `sociability`, `reactivity`, `leashHabit`, `description`, `createdAt` |
| `Walk` | 2 | `id`, `organizerId`, `title`, `description`, `startsAt`, `durationMinutes`, `location` (point géographique), `locationLabel`, `maxDogs`, `allowedSizes` (au moins une), `leashRule`, `rules`, `access`, `status`, `organizationId` (lot 4), `seriesId` (lot 3), `reminderSentAt` (interne, non exposé), `createdAt` |
| `Registration` | 2 | `id`, `walkId`, `dogId`, `userId`, `status`, `createdAt` |
| `WalkSeries` | 3 | `id`, `organizerId`, `timeZone` (`Europe/Paris`), `active`, `createdAt` |
| `Message` | 3 | `id`, `walkId`, `authorId` (nul si compte supprimé), `text` (1 000 caractères au plus), `createdAt` |
| `Device` | 3 | `id`, `userId`, `expoPushToken`, `platform`, `updatedAt` |
| `NotificationPreferences` | 3 | `userId`, `registrations`, `walkChanges`, `messages`, `reminders` (booléens, vrais par défaut) |
| `Organization` | 4 | `id`, `name`, `description`, `city`, `status`, `createdById`, `createdAt` |
| `Membership` | 4 | `id`, `organizationId`, `userId`, `role`, `status`, `createdAt` |
| `Block` | 4 | `id`, `blockerId`, `blockedId`, `createdAt` |
| `Report` | 4 | `id`, `reporterId` (nul si compte supprimé), `targetUserId`, `targetDogId`, `walkId` (tous facultatifs, au moins une cible), `type`, `facts`, `status`, `adminNote`, `createdAt` |

`MeResponse` (réponse de `GET /me`) contient en plus `email` et `isAdmin`, visibles de la personne elle-même seulement. `RefreshToken.familyId` est expliqué par l'ADR 0035 et `Walk.reminderSentAt` par la règle du rappel (§4.4).

## 4. Règles métier

### 4.1 Profils

- Un utilisateur ne modifie que son profil et ses chiens.
- Le profil public d'un utilisateur montre `displayName`, `bio`, `photoUrl` et ses chiens. L'e-mail n'est jamais exposé aux autres ; `GET /me` le renvoie à la personne elle-même, avec `isAdmin`.
- Un compte a 20 chiens au plus : au-delà, `dog.limit_reached` (ADR 0037).
- Supprimer un chien annule ses inscriptions à venir.
- La taille d'un chien ne peut pas changer tant qu'il est inscrit (`Pending` ou `Accepted`) à une balade à venir qui n'admet pas la nouvelle taille : code `dog.size_in_use`.

### 4.2 Balades

- Seul l'organisateur modifie ou annule une balade, et seulement avant son début.
- Le titre compte de 3 à 80 caractères, espaces de début et de fin exclus.
- Une balade commence au plus un an après sa création ou sa modification. *Règle ajoutée par la revue, à confirmer par le porteur du projet.*
- `maxDogs` ne peut pas descendre sous le nombre de chiens déjà acceptés : code `walk.capacity_below_registered`.
- Annuler une balade la passe à `Cancelled` et prévient les inscrits.
- La recherche renvoie les balades `Scheduled` à venir, dans un rayon autour d'un point, filtrables par période et par gabarit admis. Elle indique pour chacune la distance, le nombre de places prises et si elle est professionnelle.
- Le point de rendez-vous exact est visible par tous.
- Retirer un gabarit admis qu'un chien accepté possède est refusé : code `walk.size_in_use`.

### 4.3 Inscriptions

Une inscription concerne un chien. On peut inscrire plusieurs de ses chiens en une demande ; elle réussit ou échoue en bloc.

| Règle | Code d'erreur |
| --- | --- |
| La balade est `Scheduled`, n'a pas commencé, et son organisation (s'il y en a une) est `Approved` | `walk.not_open` |
| Le chien appartient à l'utilisateur | 404 |
| Le gabarit du chien est admis | `walk.size_not_allowed` |
| Le chien n'a pas déjà une inscription `Pending` ou `Accepted` | `registration.duplicate` |
| Il reste assez de places (seules les inscriptions `Accepted` comptent) et l'organisateur n'a pas bloqué l'utilisateur | `walk.full` |
| Balade professionnelle : l'utilisateur est membre accepté de l'organisation | `walk.members_only` |

- Accès `Open` : l'inscription est `Accepted` tout de suite. Accès `Approval` : elle est `Pending` jusqu'à la décision de l'organisateur.
- Le blocage par l'organisateur répond exactement comme une balade complète (`walk.full`) : la personne bloquée ne peut pas le deviner (ADR 0037).
- L'acceptation revérifie le statut de l'organisation, le gabarit, la capacité et l'adhésion.
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
| Signalement créé (`report_created`) | Administrateurs, sauf le signalant | Aucune : toujours envoyée |
| Demande d'adhésion reçue, adhésion acceptée, organisation validée | Personnes concernées | `registrations` |

- Un rappel est envoyé une fois par heure de début, même si le serveur redémarre : déplacer une balade après l'envoi du rappel en déclenche un nouveau.
- Les notifications sont envoyées au mieux : une notification en file est perdue si le serveur s'arrête, et un rappel n'est jamais envoyé deux fois (ADR 0019).
- Écrire dans le fil d'une balade annulée est refusé (`walk.not_open`) ; la lecture reste possible.

### 4.5 Récurrence

- Une balade créée avec `repeatWeekly` appartient à une série.
- Quand une balade de série commence, la suivante est créée sept jours plus tard à la même heure locale (`Europe/Paris`, changements d'heure compris). Il n'existe jamais plus d'une balade à venir par série.
- Les inscriptions ne sont pas reportées ; les inscrits de la précédente sont prévenus.
- L'organisateur peut arrêter la série. Annuler une balade n'arrête pas la série.
- La balade suivante reprend l'heure locale de la dernière balade de la série : modifier l'heure d'une balade décale les suivantes.

### 4.6 Organisations

- Tout utilisateur peut demander la création d'une organisation. Elle est `Pending` jusqu'à validation par un administrateur ; son créateur en est `Owner`.
- Seule une organisation `Approved` est visible des autres utilisateurs et peut porter des balades.
- Un utilisateur demande à rejoindre ; un `Owner` ou un `Educator` accepte ou refuse. L'`Owner` peut nommer un membre `Educator`.
- Une balade professionnelle porte un `organizationId`. Seuls l'`Owner` et les `Educator` d'une organisation `Approved` en créent. Elle est visible de tous et marquée comme professionnelle, mais l'inscription est réservée aux membres acceptés.
- La liste des membres n'est visible que de l'`Owner` et des `Educator`.
- Un utilisateur ne peut pas avoir plus de trois organisations `Pending` à la fois. Le seul `Owner` ne peut pas quitter son organisation.
- Une balade dont l'organisation n'est plus `Approved` (fermée ou refusée) est gelée : elle reste, avec ses inscriptions, mais n'en accepte plus (`walk.not_open`) ; l'organisateur peut l'annuler. Sa série s'arrête à la prochaine échéance. Une série s'arrête aussi quand son organisateur n'est plus responsable ni éducateur accepté de l'organisation.
- Quitter une organisation ou en être retiré annule les inscriptions à venir de la personne aux balades de cette organisation, sauf à celles qu'elle organise, sans notification (ADR 0037).

### 4.7 Blocage, signalement, administration

- Bloquer une personne l'empêche de s'inscrire aux balades que j'organise. Elle n'est pas prévenue et la réponse est exactement celle d'une balade complète (`walk.full`, §4.3).
- La fiche et la liste des balades indiquent `hasBlockedParticipant` quand l'organisateur ou un inscrit `Accepted` fait partie des personnes que j'ai bloquées.
- Un signalement vise une personne, un chien ou une balade. Il n'est visible que des administrateurs. À sa création, les administrateurs reçoivent une notification push qui ne donne que la catégorie, jamais les faits ni les personnes, et le signalement est journalisé (ADR 0036). Aucun e-mail n'est envoyé.
- Les administrateurs sont les comptes dont l'e-mail vérifié figure dans la configuration `Admin:Emails` (ADR 0020). En développement, la connexion de test accepte un e-mail pour créer un compte administrateur. Ils valident ou refusent les organisations, lisent et classent les signalements, suspendent ou rétablissent un compte.
- Suspendre un compte (ADR 0036) : arrête ses séries, annule ses balades à venir en prévenant les inscrits, supprime ses appareils et annule ses inscriptions à venir aux balades des autres. Rétablir un compte remet seulement son statut à `Active` et ne restaure rien. Un compte suspendu n'est pas administrateur.

### 4.8 Suppression de compte

Un compte suspendu peut supprimer son compte : c'est la seule écriture qui lui reste permise (ADR 0036).

Supprimer son compte :

- annule ses balades à venir et prévient les inscrits ;
- supprime ses chiens, inscriptions, appareils, adhésions, blocages et jetons ;
- ferme (`Closed`) les organisations dont il était le seul `Owner` ;
- conserve ses messages et ses signalements, sans auteur ;
- conserve les balades qu'il a organisées, sans organisateur : `organizer` peut donc être nul dans les réponses (ADR 0023).

Après une suppression ou une suspension, le jeton d'accès encore valide cesse de fonctionner immédiatement : le compte est relu à chaque requête.

## 5. Points d'entrée

Tous sous `/api/v1`.

### Lot 1

| Méthode et chemin | Rôle |
| --- | --- |
| `POST /auth/apple` | Échange un jeton d'identité Apple contre une session ; crée le compte au premier passage |
| `POST /auth/google` | Idem avec un jeton d'identité Google |
| `POST /auth/dev` | Session pour un compte de test ; actif seulement si `Auth:AllowDevLogin` vaut vrai, et seulement en `Development` ou `Testing` |
| `POST /auth/refresh` | Renouvelle la session |
| `POST /auth/logout` | Révoque la famille du jeton de rafraîchissement |
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
| `GET /organizations/{id}/memberships?limit` | Membres et demandes |
| `POST /organizations/{id}/memberships/{membershipId}/accept` et `/decline` | Décision sur une demande |
| `PATCH /organizations/{id}/memberships/{membershipId}` | Changer le rôle |
| `DELETE /organizations/{id}/memberships/{membershipId}` | Quitter ou retirer |
| `POST /blocks`, `GET /me/blocks`, `DELETE /blocks/{userId}` | Bloquer, lister, débloquer |
| `POST /reports` | Signaler |
| `GET /admin/organizations?status`, `POST /admin/organizations/{id}/approve` et `/reject` | Valider les organisations |
| `GET /admin/reports`, `PATCH /admin/reports/{id}` | Traiter les signalements |
| `POST /admin/users/{id}/suspend` et `/unsuspend` | Suspendre un compte |
| `DELETE /me` | Supprimer son compte |

### Développement seulement

Permis seulement en `Development` et `Testing`, anonymes (ADR 0027 et 0031).

| Méthode et chemin | Rôle |
| --- | --- |
| `POST /dev/demo-data` | Génère le jeu de données fictif autour de Seppois-le-Haut |
| `GET /dev/demo-data` | Dit si le jeu de démonstration est présent |
| `DELETE /dev/demo-data` | Supprime le jeu de démonstration |

Les listes (`/me/dogs`, `/walks`, `/me/walks`, `/organizations`, `/me/organizations`, `/me/blocks` et les listes d'administration) acceptent toutes `limit` (§1).

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
| Alerte de signalement | Notification push aux administrateurs, sans e-mail (ADR 0036) | Aucun fournisseur d'e-mails n'est choisi |
| Administration | Points d'entrée `/admin`, sans écran | Suffisant à l'échelle d'un pilote |
| Nom de l'application | Uzu (nom affiché), slug Expo `uzu` | Décision du porteur du projet (ADR 0041) ; le dépôt et le code gardent le nom `dogo` |
| Identifiant de l'application | `com.victorsauter.uzu` (bundle iOS et paquet Android), schéma de lien `uzu://` | Figé au premier envoi à un store (ADR 0039, 0041) |
| Fuseau des séries | `Europe/Paris` | Le pilote est en France |
| Centre de la carte par défaut | Seppois-le-Haut, réglable par configuration | C'est la zone pilote |
| Données de démonstration | Jeu fictif autour de Seppois-le-Haut, activable en développement seulement (ADR 0027) | Essayer l'application sans attendre de vrais utilisateurs |

L'hébergement (serveur, base, sauvegardes) n'est pas choisi : voir le [guide de déploiement](deploiement.md).
