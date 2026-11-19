# ADR 0033 — Fin de session expliquée, persistance sûre et délais réseau sur mobile

- **Statut :** Proposé
- **Date :** 18/11/2026
- **Note :** décidé par l'agent mobile, sur délégation, après une revue de la session et du réseau ; à confirmer. Précise l'[ADR 0014](0014-session-mobile.md) (fin de session, déconnexion) et l'[ADR 0022](0022-notifications-push-mobile.md) (ordre de la déconnexion).

## Contexte

L'ADR 0014 fermait la session dès que `POST /auth/refresh` répondait 4xx. Un proxy ou la limitation de débit (429) déconnectait donc la personne sans un mot, alors que l'API ne refuse vraiment le renouvellement que par 401 (jeton invalide ou révoqué) ou 403 `account.suspended`. Une fin de session n'était jamais expliquée, et un 401 qui persistait après un renouvellement laissait une session inutilisable.

Côté stockage, un échec d'écriture du jeton renouvelé laissait l'ancien jeton dans le trousseau : le présenter au lancement suivant révoque toutes les sessions de l'utilisateur (ADR 0009). À la déconnexion, un échec d'effacement local sautait la révocation et la session revenait au lancement suivant. Enfin, aucune requête n'avait de délai.

## Décision

- **Fin de session.** Seuls un 401 sur `/auth/refresh`, un 403 `account.suspended` sur `/auth/refresh`, ou un 401 sur la requête rejouée après un renouvellement réussi ferment la session. Tout le reste (réseau, délai dépassé, 5xx, 429, 404, 408, 413…) est passager : la session est gardée. Une fin imposée porte une raison (`expired` ou `suspended`) que l'écran de connexion affiche par le même mécanisme que la suppression de compte (`setSignInNotice`). Un 429 a son message français.
- **Persistance.** L'état en mémoire est la référence et est publié tout de suite ; les opérations du stockage sécurisé sont ensuite appliquées une à une, dans l'ordre des appels, de sorte que le stockage finit toujours dans le même état que la mémoire. Une écriture est réessayée (3 essais) ; si elle échoue encore, l'entrée stockée est effacée (ou écrasée par une valeur vide) pour qu'un ancien jeton ne soit jamais présenté, la session restant en mémoire pour ce lancement. Le magasin ne rejette jamais.
- **Déconnexion.** Après le retrait de l'appareil (ADR 0022), la révocation part toujours, en arrière-plan, quel que soit le sort de l'effacement local, et l'état passe à « déconnecté ». Cela remplace l'ordre « effacer, puis révoquer » de l'ADR 0014.
- **Délais.** Chaque requête, y compris `/auth/refresh` et `/auth/logout`, a un délai de 20 s (60 s pour l'envoi d'une photo) jusqu'à la réception des en-têtes, combiné avec le signal d'annulation de l'appelant. Un délai dépassé donne une `ApiError` réseau marquée `timedOut`, avec son message ; une requête expirée n'est réessayée qu'une fois par TanStack Query.
- **Configuration de distribution.** Hors développement (`__DEV__`), une adresse d'API absente ou qui n'est pas en `https` affiche un écran d'erreur de configuration au démarrage ; la connexion de test et les données de démonstration exigent `__DEV__` en plus de `EXPO_PUBLIC_DEV_LOGIN=true`.

## Conséquences

- Une limitation de débit, un proxy capricieux ou un réseau lent ne déconnectent plus personne ; la personne voit pourquoi elle doit se reconnecter.
- Un échec durable du trousseau coûte au pire une reconnexion au lancement suivant, jamais la révocation de toutes les sessions.
- Un 400 sur `/auth/refresh` (corps invalide) est traité comme passager : il n'arrive qu'avec un jeton stocké vide, que `parseSession` n'écarte pas.
- Le délai ne couvre pas la lecture du corps, courte pour les réponses de l'API.

## Alternatives écartées

- **Garder « tout 4xx ferme la session ».** Déconnecte sur une erreur de proxy ou un 429.
- **Écrire dans le stockage avant de publier l'état.** Les requêtes concurrentes utiliseraient l'ancien jeton pendant l'écriture, et une déconnexion pendant l'écriture laisserait quand même la session sur le disque sans file d'attente ; c'est l'ordre des opérations de stockage qui garantit la cohérence, pas l'ordre publication/écriture.
- **`AbortSignal.timeout` et `AbortSignal.any`.** Présents dans React Native 0.88, mais un minuteur et un `AbortController` distinguent avec certitude un délai d'une annulation, quelle que soit l'erreur levée par `expo/fetch` (un `FetchError` « fetch failed: … »).
- **Respecter `Retry-After` en mettant les requêtes en attente.** Plus complexe ; le message suffit pour la V1.
