# ADR 0028 — Onglet Balades : carte en plein écran et liste dans un panneau coulissant

- **Statut :** Accepté
- **Date :** 19/11/2026
- **Note :** décision prise par le porteur du produit après avoir essayé deux prototypes sur simulateur et sur iPhone. Elle n'est pas encore développée ; voir le [plan](../plan-panneau-balades.md).

## Contexte

L'onglet Balades empile une carte, sur un bon tiers de l'écran, et la liste des balades de la zone visible. La carte est agréable, mais elle occupe cette place en permanence : il ne reste de quoi afficher qu'une balade et demie.

Deux dispositions de remplacement ont été prototypées et essayées côte à côte, avec les données de démonstration autour de Seppois-le-Haut :

- **Liste, carte à la demande** : la liste en plein écran, un bouton « Carte » qui ouvre la carte en plein écran.
- **Panneau coulissant** : la carte en plein écran, la liste dans un panneau à trois hauteurs.

L'application vise aussi Android et des personnes peu à l'aise avec un téléphone.

## Décision

L'onglet Balades affiche la carte en plein écran, avec la liste dans un panneau coulissant.

- Le panneau a trois positions : basse (poignée, nombre de balades, haut de la première fiche), milieu, haute (jusque sous les filtres). Il s'ouvre au milieu.
- L'en-tête du panneau est un vrai bouton dont le texte annonce l'action : « Voir la liste », « Agrandir la liste », « Voir la carte ». Aucun geste n'est obligatoire.
- Toucher une épingle remonte le panneau et place cette balade en tête de liste, mise en évidence.
- La liste suit la zone visible de la carte, comme aujourd'hui.

## Conséquences

- La carte et la liste sont visibles ensemble dès l'ouverture, et chacune peut prendre presque tout l'écran.
- L'application dépend d'une bibliothèque de panneau (`@gorhom/bottom-sheet`) et, directement, de `react-native-gesture-handler` et `react-native-reanimated`. Leur compatibilité est à revérifier à chaque montée de version d'Expo.
- Le geste « tirer pour rafraîchir » disparaît de la liste : en position haute, il empêchait de redescendre le panneau. Il faut une autre façon d'actualiser.
- Sur un petit écran avec un texte agrandi, les filtres et le panneau laissent très peu de carte : la disposition doit être adaptée à ce cas.
- Le comportement sur Android n'a jamais été observé. Les gestes entre le panneau, la liste et la carte y sont le principal risque.

## Alternatives écartées

- **Liste, carte à la demande.** Plus évidente : elle s'ouvre sur les balades, chaque action est un bouton nommé et rien ne dépend d'un glissement. C'était la recommandation de l'orchestrateur et du sous-agent qui a construit les deux prototypes. Écartée après essai : elle paraît datée, et elle ne montre pas d'un coup d'œil qu'une balade se trouve juste à côté, ce que la carte fait immédiatement.
- **Disposition actuelle.** La carte prend trop de place en permanence.
- **Deux onglets, Liste et Carte.** Une place de menu de plus pour deux vues du même contenu.
