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

En Development, les migrations s'appliquent au démarrage, la connexion de test `POST /api/v1/auth/dev` est active et la description OpenAPI est servie sur `http://localhost:5080/openapi/v1.json`.

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

Les tests d'intégration démarrent un conteneur PostGIS avec Testcontainers (un seul pour toute la série ; chaque test repart d'une base vide). Seul Docker est nécessaire : les jetons Apple et Google sont validés par un faux validateur, les notifications sont enregistrées par un faux expéditeur, aucun test n'appelle le réseau. Les tâches planifiées sont éteintes dans les tests, qui les appellent avec une horloge contrôlée.

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
- Toute écriture d'un compte suspendu renvoie 403 `account.suspended` (middleware global).

### Photos

`PUT /api/v1/me/photo` et `PUT /api/v1/dogs/{id}/photo` reçoivent un formulaire multipart avec un champ `file` : JPEG, PNG, WebP ou HEIC, 5 Mo au plus, format vérifié sur le contenu. Erreurs : 413 `photo.too_large`, 415 `photo.unsupported_type`, 400 `validation.failed` si le fichier manque.

Les photos sont servies sans authentification sur `/photos/{fichier}` (hors `/api/v1`, noms aléatoires impossibles à deviner). **`photoUrl` est un chemin relatif à l'origine de l'API**, par exemple `/photos/3f2a….jpg` : l'application le préfixe par l'URL de base de l'API (`http://localhost:5080` + `photoUrl`). Les fichiers sont écrits dans `Storage:Local:Path` (`./data/photos` par défaut, relatif à `src/Dogo.Api/`, ignoré par git).

### Balades et inscriptions (lot 2)

