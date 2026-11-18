# ADR 0031 — Durcissement de l'API : environnements en liste blanche, limitation de débit, en-têtes transférés

- **Statut :** Proposé
- **Date :** 18/11/2026

## Contexte

Une revue de sécurité a relevé que l'API n'avait aucun durcissement. Les garde-fous de la connexion de test et des données de démonstration ne refusaient que l'environnement `Production` : un serveur nommé `Staging` acceptait `POST /auth/dev` avec n'importe quel e-mail, donc celui d'un administrateur (ADR 0020), et `DELETE /dev/demo-data`, anonyme. La clé de signature de développement est versionnée. Rien ne limitait le débit, alors que la connexion appelle Apple et Google et que plusieurs écritures notifient d'autres personnes ou remplissent le disque. L'API sera déployée derrière un proxy inverse, ce qui pose la question de l'adresse du client.

## Décision

**Liste blanche d'environnements.** Les outils de développement (connexion de test, données de démonstration, comptes de test administrateurs) ne sont admis qu'en `Development` et `Testing` (environnement des tests automatisés). Tout autre nom est traité comme la production : démarrage refusé si l'un est activé, et un compte du fournisseur `Dev` n'y est jamais administrateur. Un compte suspendu n'est pas administrateur. Hors Development, la clé de développement connue, une chaîne de connexion vide ou l'absence du fuseau `Europe/Paris` empêchent le démarrage ; en Production, le fournisseur de notifications `Log` et l'absence de toute audience Apple et Google aussi.

**Limitation de débit.** Un limiteur global (`Microsoft.AspNetCore.RateLimiting`), placé après l'authentification et chaîné en trois fenêtres fixes : `/api/v1/auth/*` par adresse IP (IPv6 regroupé par /64) ; toutes les écritures par utilisateur (par IP sans session) ; en plus, les écritures sensibles (inscriptions, messages, demandes d'adhésion, signalements, photos, appareils) par utilisateur, plus strictement. Les écritures sensibles sont reconnues par le nom de leur point d'entrée, dans un seul fichier, pour que les fonctionnalités n'aient rien à déclarer. Le refus est un 429 `rate_limit.exceeded` au format problem+json avec `Retry-After`. Les limites sont configurables (section `RateLimiting`) ; la suite de tests les coupe.

**En-têtes transférés.** `X-Forwarded-For` et `X-Forwarded-Proto` ne sont lus que si `Proxy:Enabled` est vrai, et seulement depuis les proxys ou réseaux configurés (en plus de la boucle locale, par défaut du middleware), avec une seule entrée lue par défaut (`ForwardLimit` = 1). S'y ajoutent HSTS hors Development, `X-Content-Type-Options: nosniff` partout et un corps de requête limité à 256 Ko, sauf les photos.

## Conséquences

- Un environnement de recette se nomme comme on veut sans ouvrir de porte ; il ne doit simplement pas s'appeler `Development` ni `Testing`.
- Les compteurs sont en mémoire et par instance : avec plusieurs instances, la limite effective est multipliée. Suffisant pour la V1 ; une limite partagée demanderait un magasin commun ou la passerelle.
- Une nouvelle écriture qui notifie quelqu'un ou stocke un fichier doit être ajoutée à `RateLimiting.SensitiveEndpoints` ; un test vérifie que chaque nom listé existe.
- Plusieurs utilisateurs derrière une même adresse (NAT d'opérateur mobile) partagent la limite de `/auth` : la valeur par défaut (60 par minute) en tient compte.
- L'application mobile doit traiter le 429 : attendre `Retry-After` secondes et afficher un message, sans réessayer en boucle.
- Le champ `isAdmin` de `GET /me` ne regarde encore que l'e-mail (`MeResponse`, hors du périmètre de ce changement) ; l'autorisation réelle vérifie le compte complet.

## Alternatives écartées

- **Garder une liste noire (`IsProduction`).** Tout nom d'environnement imprévu ouvre la connexion de test.
- **Limites posées point d'entrée par point d'entrée** (`RequireRateLimiting`). Disperse la politique dans chaque fonctionnalité et laisse passer les nouvelles routes oubliées.
- **Limiter seulement au proxy.** Dépend de l'hébergement, ne connaît pas l'utilisateur et laisse l'API nue en local ou si le proxy change.
- **Faire confiance à tout `X-Forwarded-For`** (`ASPNETCORE_FORWARDEDHEADERS_ENABLED`). Un client choisirait son adresse et contournerait la limite par IP.
- **Fenêtre glissante ou seau à jetons.** Plus lisses, mais la fenêtre fixe suffit à ces volumes et donne un `Retry-After` simple.
