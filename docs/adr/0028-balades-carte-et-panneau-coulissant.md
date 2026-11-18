# ADR 0028 — Onglet Balades : deux vues au choix, panneau coulissant par défaut

- **Statut :** Accepté
- **Date :** 19/11/2026
- **Note :** décision prise par le porteur du produit après avoir essayé deux prototypes sur simulateur et sur iPhone. Elle n'est pas encore développée ; voir le [plan](../plan-panneau-balades.md). Le choix d'une vue unique est reporté après les essais avec de vrais utilisateurs.

## Contexte

L'onglet Balades empile une carte, sur un bon tiers de l'écran, et la liste des balades de la zone visible. La carte est agréable, mais elle occupe cette place en permanence : il ne reste de quoi afficher qu'une balade et demie.

Deux vues de remplacement ont été prototypées et essayées côte à côte, avec les données de démonstration autour de Seppois-le-Haut :

- **Panneau** : la carte en plein écran, la liste dans un panneau coulissant à trois hauteurs.
- **Liste** : la liste en plein écran, un bouton « Carte » qui ouvre la carte en plein écran.

L'application vise aussi Android et des personnes peu à l'aise avec un téléphone. On ne sait pas encore laquelle des deux vues leur convient le mieux.

## Décision

L'application reste sur Expo, avec un seul code pour iPhone et Android, et garde les deux vues.

- La vue **Panneau** est celle par défaut. Elle montre la carte et la liste ensemble dès l'ouverture.
- La vue **Liste** reste disponible. Le choix se fait dans les réglages du profil, sous un intitulé simple (« Affichage des balades »), et il est mémorisé sur l'appareil.
- La disposition actuelle, carte et liste empilées, est retirée.
- Dans la vue Panneau, l'en-tête du panneau est un vrai bouton dont le texte annonce l'action : aucun geste n'est obligatoire.
- La règle définitive (une seule vue, ou une vue par défaut différente selon le public) sera fixée après les essais avec des utilisateurs.

## Conséquences

- Aucune décision irréversible n'est prise avant d'avoir vu des gens utiliser l'application.
- Deux vues sont à maintenir. Elles partagent la recherche, les filtres, les fiches et la carte ; ce qui est propre à chacune tient en deux fichiers d'environ 280 lignes. Le coût réel est ailleurs : chaque évolution de l'onglet Balades se vérifie deux fois, sur iPhone et sur Android.
- L'application dépend d'une bibliothèque de panneau (`@gorhom/bottom-sheet`) et, directement, de `react-native-gesture-handler` et `react-native-reanimated`. Leur compatibilité est à revérifier à chaque montée de version d'Expo.
- Dans la vue Panneau, le geste « tirer pour rafraîchir » disparaît : en position haute, il empêchait de redescendre le panneau. Il faut une autre façon d'actualiser.
- Deux personnes peuvent avoir deux écrans d'accueil différents, ce qui complique un peu l'explication en groupe.
- Le comportement sur Android n'a jamais été observé.

## Alternatives écartées

- **Réécrire l'application iPhone en Swift, avec une version Android plus simple.** Le panneau natif d'iOS serait plus fluide, mais chaque écran serait à écrire, tester et publier deux fois, par une seule personne. Le même résultat, une vue différente selon l'appareil ou le goût de chacun, s'obtient dans le code actuel. À reconsidérer après le pilote si le rendu devient la limite.
- **Une seule vue dès maintenant.** Panneau seul : préféré par le porteur du produit, plus naturel et plus actuel. Liste seule : recommandée par l'orchestrateur et le sous-agent, plus évidente. Trancher sans utilisateurs serait un pari.
- **Une vue imposée par plateforme** (panneau sur iPhone, liste sur Android). Repose sur une hypothèse non vérifiée sur le public de chaque plateforme.
- **Deux onglets, Liste et Carte.** Une place de menu de plus pour deux vues du même contenu.