- **Lieu.** `location` vaut `{ "latitude": …, "longitude": … }` en degrés WGS 84 ; stocké en `geography(Point, 4326)` avec un index GiST. La recherche filtre et trie dans PostGIS (`ST_DWithin`, `ST_Distance`, en mètres).
- **Recherche** `GET /walks?lat&lng` (obligatoires) `&radiusKm` (10 par défaut, 100 au plus) `&from&to` (ISO 8601, `+` encodé en `%2B`) `&size&limit` : balades `Scheduled` pas encore commencées, triées par début puis par distance, avec `distanceMeters` et `acceptedDogsCount`.
- **Mes balades** `GET /me/walks?role=Organizer|Participant&when=Upcoming|Past` : valeurs d'énumération en PascalCase comme partout ; balades annulées comprises ; `myRegistrations` donne le statut de mes inscriptions sur chaque balade.
- **Fiche** `GET /walks/{id}` : `participants` (inscriptions `Accepted`), `myRegistrations` (les miennes, tout statut), `pendingRegistrations` (rempli pour l'organisateur seulement). Une balade annulée ou passée reste lisible.
- **Champs des lots suivants**, déjà dans le contrat : `isProfessional`, `organization`, `hasBlockedParticipant` valent `false`/`null` (une seule méthode à compléter : `LaterLotFields.For`) ; `repeatsWeekly` est rempli depuis le lot 3.
- **Inscriptions** `POST /walks/{id}/registrations` `{ "dogIds": [...] }` (1 à 10) : tout ou rien, 201 avec les inscriptions créées. `DELETE …/registrations/{registrationId}` (propriétaire, 204), `…/accept` et `…/decline` (organisateur, 200).
- **Concurrence.** Toute écriture qui dépend de la capacité verrouille la ligne de la balade (`SELECT … FOR UPDATE`, ADR 0015) ; un index unique partiel interdit deux inscriptions actives d'un même chien.
- **Supprimer un chien** annule ses inscriptions à venir ; celles des balades passées sont gardées avec `dogId` à `null`.
- **Erreurs** (409 sauf mention) : `walk.not_found` (404), `walk.forbidden` (403), `walk.not_open`, `walk.full`, `walk.size_not_allowed`, `walk.capacity_below_registered`, `walk.size_in_use`, `registration.not_found` (404), `registration.forbidden` (403), `registration.duplicate`, `registration.not_active`, et `dog.not_found` (404) pour un chien inconnu ou d'un autre utilisateur.

Essai rapide (après la connexion de test de deux comptes) :

```bash
curl -s -X POST http://localhost:5080/api/v1/walks -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' \
  -d '{"title":"Tour du lac","startsAt":"2030-05-01T09:00:00Z","location":{"latitude":48.853,"longitude":2.35},
       "locationLabel":"Parvis","maxDogs":5,"allowedSizes":["Small","Medium"],"leashRule":"LeashRequired","access":"Open"}'
curl -s "http://localhost:5080/api/v1/walks?lat=48.85&lng=2.35&radiusKm=5" -H "Authorization: Bearer $BOB"
curl -s -X POST http://localhost:5080/api/v1/walks/<walkId>/registrations -H "Authorization: Bearer $BOB" \
  -H 'Content-Type: application/json' -d '{"dogIds":["<dogId>"]}'
```

### Fil, notifications et séries (lot 3)

- **Fil** `GET /walks/{id}/messages?before&limit` et `POST /walks/{id}/messages` `{ "text": "…" }` (1 à 1 000 caractères une fois les espaces de début et de fin retirés). Réservé à l'organisateur et aux propriétaires d'une inscription `Accepted` (une inscription dont le chien a été supprimé ne compte pas) : sinon 403 `message.forbidden`. Écrire sur une balade annulée : 409 `walk.not_open` ; la lecture reste permise, y compris après la balade.
- **Pagination du fil.** Réponse `{ "items": [...], "hasMore": bool }` : les `limit` (50 par défaut, 100 au plus) messages les plus récents, ou ceux plus anciens que le message d'id `before`, rangés du plus ancien au plus récent. `hasMore` vaut vrai s'il en existe de plus anciens : rappeler avec `before=<id du premier élément>`. Un `before` inconnu ou d'une autre balade : 400 `validation.failed`. Chaque message : `id`, `text`, `createdAt`, `author` (`{ id, displayName, photoUrl }`, `null` si le compte n'existe plus), `isMine`.
- **Appareils** `PUT /me/devices` `{ "expoPushToken": "ExponentPushToken[…]", "platform": "Ios" | "Android" }` → 200 `{ expoPushToken, platform, updatedAt }`. Un jeton appartient à un seul compte : l'enregistrer depuis un autre compte le déplace. `DELETE /me/devices/{token}` (jeton encodé dans l'URL) → 204, toujours, et ne retire que ses propres appareils.
- **Préférences** `GET /me/notification-preferences` et `PUT` (les quatre champs obligatoires) : `{ "registrations", "walkChanges", "messages", "reminders" }`, tous vrais tant que l'utilisateur ne les a pas changés (aucune ligne en base avant).
- **Séries.** `POST /walks` accepte `"repeatWeekly": true` (faux par défaut) : la balade appartient à une série (`Europe/Paris`) et `repeatsWeekly` vaut vrai dans les réponses tant que la série est active. `POST /walks/{id}/stop-series` (organisateur, depuis n'importe quelle balade de la série, idempotent) l'arrête : 403 `walk.forbidden`, 404 `walk.not_found`, 409 `walk.not_in_series`. Annuler une balade n'arrête pas la série.

#### Notifications

Chaque événement est déposé dans une file en mémoire **après** la validation de la transaction ; un service d'arrière-plan l'envoie (ADR 0019). La requête n'attend jamais l'envoi et n'échoue jamais à cause de lui ; les échecs sont journalisés. Le service retire l'auteur de l'action et les doublons, applique les préférences, puis envoie une notification par appareil. `data` vaut `{ "type": "<type>", "walkId": "<id>", "url": "dogo://walks/<id>" }`.

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

Les heures sont données dans le fuseau `Europe/Paris`. Les textes sont tous dans `Features/Notifications/NotificationTexts.cs` : ajouter un type, c'est une valeur de `NotificationType` et une ligne dans ce fichier. Une modification (`PATCH`) ne notifie que si une valeur change réellement.

**Envoi.** `Notifications:Provider` vaut `Log` (par défaut : la notification est seulement écrite dans le journal, sans le jeton) ou `Expo` (envoi par `https://exp.host/--/api/v2/push/send`, par lots de 100, un message par appareil ; un appareil signalé `DeviceNotRegistered` est supprimé). Pour activer l'envoi réel : `Notifications__Provider=Expo`, et `Notifications__Expo__AccessToken=<jeton>` seulement si la « sécurité renforcée des notifications » est activée dans le projet Expo. Les accusés de réception d'Expo ne sont pas consultés ; un échec HTTP (429, 5xx) est journalisé sans nouvel essai. Les tests remplacent l'envoi par un faux qui enregistre les messages : aucun test n'envoie de notification.

#### Tâches planifiées

`BackgroundJobsService` appelle toutes les `BackgroundJobs:Interval` (une minute par défaut) deux services, chacun dans sa portée ; une exception est journalisée et la boucle continue. `BackgroundJobs:Enabled=false` l'éteint (c'est le cas dans les tests, qui appellent les services directement avec une horloge `FakeTimeProvider`).

- **Rappel** (`WalkReminderJob`) : deux heures avant le début, pour les balades `Scheduled` pas encore commencées. Chaque rappel est réservé en base avant l'envoi (`UPDATE … SET reminder_sent_at … WHERE reminder_sent_at IS NULL … RETURNING`) : au plus un envoi, même avec plusieurs instances ou après un redémarrage. Changer l'heure de début d'une balade rend son rappel de nouveau dû.
- **Série** (`WalkSeriesJob`) : quand la dernière balade d'une série active a commencé (annulée ou non), crée la suivante sept jours plus tard à la même heure locale `Europe/Paris` (10:00 reste 10:00 aux changements d'heure ; une heure inexistante est avancée d'une heure, une heure ambiguë prend sa première occurrence). Après une longue interruption, seule la première occurrence future est créée. Les champs sont copiés, pas les inscriptions ; les inscrits `Accepted` de la précédente sont prévenus. La ligne de la série est verrouillée (`FOR UPDATE`) et la condition revérifiée : jamais plus d'une balade à venir par série.

