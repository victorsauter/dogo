# ADR 0034 — Robustesse des écrans : cache cumulatif du fil, écritures sans attente, navigation conditionnée au focus

- **Statut :** Proposé
- **Date :** 18/11/2026
- **Note :** décidé par l'agent mobile du lot « robustesse des écrans », sur délégation ; à confirmer.

## Contexte

Une revue des écrans a relevé des défauts qui ne se voient qu'en conditions réelles (réseau lent, retour arrière, refus de permission) et que les tests ne couvraient pas :

- sur un fil de plus de 50 messages, la dernière page lue par interrogation glissait, et les messages à la jonction avec les pages plus anciennes disparaissaient ;
- les mutations attendaient la fin du rechargement des listes qu'elles rendaient périmées : sur un réseau faible, « Créer » tournait alors que la balade existait déjà, et la personne la recréait ;
- un retour arrière pendant un enregistrement faisait dépiler un écran de trop quand la réponse arrivait ;
- une balade pouvait être publiée sur le centre par défaut de la carte, sans que l'épingle ait été touchée.

## Décision

- **Le fil de messages est un cache cumulatif.** La clé `['walks', id, 'messages']` garde tous les messages reçus. Chaque lecture de la dernière page est fusionnée (dédoublonnée par identifiant, triée par date) à ce que le cache contient au moment de la réponse, pas au moment de l'envoi de la requête. Si plus d'une page est arrivée entre deux lectures, les pages intermédiaires sont relues jusqu'à rejoindre ce qu'on avait. `hasMore` reste celui de l'extrémité la plus ancienne. L'envoi d'un message annule les lectures en cours avant d'écrire dans le cache.
- **Une écriture réussie rend la main sans attendre le rechargement.** `walksChanged`, `organizationsChanged` et `invalidateDogs` lancent les invalidations sans les attendre. Elles couvrent aussi ce qu'une balade affiche d'autrui (noms et photos, chiens, nom de l'organisation, balades à venir d'une organisation).
- **Après un `await`, on ne quitte un écran que s'il a toujours le focus.** Le crochet `useFocusedRouter` (`src/lib/hooks.ts`) donne `back()` et `replace()` qui ne font rien quand l'écran n'est plus celui de la personne. L'enregistrement a eu lieu dans tous les cas ; seule la navigation est sautée. Il est utilisé par tous les formulaires de création et de modification.
- **Une nouvelle balade exige un repère placé volontairement.** La carte démarre sur la position de l'utilisateur (ou sur un centre par défaut, avec un avertissement), mais la validation refuse tant que la personne n'a pas touché la carte ou déplacé le repère. À la modification d'une balade, le point enregistré compte comme placé.
- **Les préférences de notification s'enregistrent l'une après l'autre** (`scope` de mutation), chaque envoi portant les valeurs du cache au moment de son tour.

## Conséquences

- Le fil ne perd plus de message et reste correct après un envoi, une invalidation ou un retour sur l'écran, au prix d'un cache qui grossit avec la session (le cache est vidé à la déconnexion).
- Après une écriture, un écran peut afficher un instant l'ancien état d'une liste avant son rechargement (une ligne retirée reste visible jusqu'à la réponse) ; un deuxième appui sur la même action renvoie alors une erreur de l'API, affichée comme les autres.
- Créer une balade demande un geste de plus sur la carte, y compris quand la position est connue : le repère n'est jamais posé chez l'organisateur par défaut.
- Tout nouvel écran qui navigue après un `await` utilise `useFocusedRouter`.

## Alternatives écartées

- **`useInfiniteQuery` pour le fil.** Il relit toutes les pages à chaque rechargement, et sa jonction entre la dernière page et les plus anciennes souffre du même glissement.
- **Empêcher le retour arrière pendant l'envoi** (`beforeRemove`). Bloque la personne sur un réseau lent ; ne pas naviguer est plus simple et ne la retient pas.
- **Garder l'attente des invalidations et ajouter un délai.** Ne règle pas le doublon, seulement sa fréquence.
- **Compter le repère comme placé quand la position est connue.** Publierait l'adresse de l'organisateur s'il crée la balade chez lui sans toucher la carte.
