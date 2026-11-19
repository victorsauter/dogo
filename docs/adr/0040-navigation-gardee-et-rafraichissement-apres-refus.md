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

- **Un seul garde pour les navigations déclenchées par un appui.** `useGuardedRouter` (`src/lib/navigation.ts`) remplace `useRouter` : `push`, `navigate` et `replace` ignorent la même destination (chemin et paramètres) tant que la navigation réclamée est en cours (voir « Révision après la recette finale » : la fenêtre fixe de 800 ms d'origine est remplacée). Revenir puis rouvrir la même balade n'est jamais gêné, et une autre destination ne l'est pas non plus. Une règle ESLint interdit `useRouter` en dehors de ce fichier.
- **Un refus 404 ou 409 d'une écriture rafraîchit les données.** Le `MutationCache` du client de requêtes invalide toutes les requêtes (celles à l'écran se rechargent, les autres sont marquées périmées), sans attendre : le message du refus s'affiche tout de suite et l'écran se met à jour derrière. Un mécanisme unique couvre inscription, acceptation, adhésion, chien.
- **Une erreur définitive (4xx hors 408 et 429) propose « Retour », pas « Réessayer ».** `ErrorState` quitte l'écran (retour, ou accueil quand aucun écran ne précède, comme pour un lien profond).
- **La mise en page suit la taille du texte.** `useLargeText` (facteur de police de 1,3 ou plus) retire les limites de lignes des titres, empile les rangées de boutons et fait grandir les hauteurs minimales (`scaledSize`), plafonnées à deux fois (trois pour la zone de message). Les initiales d'un avatar ne suivent pas le facteur (elles vivent dans un rond de taille fixe). Les bornes fixes sont remplacées par des mesures (hauteur réelle du bouton « Carte » sous la liste).

## Conséquences

- Un double appui ne produit plus qu'une navigation ; toute nouvelle navigation par appui passe par `useGuardedRouter`.
- Après un 404 ou un 409, un rechargement de plus part vers l'API (peu coûteux, rare).
- Les tests tournent à la taille de texte normale ; `setFontScale` (`src/test/fontScale.ts`) règle un facteur précis.
- Vérifié depuis sur appareil (recette finale) : le clavier sur Android (corrigé, voir la révision), les très grandes tailles de police sur iOS (`accessibility-extra-large`) et à 130 % et 200 % sur Android.

## Alternatives écartées

- **Désactiver le bouton pendant la navigation.** Chaque carte et chaque bouton aurait besoin d'un état ; la garde est centralisée.
- **Un délai seul, sans levée au changement d'écran.** Il gênerait un retour suivi d'une réouverture rapide.
- **Lever le garde au retour du focus de l'écran d'origine.** Chaque `useGuardedRouter` aurait besoin du contexte de navigation de son écran ; il sert aussi hors écran (racine, notifications). Le chemin courant, observé une seule fois à la racine, suffit.
- **Rafraîchir ciblé écran par écran après chaque refus.** Dispersé et oublié à la première nouvelle écriture.
- **Plafonner partout `maxFontSizeMultiplier`.** Priverait de leur réglage d'accessibilité les personnes qui en ont besoin ; le plafond ne vaut que là où la mise en page ne peut pas suivre.

## Révision après la recette finale (19/11/2026)

**Constat.** Sur Expo Go en développement, machine chargée, trois appuis sur « + » (ou sur une fiche de balade) espacés d'environ une seconde, avant que le nouvel écran ne soit affiché, empilaient deux écrans : la fenêtre fixe de 800 ms était écoulée au deuxième appui. Lever le garde au premier changement de chemin n'aidait pas non plus : un appui qui arrive sur l'ancien écran juste après ce changement passait.

**Décision.** Le garde suit la navigation, plus une horloge :

- une navigation laissée passer est « en cours » ; une autre vers la **même** destination est ignorée tant qu'elle l'est ;
- `useNavigationGuardReset`, monté à la racine, transmet chaque changement de `usePathname()` (`notePathname`). Le **premier** changement après la réclamation est la navigation elle-même : le garde tient encore (les appuis restés sur l'ancien écran sont ignorés, quel que soit leur retard). Le **deuxième** (retour sur l'écran d'origine, ou départ ailleurs) la termine : la même destination se rouvre aussitôt ;
- tant que le chemin n'a pas changé du tout (navigation qui n'aboutit pas, ou destination déjà affichée), le garde tombe au bout de 5 s (`PENDING_NAVIGATION_TIMEOUT_MS`), pour ne jamais bloquer définitivement ;
- une destination différente n'est jamais retenue (lien de notification, redirection de session, autre fiche) : elle remplace la navigation en cours.

**Pourquoi le chemin plutôt que le focus.** Le chemin courant est global et observé en un seul point ; le focus demanderait le contexte de navigation de chaque écran, absent là où le routeur gardé sert aussi (racine, notifications). La règle ESLint et l'interface de `useGuardedRouter` ne changent pas.

**Limite connue.** Un deuxième appui qui tombe, sur le nouvel écran, sur un autre élément touchable (sur l'émulateur : la carte de l'organisateur, à l'endroit de la fiche touchée) ouvre cette autre destination : c'est une vraie navigation, différente, que le garde ne peut pas distinguer d'un choix volontaire.

**Android, clavier et fil de messages.** `measureInWindow` ne compte pas la barre d'état sur Android bord à bord (56 au lieu de 80 sous un en-tête, mesuré sur l'émulateur) : le décalage donné à `KeyboardAvoidingView` était trop court et la moitié du champ du fil restait sous le clavier. `Screen` prend désormais `measure` (`pageY`) sur Android et garde `measureInWindow` sur iOS (`measureScreenTop`). Le défilement vers le dernier message est relancé à l'image suivante : sur Android, `contentSizeChange` arrive avant que la vue native connaisse la nouvelle hauteur, et un message envoyé restait sous le champ.

**Taille du texte.** Android annonce son réglage « 130 % » comme 1,2999999 : le seuil de `useLargeText` a une tolérance de 0,001. Avec un grand texte, les pastilles de filtres de la liste passent à la ligne au lieu d'une rangée coupée au bord de l'écran. Le mot du bouton flottant « Carte » est plafonné à 1,5 fois (`maxFontSizeMultiplier`) : flottant au-dessus des fiches, il en masquait la plus grande partie, ce qui est le cas prévu ci-dessus d'un plafond « là où la mise en page ne peut pas suivre ».
