# ADR 0009 — Jetons de session : jeton d'accès JWT court et jeton de rafraîchissement rotatif

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** accepté par l'orchestrateur, sur délégation, pour lancer le développement ; à confirmer.

## Contexte

L'ADR 0006 laisse l'API émettre « son propre jeton de session » après vérification du jeton Apple ou Google, mécanisme à préciser au lot 1. L'application mobile garde la session dans le stockage sécurisé de l'appareil et la renouvelle seule. Un administrateur doit pouvoir suspendre un compte avec effet immédiat sur les écritures.

## Décision

- **Jeton d'accès :** JWT signé en HMAC-SHA256 avec une clé de configuration (`Auth:Jwt:SigningKey`, 32 octets au moins, variable d'environnement en déploiement), valable 15 minutes, dont le `sub` est l'identifiant de l'utilisateur.
- **Jeton de rafraîchissement :** valeur aléatoire opaque de 256 bits, stockée hachée (SHA-256), valable 30 jours, remplacée à chaque usage. Présenter un jeton déjà révoqué révoque tous les jetons de l'utilisateur. La révocation de l'ancien jeton est une mise à jour conditionnelle : de deux renouvellements simultanés, un seul réussit.
- La validation des jetons Apple et Google (clés publiées JWKS, émetteur, audience, expiration) est derrière l'interface `IIdentityTokenValidator`, remplacée par un faux dans les tests.
- Le statut suspendu est lu en base à chaque écriture (middleware), pas porté par le jeton ; la connexion et le renouvellement sont refusés à un compte suspendu.

## Conséquences

- Pas de session côté serveur à consulter pour lire : un jeton d'accès volé reste valable au plus 15 minutes.
- Une fuite de la base ne donne pas de jeton de rafraîchissement utilisable ; un vol de jeton est détecté dès que le voleur ou le titulaire réutilise l'ancien.
- Une requête d'écriture coûte une lecture du statut de l'utilisateur.
- Changer la clé de signature déconnecte tout le monde au plus 15 minutes, le temps du renouvellement.

## Alternatives écartées

- **Transmettre le jeton Apple ou Google à chaque appel.** Leur durée est courte et leur renouvellement dépend du fournisseur ; la connexion de test n'en a pas.
- **JWT signé par clé asymétrique (RS256).** Utile si d'autres services vérifiaient les jetons ; ce n'est pas le cas, et une clé symétrique se configure plus simplement.
- **Jeton de rafraîchissement JWT non stocké.** Impossible à révoquer à la déconnexion ou à la suspension.
- **Session en cookie.** Inadaptée à une application mobile native.
