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

Les tests d'intégration démarrent un conteneur PostGIS avec Testcontainers (un seul pour toute la série ; chaque test repart d'une base vide). Seul Docker est nécessaire : les jetons Apple et Google sont validés par un faux validateur, aucun test n'appelle le réseau.

## Organisation du code

```
api/
├── Dogo.slnx, Directory.Build.props, Directory.Packages.props (versions centralisées), global.json
├── openapi.json                      # généré à la compilation, versionné
├── src/Dogo.Api/
│   ├── Program.cs                    # composition : services, middlewares, groupes de routes
│   ├── Common/                       # erreurs (Problems, ErrorCodes), validation, OpenAPI
│   ├── Infrastructure/               # Persistence (DbContext, migrations), Auth, Storage
│   └── Features/<Fonctionnalité>/    # entités, points d'entrée, requêtes/réponses, règles
└── tests/Dogo.Api.Tests/             # tests d'intégration, un dossier par fonctionnalité
```

Ajouter une fonctionnalité : voir l'[ADR 0011](../docs/adr/0011-conventions-api.md). En résumé, un dossier sous `Features/` avec l'entité et sa configuration EF, une classe `XxxEndpoints.MapXxxEndpoints()` appelée depuis `Program.cs`, des réponses construites par `Problems` avec un code de `ErrorCodes`, et ses tests sous `tests/Dogo.Api.Tests/<Fonctionnalité>/` en héritant de `ApiTestBase`.

## Conventions de l'API

- Toutes les routes sont sous `/api/v1`. Tout exige un jeton d'accès (`Authorization: Bearer …`) sauf `/api/v1/auth/*`, `/api/v1/health` et les photos.
- JSON en camelCase, énumérations en chaînes, dates en ISO 8601 UTC (`+00:00`), `birthDate` au format `AAAA-MM-JJ`.
- Erreurs au format `application/problem+json` (RFC 9457) avec une extension `code` stable (`dog.not_found`, `validation.failed`, `account.suspended`, `auth.invalid_token`…). Les erreurs de validation listent les champs fautifs dans `errors`, par nom JSON. Liste complète : `src/Dogo.Api/Common/ErrorCodes.cs`.
- `PATCH` modifie seulement les propriétés envoyées ; `null` laisse un champ obligatoire inchangé mais efface `birthDate` et `breed` ; une chaîne vide efface `bio` et `description`.
- Toute écriture d'un compte suspendu renvoie 403 `account.suspended` (middleware global).

### Photos

`PUT /api/v1/me/photo` et `PUT /api/v1/dogs/{id}/photo` reçoivent un formulaire multipart avec un champ `file` : JPEG, PNG, WebP ou HEIC, 5 Mo au plus, format vérifié sur le contenu. Erreurs : 413 `photo.too_large`, 415 `photo.unsupported_type`, 400 `validation.failed` si le fichier manque.

Les photos sont servies sans authentification sur `/photos/{fichier}` (hors `/api/v1`, noms aléatoires impossibles à deviner). **`photoUrl` est un chemin relatif à l'origine de l'API**, par exemple `/photos/3f2a….jpg` : l'application le préfixe par l'URL de base de l'API (`http://localhost:5080` + `photoUrl`). Les fichiers sont écrits dans `Storage:Local:Path` (`./data/photos` par défaut, relatif à `src/Dogo.Api/`, ignoré par git).

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

Exemple complet : [`.env.example`](.env.example). Durées fixées dans le code : jeton d'accès 15 minutes, jeton de rafraîchissement 30 jours, renouvelé à chaque usage (ADR 0009).

## Dépannage

- **Testcontainers ne trouve pas Docker ou reste bloqué au téléchargement de l'image** : vérifier `docker info`. Dans un environnement où l'assistant d'identifiants Docker (`credsStore`) n'est pas accessible, télécharger l'image une fois avec `docker pull --platform linux/amd64 postgis/postgis:18-3.6`.
- **Le premier démarrage de la base est long** sur Apple silicon (émulation amd64) : `--wait` attend qu'elle soit prête.
