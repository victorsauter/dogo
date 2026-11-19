# dogo — API

API .NET 10 (minimal API) de l'application dogo. Le contrat est dans [`docs/specification-v1.md`](../docs/specification-v1.md) ; les décisions techniques dans [`docs/adr/`](../docs/adr/).

## Prérequis

- SDK .NET 10 (`global.json` : 10.0.400 ou plus récent dans la même bande).
- Docker (base locale et tests d'intégration). L'image `postgis/postgis` n'existe qu'en amd64 : sur un Mac Apple silicon elle tourne en émulation, c'est plus lent mais fonctionnel.

## Démarrer en local

```bash
cd api
docker compose up -d --wait        # PostgreSQL + PostGIS sur localhost:54329 (projet compose « dogo »)
dotnet run --project src/Dogo.Api  # API sur http://localhost:5080, environnement Development
```

En Development, les migrations s'appliquent au démarrage, la connexion de test `POST /api/v1/auth/dev` est active, l'adresse `admin@dogo.local` est administratrice (voir « Agir en administrateur en local »), les données de démonstration sont disponibles (voir « Données de démonstration ») et la description OpenAPI est servie sur `http://localhost:5080/openapi/v1.json`.

Arrêter la base sans perdre les données : `docker compose -p dogo down` (le volume `dogo_dogo-db` est conservé ; `down -v` le supprime).

Essai rapide :

```bash
curl -s -X POST http://localhost:5080/api/v1/auth/dev \
  -H 'Content-Type: application/json' -d '{"subject":"alice","displayName":"Alice"}'
# puis : -H "Authorization: Bearer <accessToken>" sur les autres routes
```

## Tests

```bash
cd api
dotnet test
```

Les tests d'intégration démarrent un conteneur PostGIS avec Testcontainers (un seul pour toute la série ; chaque test repart d'une base vide). Ils tournent dans l'environnement `Testing`, qui autorise comme `Development` la connexion de test et les données de démonstration ; la limitation de débit y est coupée, sauf dans `RateLimitingTests` et `HttpHardeningTests`, qui démarrent leur propre hôte. Seul Docker est nécessaire : les jetons Apple et Google sont validés par un faux validateur, les notifications et les signalements sont enregistrés par des faux, les sources de photos des données de démonstration sont simulées (`FakeDemoPhotoServer`), aucun test n'appelle le réseau. Les tâches planifiées sont éteintes dans les tests, qui les appellent avec une horloge contrôlée.

## Organisation du code

```
api/
├── Dogo.slnx, Directory.Build.props, Directory.Packages.props (versions centralisées), global.json
├── openapi.json                      # généré à la compilation, versionné
├── src/Dogo.Api/
│   ├── Program.cs                    # composition : services, middlewares, groupes de routes
│   ├── Common/                       # erreurs (Problems, ErrorCodes), validation, OpenAPI
│   ├── Infrastructure/               # Persistence (DbContext, migrations), Auth, Storage, Push, Jobs
│   └── Features/<Fonctionnalité>/    # entités, points d'entrée, requêtes/réponses, règles
└── tests/Dogo.Api.Tests/             # tests d'intégration, un dossier par fonctionnalité
```

Ajouter une fonctionnalité : voir l'[ADR 0011](../docs/adr/0011-conventions-api.md). En résumé, un dossier sous `Features/` avec l'entité et sa configuration EF, une classe `XxxEndpoints.MapXxxEndpoints()` appelée depuis `Program.cs`, des réponses construites par `Problems` avec un code de `ErrorCodes`, et ses tests sous `tests/Dogo.Api.Tests/<Fonctionnalité>/` en héritant de `ApiTestBase`.

## Conventions de l'API

