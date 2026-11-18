# ADR 0013 — Client d'API typé et cache des données avec TanStack Query

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** accepté par l'orchestrateur, sur délégation, pour lancer le développement ; à confirmer.

## Contexte

L'ADR 0007 impose un client généré depuis `api/openapi.json` sans choisir l'outil. Les écrans doivent afficher un chargement, une erreur en français avec « Réessayer », et se rafraîchir au retour dans l'application ou du réseau, sans temps réel (ADR 0008).

## Décision

- Les types sont générés par `openapi-typescript` (`npm run api:generate`, vers `src/api/schema.d.ts`, versionné).
- Les appels passent par `openapi-fetch`, un client mince qui lit ces types : `api.GET('/api/v1/me')`. Aucun code d'appel n'est généré.
- Les données distantes sont gérées par TanStack Query : chaque lecture est un `useQuery`, chaque écriture un `useMutation`, avec `unwrap()` qui transforme toute réponse en échec en `ApiError` portant un message français.
- Pas de nouvel essai sur une réponse 4xx ; deux nouveaux essais sur une erreur réseau ou 5xx. Rafraîchissement au retour au premier plan (`AppState`) et au retour du réseau (`expo-network`).

## Conséquences

- Un changement de contrat casse la vérification des types, pas l'exécution.
- Le client ne pèse presque rien et n'impose aucune structure de code générée.
- Les erreurs suivent un seul chemin : réponse RFC 9457 → `ApiError` → message du module de textes.
- `openapi-typescript` 7 déclare TypeScript 5 comme dépendance paire alors qu'Expo SDK 58 fournit TypeScript 6 ; un `overrides` npm l'accepte. La génération a été vérifiée avec TypeScript 6 ; à retirer quand l'outil déclarera TypeScript 6.

## Alternatives écartées

- **Orval ou openapi-generator.** Génèrent aussi les fonctions et les hooks : plus de code produit à relire, plus de configuration, et un style imposé.
- **`fetch` écrit à la main avec des types recopiés.** Contraire à l'ADR 0007.
- **État global (Redux, Zustand) pour les données serveur.** Le cache, l'invalidation et les nouveaux essais seraient à réécrire.
