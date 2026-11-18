# ADR 0014 — Session mobile : stockage sécurisé et renouvellement unique du jeton

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** accepté par l'orchestrateur, sur délégation, pour lancer le développement ; à confirmer.

## Contexte

L'API émet un jeton d'accès de 15 minutes et un jeton de rafraîchissement de 30 jours, renouvelé à chaque usage (spécification §1). Si deux requêtes simultanées renouvellent la session avec le même jeton de rafraîchissement, la seconde présente un jeton déjà consommé. La personne doit rester connectée après un redémarrage, et ne pas être déconnectée parce qu'elle est hors ligne.

## Décision

- La session (jetons, échéance, utilisateur) est conservée dans `expo-secure-store` (trousseau iOS, Keystore Android), dans un magasin indépendant de React (`src/auth/sessionStore.ts`), lu par `SessionProvider` / `useSession()`.
- Toutes les requêtes passent par un `fetch` enveloppé (`src/api/authFetch.ts`) qui ajoute le jeton, le renouvelle une minute avant l'échéance et après une réponse 401, puis rejoue la requête une fois.
- Un seul renouvellement à la fois : les requêtes concurrentes attendent la même promesse.
- La session est fermée seulement quand l'API refuse le renouvellement (4xx). Une erreur réseau ou 5xx garde la session.
- La déconnexion efface d'abord la session sur l'appareil, puis révoque le jeton auprès de l'API sans attendre, et vide le cache des données.

## Conséquences

- Les écrans n'ont jamais à gérer l'expiration du jeton.
- Les points d'entrée `/auth/*` ne reçoivent jamais le jeton d'accès et ne déclenchent pas de renouvellement.
- L'appel de renouvellement et celui de déconnexion sont écrits à la main, avec des types locaux (`src/api/types.ts`), car ils doivent exister avant le schéma généré.
- L'utilisateur gardé dans la session est celui de la dernière connexion ou du dernier renouvellement ; les écrans de profil lisent `GET /me` par une requête.

## Alternatives écartées

- **AsyncStorage.** Non chiffré : inadapté à un jeton valable 30 jours.
- **Renouvellement dans un intercepteur par requête, sans partage.** Provoque des renouvellements concurrents qui s'invalident.
- **Déconnecter à tout échec de renouvellement.** Déconnecterait les personnes dans une zone sans réseau, fréquent en balade.