- Toutes les routes sont sous `/api/v1`. Tout exige un jeton d'accès (`Authorization: Bearer …`) sauf `/api/v1/auth/*`, `/api/v1/health` et les photos.
- JSON en camelCase, énumérations en chaînes, dates en ISO 8601 UTC (`+00:00`), `birthDate` au format `AAAA-MM-JJ`.
- Erreurs au format `application/problem+json` (RFC 9457) avec une extension `code` stable (`dog.not_found`, `validation.failed`, `account.suspended`, `auth.invalid_token`…). Les erreurs de validation listent les champs fautifs dans `errors`, par nom JSON. Liste complète : `src/Dogo.Api/Common/ErrorCodes.cs`.
- `PATCH` modifie seulement les propriétés envoyées ; `null` laisse un champ obligatoire inchangé mais efface `birthDate` et `breed` ; une chaîne vide efface `bio`, `description` et `rules`.
- Trop de requêtes : 429 `rate_limit.exceeded`, avec l'en-tête `Retry-After` (secondes entières). Voir « Durcissement ».
- Corps de requête limité à 256 Ko (413 `request.too_large`), sauf le téléversement de photos (6 Mo).
- Toute écriture d'un compte suspendu renvoie 403 `account.suspended`, sauf `DELETE /me` (droit à l'effacement, ADR 0036), et toute requête d'un compte qui n'existe plus (supprimé avec un jeton d'accès encore valide) renvoie 401 `auth.invalid_token` : un middleware global (`AccountStatusMiddleware`) relit le compte à chaque requête authentifiée. Une route s'ouvre aux comptes suspendus par `.AllowWhileSuspended()` ; seule `DELETE /me` l'utilise.
- **Sessions** (ADR 0009, précisé par l'ADR 0035). `POST /auth/refresh` remplace le jeton de rafraîchissement à chaque usage ; les jetons issus d'une même connexion forment une famille. Représenter un jeton remplacé depuis moins de `Auth:Jwt:RefreshTokenGracePeriod` (60 s) rend une nouvelle session de la même famille, sans rien révoquer : réponse perdue, ou deux renouvellements simultanés (les deux réussissent). Après ce délai, c'est une alerte (journal en avertissement) : la famille entière est révoquée, les autres appareils de la personne restent connectés. `POST /auth/logout` révoque toute la famille du jeton. Les jetons expirés ou révoqués depuis plus de `Auth:Jwt:RefreshTokenRetention` (30 jours) sont purgés (voir « Tâches planifiées »).

### Photos

`PUT /api/v1/me/photo` et `PUT /api/v1/dogs/{id}/photo` reçoivent un formulaire multipart avec un champ `file` : JPEG, PNG ou WebP, 5 Mo au plus, format vérifié sur le contenu. **HEIC est refusé** (l'application mobile envoie toujours du JPEG). Erreurs : 413 `photo.too_large` (plus de 5 Mo, ou plus de 25 mégapixels), 415 `photo.unsupported_type` (format inconnu, HEIC, fichier qui ne se décode pas ou tronqué), 400 `validation.failed` si le fichier manque.

**Nettoyage** ([ADR 0032](../docs/adr/0032-nettoyage-des-photos.md)). Le serveur décode chaque photo puis la réécrit à partir de ses pixels avec SkiaSharp : aucune métadonnée ne survit (EXIF dont la position GPS, XMP, IPTC, commentaires, profil de couleur) et aucun contenu caché derrière un en-tête valide. L'orientation EXIF est appliquée aux pixels, l'image est réduite si son grand côté dépasse 2 048 px, le format reste celui du fichier (JPEG qualité 90, WebP qualité 85, PNG sans perte ; images animées : première image). Le même traitement s'applique aux photos des données de démonstration. Réglages facultatifs, par configuration ou variables d'environnement : `Photos:MaxPixels` (25 000 000), `Photos:MaxSide` (2048), `Photos:JpegQuality` (90), `Photos:WebpQuality` (85). **Mémoire** : un seul nettoyage à la fois ; le JPEG et le WebP sont décodés à taille réduite (la pleine résolution n'est jamais allouée), le PNG est décodé en entier (4 octets par pixel, d'où la limite de 25 Mpx). Pic mesuré par téléversement de 5 000 × 5 000 px sous Linux arm64 (conteneur limité à 512 Mo, runtime compris) : JPEG 66 Mo, WebP 51 Mo, PNG 157 Mo ; le pire cas est un PNG de 25 Mpx, environ 160 Mo. Code : `Features/Photos/PhotoProcessor.cs`. Sous Linux, `SkiaSharp.NativeAssets.Linux.NoDependencies` ne demande que la libc : l'image `mcr.microsoft.com/dotnet/aspnet` suffit, sans paquet système (sans cette variante, il faudrait `libfontconfig1`).

Les photos sont servies sans authentification sur `/photos/{fichier}` (hors `/api/v1`, noms aléatoires impossibles à deviner) avec `Cache-Control: private, max-age=86400`, `X-Content-Type-Options: nosniff` et `Content-Security-Policy: default-src 'none'; sandbox`. **`photoUrl` est un chemin relatif à l'origine de l'API**, par exemple `/photos/3f2a….jpg` : l'application le préfixe par l'URL de base de l'API (`http://localhost:5080` + `photoUrl`). Les fichiers sont écrits dans `Storage:Local:Path` (`./data/photos` par défaut, relatif à `src/Dogo.Api/`, ignoré par git). Supprimer un fichier ne lève jamais d'exception (`IPhotoStorage.DeleteAsync`) : un échec est journalisé en avertissement et le fichier reste sur le disque, sans faire échouer la requête.

### Balades et inscriptions (lot 2)

- **Lieu.** `location` vaut `{ "latitude": …, "longitude": … }` en degrés WGS 84 ; stocké en `geography(Point, 4326)` avec un index GiST. La recherche filtre et trie dans PostGIS (`ST_DWithin`, `ST_Distance`, en mètres).
- **Recherche** `GET /walks?lat&lng` (obligatoires) `&radiusKm` (10 par défaut, 100 au plus) `&from&to` (ISO 8601, `+` encodé en `%2B`) `&size&limit` : balades `Scheduled` pas encore commencées, triées par début puis par distance, avec `distanceMeters` et `acceptedDogsCount`.
- **Mes balades** `GET /me/walks?role=Organizer|Participant&when=Upcoming|Past` : valeurs d'énumération en PascalCase comme partout ; balades annulées comprises ; `myRegistrations` donne le statut de mes inscriptions sur chaque balade.
- **Fiche** `GET /walks/{id}` : `participants` (inscriptions `Accepted`), `myRegistrations` (les miennes, tout statut), `pendingRegistrations` (rempli pour l'organisateur seulement). Une balade annulée ou passée reste lisible.
- **Champs des lots suivants** : `repeatsWeekly` (lot 3), `isProfessional`, `organization` et `hasBlockedParticipant` (lot 4) sont remplis par `LaterLotFields.For`. `organizer` vaut `null` quand le compte de l'organisateur a été supprimé (ADR 0023).
- **Inscriptions** `POST /walks/{id}/registrations` `{ "dogIds": [...] }` (1 à 10) : tout ou rien, 201 avec les inscriptions créées. `DELETE …/registrations/{registrationId}` (propriétaire, 204), `…/accept` et `…/decline` (organisateur, 200).
- **Concurrence.** Toute écriture qui dépend de la capacité verrouille la ligne de la balade (`SELECT … FOR UPDATE`, ADR 0015) ; un index unique partiel interdit deux inscriptions actives d'un même chien.
- **Supprimer un chien** annule ses inscriptions à venir ; celles des balades passées sont gardées avec `dogId` à `null`.
- **Erreurs** (409 sauf mention) : `walk.not_found` (404), `walk.forbidden` (403), `walk.not_open`, `walk.full`, `walk.size_not_allowed`, `walk.capacity_below_registered`, `walk.size_in_use`, `registration.not_found` (404), `registration.forbidden` (403), `registration.duplicate`, `registration.not_active`, et `dog.not_found` (404) pour un chien inconnu ou d'un autre utilisateur.

Essai rapide (après la connexion de test de deux comptes) :

```bash
curl -s -X POST http://localhost:5080/api/v1/walks -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' \
  -d '{"title":"Tour du lac","startsAt":"2030-05-01T09:00:00Z","location":{"latitude":47.5324,"longitude":7.1858},
       "locationLabel":"Parking de la mairie","maxDogs":5,"allowedSizes":["Small","Medium"],"leashRule":"LeashRequired","access":"Open"}'
curl -s "http://localhost:5080/api/v1/walks?lat=47.5339&lng=7.1844&radiusKm=5" -H "Authorization: Bearer $BOB"
curl -s -X POST http://localhost:5080/api/v1/walks/<walkId>/registrations -H "Authorization: Bearer $BOB" \
  -H 'Content-Type: application/json' -d '{"dogIds":["<dogId>"]}'
```

### Fil, notifications et séries (lot 3)

- **Fil** `GET /walks/{id}/messages?before&limit` et `POST /walks/{id}/messages` `{ "text": "…" }` (1 à 1 000 caractères une fois les espaces de début et de fin retirés). Réservé à l'organisateur et aux propriétaires d'une inscription `Accepted` (une inscription dont le chien a été supprimé ne compte pas) : sinon 403 `message.forbidden`. Écrire sur une balade annulée : 409 `walk.not_open` ; la lecture reste permise, y compris après la balade.
- **Pagination du fil.** Réponse `{ "items": [...], "hasMore": bool }` : les `limit` (50 par défaut, 100 au plus) messages les plus récents, ou ceux plus anciens que le message d'id `before`, rangés du plus ancien au plus récent. `hasMore` vaut vrai s'il en existe de plus anciens : rappeler avec `before=<id du premier élément>`. Un `before` inconnu ou d'une autre balade : 400 `validation.failed`. Chaque message : `id`, `text`, `createdAt`, `author` (`{ id, displayName, photoUrl }`, `null` si le compte n'existe plus), `isMine`.
- **Appareils** `PUT /me/devices` `{ "expoPushToken": "ExponentPushToken[…]", "platform": "Ios" | "Android" }` → 200 `{ expoPushToken, platform, updatedAt }`. Le jeton doit avoir le format d'Expo (même règle que `Expo.isExpoPushToken` du SDK serveur) : `ExponentPushToken[…]` ou `ExpoPushToken[…]`, sans espace ni crochet à l'intérieur, ou l'ancienne forme UUID ; sinon 400 `validation.failed` sur `expoPushToken`. Un jeton appartient à un seul compte : l'enregistrer depuis un autre compte le déplace. Dix appareils au plus par compte : en enregistrer un de plus supprime celui dont l'enregistrement est le plus ancien (une réinstallation ou un nouveau téléphone donne un nouveau jeton, et l'application ne retire jamais l'ancien). `DELETE /me/devices/{token}` (jeton encodé dans l'URL) → 204, toujours, et ne retire que ses propres appareils.
- **Préférences** `GET /me/notification-preferences` et `PUT` (les quatre champs obligatoires) : `{ "registrations", "walkChanges", "messages", "reminders" }`, tous vrais tant que l'utilisateur ne les a pas changés (aucune ligne en base avant).
- **Séries.** `POST /walks` accepte `"repeatWeekly": true` (faux par défaut) : la balade appartient à une série (`Europe/Paris`) et `repeatsWeekly` vaut vrai dans les réponses tant que la série est active. `POST /walks/{id}/stop-series` (organisateur, depuis n'importe quelle balade de la série, idempotent) l'arrête : 403 `walk.forbidden`, 404 `walk.not_found`, 409 `walk.not_in_series`. Annuler une balade n'arrête pas la série.

#### Notifications

Chaque événement est déposé dans une file en mémoire **après** la validation de la transaction ; un service d'arrière-plan l'envoie (ADR 0019). La requête n'attend jamais l'envoi et n'échoue jamais à cause de lui ; les échecs sont journalisés. Le service retire l'auteur de l'action et les doublons, applique les préférences, puis envoie une notification par appareil. `data` vaut `{ "type": "<type>", "walkId": "<id>", "url": "dogo://walks/<id>" }` pour une balade, `{ "type": "<type>", "organizationId": "<id>", "url": "dogo://organizations/<id>" }` pour une organisation, `{ "type": "report_created", "reportId": "<id>" }` pour un signalement (sans `url` : aucun écran ne l'affiche, l'application montre la notification et ignore le toucher).

| `type` | Destinataires | Préférence | Titre | Texte |
| --- | --- | --- | --- | --- |
| `registration_created` | Organisateur (balade `Open`) | `registrations` | Nouvelle inscription | « {nom} participera à « {titre} ». » |
| `registration_requested` | Organisateur (balade `Approval`) | `registrations` | Nouvelle demande | « {nom} demande à participer à « {titre} ». » |
| `registration_accepted` | Auteur de l'inscription | `registrations` | Inscription acceptée | « Ta participation à « {titre} » est confirmée. » |
| `registration_declined` | Auteur (refus ou retrait) | `registrations` | Inscription refusée | « Ton inscription à « {titre} » n'a pas été retenue. » |
| `walk_updated` | Inscrits `Accepted` et `Pending` | `walkChanges` | Balade modifiée | « « {titre} » a changé : prévue le {jour date à HH:MM}. » |
| `walk_cancelled` | Inscrits `Accepted` et `Pending` | `walkChanges` | Balade annulée | « « {titre} », prévue le {…}, est annulée. » |
| `message_posted` | Organisateur et inscrits `Accepted`, sauf l'auteur | `messages` | {titre} | « {nom} : {début du message, 120 caractères} » |
| `walk_reminder` | Organisateur et inscrits `Accepted` | `reminders` | Balade bientôt | « « {titre} » commence à {HH:MM}. » |
| `series_walk_created` | Inscrits `Accepted` de la balade précédente | `walkChanges` | Nouvelle date | « « {titre} » revient le {…}. Inscris-toi à nouveau pour y participer. » |
| `membership_requested` | Responsable et éducateurs de l'organisation | `registrations` | Nouvelle demande d'adhésion | « {nom} demande à rejoindre « {organisation} ». » |
| `membership_accepted` | Auteur de la demande | `registrations` | Adhésion acceptée | « Tu fais maintenant partie de « {organisation} ». » |
| `organization_approved` | Responsable de l'organisation | `registrations` | Organisation validée | « « {organisation} » est validée : tu peux y proposer des balades. » |
| `report_created` | Administrateurs, sauf le signalant | aucune (toujours envoyée) | Nouveau signalement | « Un signalement « {catégorie} » attend d'être examiné. » |

Une suppression de compte et une suspension envoient aussi `walk_cancelled` aux inscrits des balades à venir de la personne. `report_created` ne donne que la catégorie (libellé français de `ReportType`) : ni les faits ni les personnes, puisque le texte s'affiche sur l'écran verrouillé. Une demande d'adhésion refusée n'est pas notifiée. Les heures sont données dans le fuseau `Europe/Paris`. Les textes sont tous dans `Features/Notifications/NotificationTexts.cs` : ajouter un type, c'est une valeur de `NotificationType` et une ligne dans ce fichier. Une modification (`PATCH`) ne notifie que si une valeur change réellement.

**Envoi.** `Notifications:Provider` vaut `Log` (par défaut : le titre et les données sont écrits dans le journal au niveau Information, le texte seulement au niveau Debug, jamais le jeton ; refusé en Production) ou `Expo` (envoi par `https://exp.host/--/api/v2/push/send`, par lots de 100, un message par appareil ; un appareil signalé `DeviceNotRegistered` est supprimé). Pour activer l'envoi réel : `Notifications__Provider=Expo`, et `Notifications__Expo__AccessToken=<jeton>` seulement si la « sécurité renforcée des notifications » est activée dans le projet Expo. Les accusés de réception d'Expo ne sont pas consultés ; un échec HTTP (429, 5xx) ou une réponse illisible (page d'erreur d'un proxy) est journalisé sans nouvel essai. Les jetons cités par Expo dans ses réponses sont masqués dans le journal (`ExponentPushToken[***]`). Les tests remplacent l'envoi par un faux qui enregistre les messages : aucun test n'envoie de notification.

#### Tâches planifiées

`BackgroundJobsService` appelle toutes les `BackgroundJobs:Interval` (une minute par défaut) le rappel et les séries, et toutes les `BackgroundJobs:PurgeInterval` (une heure) la purge des jetons, chacun dans sa portée ; une exception est journalisée et la boucle continue. Chaque passage dure au plus `BackgroundJobs:JobTimeout` (2 minutes) : au-delà, son jeton d'annulation est déclenché et la boucle cesse de l'attendre, même s'il l'ignore (erreur journalisée). `BackgroundJobs:Enabled=false` l'éteint (c'est le cas dans les tests, qui appellent les services directement avec une horloge `FakeTimeProvider`).

- **Purge des jetons** (`RefreshTokenPurgeJob`) : supprime par lots de 1 000 les jetons de rafraîchissement expirés ou révoqués depuis plus de `Auth:Jwt:RefreshTokenRetention`. Les lignes sont prises avec `FOR UPDATE SKIP LOCKED` : plusieurs instances se partagent le travail sans s'attendre (ADR 0035).

- **Rappel** (`WalkReminderJob`) : deux heures avant le début, pour les balades `Scheduled` pas encore commencées. Chaque rappel est réservé en base avant l'envoi (`UPDATE … SET reminder_sent_at … WHERE reminder_sent_at IS NULL … RETURNING`) : au plus un envoi, même avec plusieurs instances ou après un redémarrage. Changer l'heure de début d'une balade rend son rappel de nouveau dû.
- **Série** (`WalkSeriesJob`) : quand la dernière balade d'une série active a commencé (annulée ou non), crée la suivante sept jours plus tard à la même heure locale `Europe/Paris` (10:00 reste 10:00 aux changements d'heure ; une heure inexistante est avancée d'une heure, une heure ambiguë prend sa première occurrence). Après une longue interruption, seule la première occurrence future est créée. Les champs sont copiés, pas les inscriptions ; les inscrits `Accepted` de la précédente sont prévenus. La ligne de la série est verrouillée (`FOR UPDATE`) et la condition revérifiée : jamais plus d'une balade à venir par série.

Essai rapide (balade hebdomadaire et fil) :

```bash
curl -s -X PUT http://localhost:5080/api/v1/me/devices -H "Authorization: Bearer $ALICE" \
  -H 'Content-Type: application/json' -d '{"expoPushToken":"ExponentPushToken[essai-alice]","platform":"Ios"}'
curl -s -X POST http://localhost:5080/api/v1/walks -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' \
  -d '{"title":"Tour du lac","startsAt":"2030-05-04T08:00:00Z","location":{"latitude":47.5324,"longitude":7.1858},
       "locationLabel":"Parking de la mairie","maxDogs":5,"allowedSizes":["Small","Medium"],"leashRule":"LeashRequired","access":"Open","repeatWeekly":true}'
# après l'inscription d'un chien de Bob :
curl -s -X POST http://localhost:5080/api/v1/walks/<walkId>/messages -H "Authorization: Bearer $BOB" \
  -H 'Content-Type: application/json' -d '{"text":"On se retrouve au portail ?"}'
# le journal de l'API affiche : Push notification (not sent, log provider) to user <id d'Alice>: …
```

### Organisations, blocages, signalements, administration et suppression de compte (lot 4)

#### Organisations et adhésions

- **Créer** `POST /organizations` `{ "name" (3 à 80), "description"? (2 000 au plus), "city"? (80 au plus) }` → 201, organisation `Pending`, le créateur en est `Owner` (adhésion `Accepted`). Trois organisations `Pending` au plus par personne : 409 `organization.too_many_pending`.
- **Chercher** `GET /organizations?query&limit` : organisations `Approved` seulement, `query` sur le nom ou la ville sans tenir compte de la casse (`%` et `_` pris littéralement), triées par nom. Chaque élément : `{ id, name, description, city, status, memberCount, createdAt }` (`memberCount` : adhésions `Accepted`, tous rôles).
- **Lire** `GET /organizations/{id}` : `{ id, name, description, city, status, createdAt, memberCount, educators: [{ user, role }], myMembership: { id, role, status } | null, upcomingWalks: [...] }`. `educators` : le responsable puis les éducateurs ; `upcomingWalks` : ses 20 prochaines balades `Scheduled`, mêmes champs qu'un résultat de recherche sans `distanceMeters`. Une organisation non `Approved` n'est visible que de ses membres acceptés et des administrateurs : 404 `organization.not_found` pour les autres, comme si elle n'existait pas.
- **Modifier** `PATCH /organizations/{id}` (responsable seulement ; chaîne vide pour effacer `description` ou `city`) : 403 `organization.forbidden`, 409 `organization.closed`.
- **Mes organisations** `GET /me/organizations` : `[{ organization: {…résumé}, membership: { id, role, status } }]`, toutes mes adhésions quel que soit leur statut, y compris mes organisations en attente.
- **Adhésions** sous `/organizations/{id}/memberships` :
  - `POST` : demande `Pending` (rôle `Member`) sur une organisation `Approved` → 201 `{ id, organizationId, user, role, status, createdAt }`. 409 `membership.duplicate` si une adhésion ou une demande est en cours (une demande refusée peut être refaite), 409 `organization.not_approved` pour un administrateur ou un membre sur une organisation non validée.
  - `GET` (responsable et éducateurs) : `{ members: [...], requests: [...] }` ; 403 `organization.forbidden` pour les autres.
  - `POST /{membershipId}/accept` et `/decline` (responsable ou éducateur, idempotents) : 409 `membership.not_pending` sur une adhésion déjà décidée dans l'autre sens.
  - `PATCH /{membershipId}` `{ "role": "Member" | "Educator" }` (responsable seulement) : 400 si `Owner`, 409 `membership.owner_role` sur le responsable, 409 `membership.not_accepted` sur une demande.
  - `DELETE /{membershipId}` → 204 : quitter ou retirer sa demande (quel que soit le statut de l'organisation) ; le responsable ou un éducateur retire un `Member` ; seul le responsable retire un `Educator` ; personne ne retire le responsable ; le seul responsable ne peut pas partir (409 `membership.sole_owner`).
- **Balades professionnelles.** `POST /walks` accepte `"organizationId"` : seuls le responsable et les éducateurs d'une organisation `Approved` peuvent le donner (sinon 403 `walk.organization_forbidden`, y compris pour une organisation inconnue). La balade a alors `isProfessional: true` et `organization: { id, name }` partout. S'y inscrire demande une adhésion `Accepted` (tout rôle ; l'organisateur inscrit ses chiens librement) : sinon 403 `walk.members_only`. `PATCH /walks/{id}` ignore `organizationId` ; la balade suivante d'une série reprend l'organisation.

#### Blocages

- `POST /blocks` `{ "userId" }` → 200 `{ user, createdAt }`, idempotent ; 400 `block.self`, 404 `user.not_found`. `GET /me/blocks` → `[{ user, createdAt }]`, les plus récents d'abord. `DELETE /blocks/{userId}` → 204, idempotent.
- Une personne bloquée ne peut plus s'inscrire aux balades de celle qui l'a bloquée : 403 `walk.not_allowed`, avec un message générique. Ses inscriptions existantes restent ; l'organisateur peut encore accepter une demande en attente.
- `hasBlockedParticipant` (recherche, fiche, mes balades) vaut vrai quand l'organisateur ou le propriétaire d'un chien `Accepted` fait partie des personnes que **j'ai** bloquées ; calculé en SQL (sous-requête sur `blocks`).
- La personne bloquée n'est pas prévenue et ne voit aucune différence : aucune réponse ne dépend des blocages des autres, sauf ce refus d'inscription.

#### Signalements

- `POST /reports` `{ "type": "IncidentNoInjury" | "Altercation" | "BiteOrInjury" | "HumanBehavior", "facts" (10 à 4 000), "targetUserId"?, "targetDogId"?, "walkId"? }` → 201 `{ id, createdAt }`. Au moins une cible (400 `validation.failed` sur `target`), chacune doit exister (404 `user.not_found`, `dog.not_found`, `walk.not_found`), pas soi-même (400 `report.self`).
- Un signalement n'est lisible que par les administrateurs. Une fois enregistré, `IReportNotifier` prévient l'administration (ADR 0036) : `AdminReportNotifier` journalise l'identifiant et le type, et envoie la notification `report_created` à chaque administrateur (même règle que les routes `/admin`), sauf au signalant, quelles que soient ses préférences. Ni le journal ni la notification ne contiennent les faits ou les personnes. Aucun e-mail n'est envoyé : `Admin:ReportEmail` reste inutilisée (aucun fournisseur d'e-mails n'est choisi). Un administrateur sans appareil enregistré ne voit les signalements qu'avec `GET /admin/reports`.

#### Administration

Les administrateurs sont les comptes actifs dont l'e-mail (vérifié par Apple ou Google) figure dans `Admin:Emails` (ADR 0020). Un compte suspendu n'est plus administrateur ; un compte de la connexion de test ne l'est qu'en Development et Testing (ADR 0031). Le champ `isAdmin` de `GET /me` et des sessions suit la même règle. Tout `/admin/*` répond 403 `admin.forbidden` aux autres. Pas d'écran : ces routes s'appellent avec curl.

- `GET /admin/organizations?status&limit` (`Pending` par défaut, plus anciennes d'abord) → `[{ id, name, description, city, status, createdBy, memberCount, createdAt }]`.
- `POST /admin/organizations/{id}/approve` (notifie le responsable) et `/reject` (aussi pour retirer une organisation validée), idempotents ; 409 `organization.closed`.
- `GET /admin/reports?status&limit` (`Open` par défaut) → `[{ id, type, facts, status, adminNote, createdAt, reporter, targetUser, targetDog: { id, name, ownerId }, walk: { id, title, startsAt } }]` (références nulles si absentes ou supprimées). `PATCH /admin/reports/{id}` `{ "status"?, "adminNote"? }` (chaîne vide pour effacer la note) ; 404 `report.not_found`.
- `POST /admin/users/{id}/suspend` et `/unsuspend` → `{ id, displayName, status }`, idempotents ; 409 `admin.self_suspension`, 404 `user.not_found`.
- **Suspendre** (ADR 0036, « geler, annuler, laisser partir ») fait, en une transaction (`AccountSuspension`) : le compte passe à `Suspended` (écritures refusées aussitôt, sauf `DELETE /me`) et ses jetons de rafraîchissement sont révoqués ; ses séries hebdomadaires s'arrêtent (`active = false`) ; ses balades à venir passent à `Cancelled`, inscrits `Accepted` et `Pending` prévenus (`walk_cancelled`) après la validation, comme pour une annulation par l'organisateur ; ses appareils de notification sont supprimés ; ses inscriptions `Pending` et `Accepted` aux balades non commencées des autres passent à `Cancelled`, ce qui libère les places (sans notification, comme une annulation par la personne). Ses balades passées, ses chiens, ses messages, ses adhésions et les signalements restent.
- **Rétablir** remet seulement le compte à `Active` : rien n'est restauré (séries arrêtées, balades et inscriptions annulées, appareils et sessions supprimés). La personne se reconnecte et l'application réenregistre son appareil.

#### Agir en administrateur en local

`appsettings.Development.json` déclare `admin@dogo.local` dans `Admin:Emails`. La connexion de test accepte un champ `email` facultatif (seulement sur `/auth/dev`, tenu pour vérifié) :

```bash
ADMIN=$(curl -s -X POST http://localhost:5080/api/v1/auth/dev -H 'Content-Type: application/json' \
  -d '{"subject":"admin","displayName":"Admin","email":"admin@dogo.local"}' | jq -r .accessToken)
curl -s http://localhost:5080/api/v1/admin/organizations -H "Authorization: Bearer $ADMIN"
curl -s -X POST http://localhost:5080/api/v1/admin/organizations/<id>/approve -H "Authorization: Bearer $ADMIN"
```

#### Suppression de compte

`DELETE /me` → 204, en une transaction (spécification §4.8, ADR 0023) : ses balades à venir passent à `Cancelled` (inscrits `Accepted` et `Pending` prévenus après la validation) et toutes ses balades restent, avec `organizer: null` ; ses séries s'arrêtent ; ses chiens, inscriptions, appareils, préférences, adhésions, blocages (dans les deux sens) et jetons sont supprimés, ainsi que ses fichiers de photos ; les organisations dont il était le seul responsable passent à `Closed` ; ses messages et ses signalements restent sans auteur, et les signalements qui le visaient perdent cette cible. Ensuite, son jeton d'accès encore valide reçoit 401 `auth.invalid_token` partout. Un compte suspendu peut se supprimer : c'est la seule écriture qui lui reste (droit à l'effacement, ADR 0036) ; les signalements qui le visent sont conservés, sans cette cible.

Essai rapide (comptes de test, `$ADMIN` comme ci-dessus) :

```bash
OWNER=$(curl -s -X POST http://localhost:5080/api/v1/auth/dev -H 'Content-Type: application/json' -d '{"subject":"olga","displayName":"Olga"}' | jq -r .accessToken)
ORG=$(curl -s -X POST http://localhost:5080/api/v1/organizations -H "Authorization: Bearer $OWNER" -H 'Content-Type: application/json' \
  -d '{"name":"Club canin du lac","city":"Annecy"}' | jq -r .id)
curl -s -X POST http://localhost:5080/api/v1/admin/organizations/$ORG/approve -H "Authorization: Bearer $ADMIN"
curl -s -X POST http://localhost:5080/api/v1/organizations/$ORG/memberships -H "Authorization: Bearer $BOB"   # puis accept par $OWNER
curl -s -X POST http://localhost:5080/api/v1/walks -H "Authorization: Bearer $OWNER" -H 'Content-Type: application/json' \
  -d '{"title":"Cours collectif","startsAt":"2030-05-01T09:00:00Z","location":{"latitude":45.9,"longitude":6.13},
       "locationLabel":"Pâquier","maxDogs":8,"allowedSizes":["Small","Medium","Large"],"leashRule":"LeashRequired","access":"Open","organizationId":"'$ORG'"}'
curl -s -X POST http://localhost:5080/api/v1/blocks -H "Authorization: Bearer $OWNER" -H 'Content-Type: application/json' -d '{"userId":"<id>"}'
curl -s -X DELETE http://localhost:5080/api/v1/me -H "Authorization: Bearer $BOB"
```

## Données de démonstration (développement)

Pour essayer l'application avec une communauté réaliste, l'API sait créer un jeu de données fictif autour de Seppois-le-Haut (Haut-Rhin) : 50 propriétaires et 95 chiens, 10 éducateurs canins, 4 organisations validées et 1 en attente, 45 balades dans un rayon de 12 km (25 à venir sur trois semaines, 20 passées sur six semaines, dont 5 séries hebdomadaires, une balade complète et une annulée), leurs inscriptions, une vingtaine de fils de discussion, 3 blocages et 4 signalements. Voir l'[ADR 0027](../docs/adr/0027-donnees-de-demonstration.md).

**Activation.** `DemoData:Enabled` vaut `true` dans `appsettings.Development.json`, `false` partout ailleurs. Désactivées, les routes répondent 404 comme la connexion de test. L'API refuse de démarrer si `DemoData:Enabled` est vrai hors de Development et Testing (liste blanche, ADR 0031), ou si la connexion de test (`Auth:AllowDevLogin`) est coupée : les comptes de démonstration se connectent par elle.

| Route (anonyme) | Rôle |
| --- | --- |
| `POST /api/v1/dev/demo-data` `{ "photos": true }` | Supprime les données de démonstration existantes puis recrée le jeu complet, en une transaction ; répond `{ counts, photosRequested, photosStored, photosFailed }`. `photos` vaut `true` par défaut (corps facultatif). |
| `GET /api/v1/dev/demo-data` | `{ exists, counts, accounts }` : chaque compte a `subject`, `displayName`, `photoUrl`, `kind` (`Owner` ou `Educator`), `dogNames` et `organizationName` (l'organisation qu'un éducateur dirige ou anime, sinon `null`). |
| `DELETE /api/v1/dev/demo-data` | Supprime les comptes de démonstration et tout ce qui leur appartient, fichiers de photos compris → 204. |

```bash
curl -s -X POST http://localhost:5080/api/v1/dev/demo-data -H 'Content-Type: application/json' -d '{"photos":true}'
curl -s http://localhost:5080/api/v1/dev/demo-data | jq '.accounts[] | {subject, displayName, kind}'
# se connecter comme un compte de démonstration : la connexion de test avec son subject
curl -s -X POST http://localhost:5080/api/v1/auth/dev -H 'Content-Type: application/json' \
  -d '{"subject":"demo-marie-schmitt","displayName":"Marie Schmitt"}' | jq -r .accessToken
curl -s -X DELETE http://localhost:5080/api/v1/dev/demo-data
```

Comptes intéressants : `demo-marie-schmitt` (organise la balade complète, une série et plusieurs fils), `demo-thomas-haas` (a bloqué deux personnes : l'avertissement « Participant bloqué » apparaît sur plusieurs balades), `demo-sandrine-gutzwiller` (responsable du Club canin du Sundgau : membres et demandes), `demo-lucie-reinhard` (organisation en attente de validation). Pour les signalements, se connecter en administrateur (`admin@dogo.local`) et lire `GET /admin/reports`.

**Ce qui est touché.** Un compte de démonstration est un compte `Dev` dont le `providerSubject` commence par `demo-` (préfixe réservé). Générer ou supprimer ne modifie jamais un autre compte, ni ses chiens, balades, organisations ou messages : une balade de démonstration où un autre compte s'est inscrit ou a écrit est conservée comme celle d'un compte supprimé (annulée si elle est à venir, sans organisateur), de même qu'une organisation de démonstration qui a un autre membre. Seuls disparaissent, comme à toute suppression de compte, les blocages d'un compte de démonstration posés par un autre compte. Les dates sont relatives au moment de la génération : régénérer remet les balades « à venir » dans le futur. Le contenu est déterministe (mêmes noms, mêmes balades, mêmes fils à chaque génération). Le générateur (`Features/DemoData/`) sépare les tables (`DemoPeople`, `DemoBreeds`, `DemoPlaces`, `DemoCommunity`, `DemoWalks`, `DemoConversations`) de la logique (`DemoDataBuilder`) ; il écrit directement par le `DbContext` (balades passées, messages antidatés), en respectant toutes les règles de la spécification (un test les vérifie).

**Photos.** La moitié des personnes reçoit un avatar illustré et la moitié des chiens une photo de sa race (un chien par race, pour qu'aucune photo ne soit partagée), téléchargés au moment de la génération et rangés par `IPhotoStorage` après les mêmes contrôles qu'une photo envoyée (5 Mo au plus, format réel JPEG, PNG ou WebP, nettoyage des métadonnées). Rien n'est versionné.

| Pour | Source | Licence |
| --- | --- | --- |
| Personnes | [DiceBear](https://www.dicebear.com/), style « Notionists » (`https://api.dicebear.com/9.x/notionists/png?seed=demo-…`) : avatars dessinés, aucune photo de personne réelle | Style sous CC0 1.0 (remix de « Notionists » de Zoish) ; l'API HTTP est gratuite, sans clé, pour un usage non commercial et raisonnable (10 avatars PNG par seconde au plus) |
| Chiens | Photo principale de l'article Wikipédia anglais de la race (API MediaWiki `prop=pageimages`), gardée seulement si le fichier est sur Wikimedia Commons sous licence libre (vérifiée par l'API de Commons : CC0, domaine public, CC BY, CC BY-SA, « copyrighted free use ») | Licence propre à chaque fichier, consultable sur sa page Commons. Les licences CC BY et CC BY-SA demandent de créditer l'auteur en cas de diffusion : ces photos restent dans la base de développement et ne doivent pas être publiées telles quelles |

Les requêtes ne transportent aucune donnée d'utilisateur : un agent utilisateur générique (`DemoData:Photos:UserAgent`), la graine d'avatar est le `subject` fictif. Téléchargement parallèle (4 au plus, avatars espacés de 150 ms), 10 s par image, 60 s au total ; une réponse 429 est retentée une fois. Une erreur réseau, un délai dépassé ou une image refusée n'empêche jamais la génération : la photo est sautée et comptée dans `photosFailed`. Wikimedia limite les clients anonymes sans contact dans l'agent utilisateur ; quelques photos peuvent donc manquer si l'on régénère très souvent. Mesuré en local : environ 0,5 s sans photos, 5 à 7 s avec photos.

## Durcissement (ADR 0031)

**Environnements.** La connexion de test (`Auth:AllowDevLogin`) et les données de démonstration (`DemoData:Enabled`) ne sont admises qu'en `Development` et `Testing` (environnement des tests automatisés) : dans tout autre environnement (`Staging`, `Production`, une faute de frappe…), l'API refuse de démarrer si l'une est active. Ne jamais déployer un serveur en `Development` ou `Testing`.

**Contrôles au démarrage.** Hors Development, l'API refuse de démarrer si :
- `Auth:Jwt:SigningKey` est la clé de développement versionnée dans `appsettings.Development.json` ;
- `ConnectionStrings:Dogo` est vide ;
- le fuseau `Europe/Paris` est introuvable (image sans `tzdata` : installer le paquet) ; les séries et les textes des notifications en dépendent.

En Production, elle refuse aussi `Notifications:Provider=Log` (aucune notification ne partirait) et des audiences Apple et Google toutes deux vides (toute connexion serait refusée).

**Limitation de débit.** Compteurs en mémoire, par instance, fenêtres fixes, sans file d'attente :

| Limite | Portée | Clé | Défaut |
| --- | --- | --- | --- |
| `RateLimiting:Auth` | `/api/v1/auth/*` (toutes méthodes) | adresse IP du client (IPv6 : par /64) | 60 par minute |
| `RateLimiting:Writes` | toute écriture (POST, PUT, PATCH, DELETE) hors `/auth` | utilisateur connecté, sinon adresse IP | 60 par minute |
| `RateLimiting:SensitiveWrites` | en plus : inscriptions, messages, demandes d'adhésion, signalements, photos, enregistrement d'appareil | utilisateur connecté, sinon adresse IP | 30 par 10 minutes |

Au-delà : 429 `application/problem+json` avec `code` = `rate_limit.exceeded` et l'en-tête `Retry-After` (secondes). Les écritures sensibles sont reconnues par le nom de leur point d'entrée (`RateLimiting.SensitiveEndpoints`, un test vérifie que chaque nom existe) : une nouvelle écriture qui notifie quelqu'un ou stocke un fichier doit y être ajoutée. `RateLimiting:Enabled=false` coupe tout (c'est le cas dans la suite de tests).

**Proxy inverse.** Par défaut, l'API ignore `X-Forwarded-For` et `X-Forwarded-Proto` : sans proxy, un client pourrait y écrire l'adresse de son choix. Derrière un proxy, poser `Proxy__Enabled=true` et l'adresse du proxy (`Proxy__KnownProxies__0=10.0.0.2`) ou son réseau (`Proxy__KnownNetworks__0=10.0.0.0/24`) ; seuls ces émetteurs (et la boucle locale) sont crus, et seule l'entrée la plus à droite est lue (`Proxy:ForwardLimit`, 1 par défaut, à augmenter seulement pour une chaîne de proxys de confiance). Ne pas utiliser la variable `ASPNETCORE_FORWARDEDHEADERS_ENABLED` : elle fait confiance à n'importe quel émetteur.

**En-têtes et taille.** `X-Content-Type-Options: nosniff` sur toutes les réponses ; `Strict-Transport-Security` (un an, sans sous-domaines) sur les réponses HTTPS hors Development. Corps de requête limité à 256 Ko (413 `request.too_large`), sauf les photos qui gardent leur limite de 6 Mo.

**`AllowedHosts`.** Vaut `*` dans `appsettings.json`. En production, le fixer au nom public de l'API, par exemple `AllowedHosts=api.dogo.app` (plusieurs noms séparés par `;`) : une requête avec un autre en-tête `Host` reçoit 400.

**Journaux.** Le fournisseur `Log` n'écrit le texte des notifications (extrait des messages du fil) qu'au niveau Debug ; l'envoi par Expo masque les jetons d'appareil et tronque les réponses journalisées à 500 caractères.

**Administrateur affiché.** Le champ `isAdmin` renvoyé par `GET /me` et les sessions suit la règle complète (compte actif, compte de test seulement en Development et Testing), comme les routes `/admin`.

**Jetons d'identité.** Seul RS256 est accepté pour les jetons Apple et Google (`ValidAlgorithms`), le seul algorithme que publient leurs configurations OpenID.

## Migrations

```bash
cd api
dotnet tool restore
dotnet ef migrations add <Nom> --project src/Dogo.Api --output-dir Infrastructure/Persistence/Migrations
```

Hors Development, les migrations ne s'appliquent pas au démarrage. **En production, on utilise le bundle de migrations** que contient l'image (`/app/efbundle`, [ADR 0038](../docs/adr/0038-image-et-migrations-en-production.md)) :

```bash
docker run --rm --entrypoint ./efbundle -e "ConnectionStrings__Dogo=Host=…;Database=dogo;Username=…;Password=…" dogo-api:<étiquette>
```

Pour une base de développement ou la relecture du SQL, au choix :

```bash
# directement sur une base
ConnectionStrings__Dogo="Host=…;Database=dogo;Username=…;Password=…" \
  dotnet ef database update --project src/Dogo.Api

# ou un script SQL idempotent à relire puis exécuter
dotnet ef migrations script --idempotent --project src/Dogo.Api --output migrate.sql
```

## Image et déploiement

```bash
cd api
docker build -t dogo-api:local .   # image de production : utilisateur « app », port 8080, volume /data/photos
```

L'image contient l'API et le bundle de migrations. La construction de l'image n'écrit pas `openapi.json` (`OpenApiGenerateDocuments=false` dans le `Dockerfile` seulement). Procédure complète (architecture, variables, sauvegardes, hébergeurs, liste de contrôle) : [guide de déploiement](../docs/deploiement.md). Exemple Docker Compose de production : [`deploy/docker-compose.production.example.yml`](deploy/docker-compose.production.example.yml).

## Description OpenAPI

`api/openapi.json` est régénéré à chaque `dotnet build` (paquet `Microsoft.Extensions.ApiDescription.Server`) et doit être versionné : la CI échoue s'il n'est pas à jour. Le client TypeScript du mobile est généré à partir de ce fichier. Chaque point d'entrée déclare un `operationId` (`WithName`), un tag, un résumé et toutes ses réponses, y compris d'erreur.

## Configuration

| Clé | Variable d'environnement | Défaut | Rôle |
| --- | --- | --- | --- |
| `ConnectionStrings:Dogo` | `ConnectionStrings__Dogo` | — (Development : base Docker) | Base PostgreSQL + PostGIS |
| `Auth:Jwt:SigningKey` | `Auth__Jwt__SigningKey` | — (Development : valeur de dev) | Clé HMAC des jetons d'accès, 32 octets au moins ; démarrage refusé sinon, ou si c'est la clé de développement hors Development |
| `Auth:Jwt:Issuer`, `Auth:Jwt:Audience` | `Auth__Jwt__Issuer`, `Auth__Jwt__Audience` | `dogo-api`, `dogo-app` | Émetteur et audience des jetons d'accès |
| `Auth:AllowDevLogin` | `Auth__AllowDevLogin` | `false` (Development : `true`) | Active `POST /auth/dev` ; démarrage refusé si vrai hors de Development et Testing |
| `Auth:Apple:Audiences` | `Auth__Apple__Audiences__0`, … | vide | Identifiants acceptés comme audience des jetons Apple (bundle id) |
| `Auth:Google:Audiences` | `Auth__Google__Audiences__0`, … | vide | Identifiants client OAuth acceptés pour Google ; en Production, démarrage refusé si Apple et Google sont tous deux vides |
| `Admin:Emails` | `Admin__Emails__0`, … | vide (Development : `admin@dogo.local`) | E-mails des administrateurs (`isAdmin`, routes `/admin`), ADR 0020 |
| `Admin:ReportEmail` | `Admin__ReportEmail` | vide | Adresse à prévenir de chaque signalement ; pas encore utilisée (signalements journalisés et notifiés aux administrateurs par push) |
| `Auth:Jwt:RefreshTokenGracePeriod` | `Auth__Jwt__RefreshTokenGracePeriod` | `00:01:00` | Délai pendant lequel un jeton de rafraîchissement remplacé est encore accepté (ADR 0035) ; entre 0 (désactivé) et 5 minutes, démarrage refusé sinon |
| `Auth:Jwt:RefreshTokenRetention` | `Auth__Jwt__RefreshTokenRetention` | `30.00:00:00` | Durée de conservation des jetons expirés ou révoqués avant la purge |
| `Storage:Local:Path` | `Storage__Local__Path` | `./data/photos` | Dossier des photos |
| `Notifications:Provider` | `Notifications__Provider` | `Log` | `Log` (journal seulement) ou `Expo` (envoi réel) ; `Log` refusé en Production |
| `Notifications:Expo:AccessToken` | `Notifications__Expo__AccessToken` | vide | Jeton d'accès Expo, seulement si la sécurité renforcée des notifications est activée |
| `DemoData:Enabled` | `DemoData__Enabled` | `false` (Development : `true`) | Active `/dev/demo-data` ; démarrage refusé si vrai hors de Development et Testing ou sans `Auth:AllowDevLogin` (ADR 0027, 0031) |
| `DemoData:Photos:UserAgent` | `DemoData__Photos__UserAgent` | `dogo-demo-data/1.0 (development seed data)` | Agent utilisateur des téléchargements de photos de démonstration |
| `DemoData:Photos:Timeout`, `TotalTimeout` | `DemoData__Photos__Timeout`, … | `00:00:10`, `00:01:00` | Délai par image et pour l'ensemble des photos |
| `DemoData:Photos:MaxParallelDownloads` | `DemoData__Photos__MaxParallelDownloads` | `4` | Téléchargements simultanés |
| `RateLimiting:Enabled` | `RateLimiting__Enabled` | `true` | Limitation de débit (voir « Durcissement ») |
| `RateLimiting:Auth:PermitLimit`, `Window` | `RateLimiting__Auth__PermitLimit`, … | `60`, `00:01:00` | Requêtes `/auth` par adresse IP et par fenêtre |
| `RateLimiting:Writes:PermitLimit`, `Window` | `RateLimiting__Writes__PermitLimit`, … | `60`, `00:01:00` | Écritures par utilisateur et par fenêtre |
| `RateLimiting:SensitiveWrites:PermitLimit`, `Window` | `RateLimiting__SensitiveWrites__PermitLimit`, … | `30`, `00:10:00` | Écritures sensibles par utilisateur et par fenêtre |
| `Proxy:Enabled` | `Proxy__Enabled` | `false` | Lit `X-Forwarded-For` et `X-Forwarded-Proto` des proxys de confiance |
| `Proxy:KnownProxies`, `Proxy:KnownNetworks` | `Proxy__KnownProxies__0`, `Proxy__KnownNetworks__0`, … | vide (boucle locale seulement) | Adresses IP et réseaux CIDR des proxys de confiance ; démarrage refusé si une valeur est invalide |
| `Proxy:ForwardLimit` | `Proxy__ForwardLimit` | `1` | Nombre de proxys entre le client et l'API |
| `AllowedHosts` | `AllowedHosts` | `*` | Noms d'hôte acceptés (séparés par `;`) ; en production, le nom public de l'API |
| `BackgroundJobs:Enabled` | `BackgroundJobs__Enabled` | `true` | Fait tourner les rappels, les séries et la purge des jetons dans cette instance |
| `BackgroundJobs:Interval` | `BackgroundJobs__Interval` | `00:01:00` | Intervalle entre deux passages des tâches |
| `BackgroundJobs:PurgeInterval` | `BackgroundJobs__PurgeInterval` | `01:00:00` | Intervalle entre deux purges des jetons de rafraîchissement |
| `BackgroundJobs:JobTimeout` | `BackgroundJobs__JobTimeout` | `00:02:00` | Durée maximale d'un passage d'une tâche ; au-delà, elle est annulée et la boucle continue |

Exemple complet : [`.env.example`](.env.example). Durées par défaut : jeton d'accès 15 minutes, jeton de rafraîchissement 30 jours, renouvelé à chaque usage (ADR 0009), rejeu accepté 60 secondes (ADR 0035).

## Dépannage

- **Testcontainers ne trouve pas Docker ou reste bloqué au téléchargement de l'image** : vérifier `docker info`. Dans un environnement où l'assistant d'identifiants Docker (`credsStore`) n'est pas accessible, télécharger l'image une fois avec `docker pull --platform linux/amd64 postgis/postgis:18-3.6`.
- **Le premier démarrage de la base est long** sur Apple silicon (émulation amd64) : `--wait` attend qu'elle soit prête.