Essai rapide (balade hebdomadaire et fil) :

```bash
curl -s -X PUT http://localhost:5080/api/v1/me/devices -H "Authorization: Bearer $ALICE" \
  -H 'Content-Type: application/json' -d '{"expoPushToken":"ExponentPushToken[essai-alice]","platform":"Ios"}'
curl -s -X POST http://localhost:5080/api/v1/walks -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' \
  -d '{"title":"Tour du lac","startsAt":"2030-05-04T08:00:00Z","location":{"latitude":48.853,"longitude":2.35},
       "locationLabel":"Parvis","maxDogs":5,"allowedSizes":["Small","Medium"],"leashRule":"LeashRequired","access":"Open","repeatWeekly":true}'
# après l'inscription d'un chien de Bob :
curl -s -X POST http://localhost:5080/api/v1/walks/<walkId>/messages -H "Authorization: Bearer $BOB" \
  -H 'Content-Type: application/json' -d '{"text":"On se retrouve au portail ?"}'
# le journal de l'API affiche : Push notification (not sent, log provider) to user <id d'Alice>: …
```

## Migrations

```bash
cd api
dotnet tool restore
dotnet ef migrations add <Nom> --project src/Dogo.Api --output-dir Infrastructure/Persistence/Migrations
```

Hors Development, les migrations ne s'appliquent pas au démarrage. Au choix :

```bash
# directement sur une base
ConnectionStrings__Dogo="Host=…;Database=dogo;Username=…;Password=…" \
  dotnet ef database update --project src/Dogo.Api

# ou un script SQL idempotent à relire puis exécuter
dotnet ef migrations script --idempotent --project src/Dogo.Api --output migrate.sql
```

## Description OpenAPI

`api/openapi.json` est régénéré à chaque `dotnet build` (paquet `Microsoft.Extensions.ApiDescription.Server`) et doit être versionné : la CI échoue s'il n'est pas à jour. Le client TypeScript du mobile est généré à partir de ce fichier. Chaque point d'entrée déclare un `operationId` (`WithName`), un tag, un résumé et toutes ses réponses, y compris d'erreur.

## Configuration

| Clé | Variable d'environnement | Défaut | Rôle |
| --- | --- | --- | --- |
| `ConnectionStrings:Dogo` | `ConnectionStrings__Dogo` | — (Development : base Docker) | Base PostgreSQL + PostGIS |
| `Auth:Jwt:SigningKey` | `Auth__Jwt__SigningKey` | — (Development : valeur de dev) | Clé HMAC des jetons d'accès, 32 octets au moins ; démarrage refusé sinon |
| `Auth:Jwt:Issuer`, `Auth:Jwt:Audience` | `Auth__Jwt__Issuer`, `Auth__Jwt__Audience` | `dogo-api`, `dogo-app` | Émetteur et audience des jetons d'accès |
| `Auth:AllowDevLogin` | `Auth__AllowDevLogin` | `false` (Development : `true`) | Active `POST /auth/dev` ; démarrage refusé si vrai en Production |
| `Auth:Apple:Audiences` | `Auth__Apple__Audiences__0`, … | vide | Identifiants acceptés comme audience des jetons Apple (bundle id) |
| `Auth:Google:Audiences` | `Auth__Google__Audiences__0`, … | vide | Identifiants client OAuth acceptés pour Google |
| `Admin:Emails` | `Admin__Emails__0`, … | vide | E-mails des administrateurs (`isAdmin`) |
| `Storage:Local:Path` | `Storage__Local__Path` | `./data/photos` | Dossier des photos |
| `Notifications:Provider` | `Notifications__Provider` | `Log` | `Log` (journal seulement) ou `Expo` (envoi réel) |
| `Notifications:Expo:AccessToken` | `Notifications__Expo__AccessToken` | vide | Jeton d'accès Expo, seulement si la sécurité renforcée des notifications est activée |
| `BackgroundJobs:Enabled` | `BackgroundJobs__Enabled` | `true` | Fait tourner les rappels et les séries dans cette instance |
| `BackgroundJobs:Interval` | `BackgroundJobs__Interval` | `00:01:00` | Intervalle entre deux passages des tâches |

Exemple complet : [`.env.example`](.env.example). Durées fixées dans le code : jeton d'accès 15 minutes, jeton de rafraîchissement 30 jours, renouvelé à chaque usage (ADR 0009).

## Dépannage

- **Testcontainers ne trouve pas Docker ou reste bloqué au téléchargement de l'image** : vérifier `docker info`. Dans un environnement où l'assistant d'identifiants Docker (`credsStore`) n'est pas accessible, télécharger l'image une fois avec `docker pull --platform linux/amd64 postgis/postgis:18-3.6`.
- **Le premier démarrage de la base est long** sur Apple silicon (émulation amd64) : `--wait` attend qu'elle soit prête.
