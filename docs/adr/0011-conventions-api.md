# ADR 0011 — Conventions de code de l'API : fonctionnalités, erreurs, OpenAPI et tests

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** accepté par l'orchestrateur, sur délégation, pour lancer le développement ; à confirmer.

## Contexte

Le lot 1 pose le socle que les lots 2 à 4 recopieront, écrits par d'autres agents. L'ADR 0004 fixe l'organisation par fonctionnalité ; l'ADR 0007 fait de la description OpenAPI une partie du contrat avec le mobile. Il faut des règles assez simples pour être suivies sans relecture de tout le code.

## Décision

- **Fonctionnalités.** Un dossier par domaine sous `src/Dogo.Api/Features/` : entité et sa configuration EF, `XxxEndpoints.MapXxxEndpoints()` appelée depuis `Program.cs`, requêtes et réponses en `record`, règles. Les gestionnaires utilisent `DogoDbContext` directement ; un service de fonctionnalité (`SessionService`) seulement si la logique est partagée. Ni couche générique, ni AutoMapper, ni MediatR.
- **Transverse.** `Infrastructure/` pour la persistance, l'authentification et le stockage ; `Common/` pour les erreurs, la validation et OpenAPI.
- **Erreurs.** Toutes au format problem details (RFC 9457) avec une extension `code` stable `{domaine}.{raison}`, construites par `Problems` avec une constante de `ErrorCodes`. Les erreurs du cadre (validation, 401, 404, exception) reçoivent un code par défaut. Validation par attributs DataAnnotations (validation intégrée de .NET 10), clés d'erreur en camelCase.
- **Données.** GUID version 7 créés par le code, `CreatedAt` posé à l'enregistrement (`IHasCreatedAt`), noms de tables et colonnes en snake_case, énumérations stockées en texte. Migrations EF versionnées, appliquées au démarrage en Development seulement.
- **OpenAPI.** Générée à la compilation dans `api/openapi.json` (version 3.1) et versionnée. Chaque point d'entrée déclare `WithName` (operationId en camelCase), un tag par fonctionnalité, un résumé et toutes ses réponses (`Produces…`) ; les codes 401 sont déclarés sur le groupe authentifié.
- **Tests.** Tests d'intégration avec `WebApplicationFactory` contre une vraie base PostGIS lancée par Testcontainers : un conteneur pour toute la série, tables vidées avant chaque test, tests exécutés en série. Les dépendances externes (fournisseurs d'identité, plus tard notifications et e-mails) sont remplacées par des faux.

## Conséquences

- Ajouter une fonctionnalité touche son dossier, `Program.cs`, `ErrorCodes`, une migration et `openapi.json`.
- Le client TypeScript reçoit des types exacts (champs requis, nullables, énumérations en chaînes, réponses d'erreur).
- Les tests sont lents au premier lancement (téléchargement de l'image, émulation amd64 sur Apple silicon) mais vérifient le vrai SQL ; leur exécution en série reste rapide (une centaine de tests en une dizaine de secondes).

## Alternatives écartées

- **Base en mémoire ou SQLite pour les tests.** Ne vérifie ni PostGIS ni le comportement de PostgreSQL.
- **Une base par classe de test.** Permettrait le parallélisme, au prix d'une migration par classe ; inutile à ce volume.
- **FluentValidation.** Une dépendance de plus alors que la validation intégrée de .NET 10 couvre le besoin et alimente la description OpenAPI.
- **Description OpenAPI écrite à la main.** Se désaccorde du code.
