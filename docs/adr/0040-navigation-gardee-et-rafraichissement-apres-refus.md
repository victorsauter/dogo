# ADR 0040 — Navigation gardée contre les appuis répétés, rafraîchissement après un refus 404 ou 409, mise en page qui suit la taille du texte

- **Statut :** Proposé
- **Date :** 19/11/2026
- **Note :** décidé par l'agent mobile du lot « synchronisation avec l'API », sur délégation ; à confirmer.

## Contexte

La recette sur simulateur et la revue de l'API (ADR 0031 à 0037) ont fait ressortir trois défauts de fond de l'application :

- des appuis rapides sur une carte de balade ou sur « + » ouvraient l'écran deux ou trois fois : Expo Router met un `push` en file et ne l'applique qu'un instant plus tard ;
- les règles de l'API changent l'état des choses à l'insu de l'écran (organisation gelée, demande dont l'auteur est parti, balade pleine, adhésion retirée) : l'écran affichait le refus mais gardait des données périmées ;
- avec la taille de texte maximale, des hauteurs fixes et des limites de lignes coupaient des titres, recouvraient des cartes et rognaient des boutons.

## Décision

- **Un seul garde pour les navigations déclenchées par un appui.** `useGuardedRouter` (`src/lib/navigation.ts`) remplace `useRouter` : `push`, `navigate` et `replace` ignorent la même destination (chemin et paramètres) dans les 800 ms qui suivent. Le garde est levé dès que l'écran a changé (`useNavigationGuardReset`, monté à la racine) : revenir puis rouvrir la même balade n'est jamais gêné, et une autre destination ne l'est pas non plus. Une règle ESLint interdit `useRouter` en dehors de ce fichier.
- **Un refus 404 ou 409 d'une écriture rafraîchit les données.** Le `MutationCache` du client de requêtes invalide toutes les requêtes (celles à l'écran se rechargent, les autres sont marquées périmées), sans attendre : le message du refus s'affiche tout de suite et l'écran se met à jour derrière. Un mécanisme unique couvre inscription, acceptation, adhésion, chien.
- **Une erreur définitive (4xx hors 408 et 429) propose « Retour », pas « Réessayer ».** `ErrorState` quitte l'écran (retour, ou accueil quand aucun écran ne précède, comme pour un lien profond).
- **La mise en page suit la taille du texte.** `useLargeText` (facteur de police de 1,3 ou plus) retire les limites de lignes des titres, empile les rangées de boutons et fait grandir les hauteurs minimales (`scaledSize`), plafonnées à deux fois (trois pour la zone de message). Les initiales d'un avatar ne suivent pas le facteur (elles vivent dans un rond de taille fixe). Les bornes fixes sont remplacées par des mesures (hauteur réelle du bouton « Carte » sous la liste).

## Conséquences

- Un double appui ne produit plus qu'une navigation ; toute nouvelle navigation par appui passe par `useGuardedRouter`.
- Après un 404 ou un 409, un rechargement de plus part vers l'API (peu coûteux, rare).
- Les tests tournent à la taille de texte normale ; `setFontScale` (`src/test/fontScale.ts`) règle un facteur précis.
- Non vérifié sur appareil : le comportement réel des très grandes tailles de police (iOS « Texte plus grand », Android) et du clavier sur Android.

## Alternatives écartées

- **Désactiver le bouton pendant la navigation.** Chaque carte et chaque bouton aurait besoin d'un état ; la garde est centralisée.
- **Un délai seul, sans levée au changement d'écran.** Il gênerait un retour suivi d'une réouverture rapide.
- **Rafraîchir ciblé écran par écran après chaque refus.** Dispersé et oublié à la première nouvelle écriture.
- **Plafonner partout `maxFontSizeMultiplier`.** Priverait de leur réglage d'accessibilité les personnes qui en ont besoin ; le plafond ne vaut que là où la mise en page ne peut pas suivre.
