# dogo — Plan : onglet Balades, vues Panneau et Liste

**Version :** 0.2 · 18/11/2026 · **État :** premier lot livré sur iPhone (demandes de fusion #15 et #16) ; Android, lecteur d'écran et essais restent à faire

L'onglet Balades propose deux vues au choix : la carte en plein écran avec un panneau coulissant, par défaut, et une liste en plein écran ([ADR 0028](adr/0028-balades-carte-et-panneau-coulissant.md)). Le choix d'une vue unique attend les essais avec des utilisateurs. Ce document liste ce qu'il fallait faire pour passer du prototype à l'application, et où en est chaque tâche.

## D'où on part

Un prototype existait sur la branche locale `proto/balades-dispositions`. Son code est maintenant dans `main`.

- **Contenu :** les vues Panneau et Liste et le réglage « Affichage des balades » du profil. Le code est dans `mobile/src/discover/`.
- **Vérifié :** essai sur simulateur iOS en mode clair et sombre ; essai sur un iPhone réel.
- **Jamais vérifié :** Android, un lecteur d'écran, un petit écran avec un texte agrandi, des personnes extérieures au projet.

## Ce qui est déjà tranché

| Sujet | Choix |
| --- | --- |
| Technologie | Expo, un seul code pour iPhone et Android |
| Vues | Panneau par défaut, Liste au choix ; la disposition actuelle est retirée |
| Choix de la vue | Dans les réglages du profil, « Affichage des balades », mémorisé sur l'appareil |
| Positions du panneau | Basse, milieu, haute ; ouverture au milieu |
| Sans geste | L'en-tête du panneau est un bouton qui change sa hauteur |
| Épingle touchée | Le panneau remonte, la balade passe en tête, mise en évidence |
| Recherche | Panneau : la zone visible de la carte. Liste : autour de soi, dans un rayon de 5, 10 ou 25 km |

## Travaux

| N° | Tâche | Difficulté | État |
| --- | --- | --- | --- |
| 1 | Reprendre les vues Panneau et Liste du prototype ; retirer la disposition actuelle et le sélecteur provisoire | Moyenne | Faite |
| 1 bis | Réglage « Affichage des balades » dans le profil : deux choix illustrés, Panneau par défaut, effet immédiat | Faible | Faite |
| 2 | Vue Panneau : actualiser sans tirer, au retour sur l'onglet et par un moyen explicite | Faible | Faite |
| 3 | Filtres compacts, communs aux deux vues : une seule rangée, le reste derrière un bouton « Filtres » | Moyenne | Faite autrement : une rangée de pastilles-menus (ADR 0029), sans bouton « Filtres » |
| 4 | Bouton « Ma position » pour recentrer la carte | Faible | Faite |
| 5 | Vue Panneau : dire que la liste dépend de la carte, « N balades dans cette zone », et un état vide qui invite à déplacer la carte | Faible | Faite ; le plafond de 100 résultats est maintenant signalé |
| 6 | Petits écrans et texte agrandi : règles de repli quand le milieu laisse trop peu de carte | Moyenne | Partielle : jamais vérifiée sur petit écran avec un texte agrandi ; une recette a relevé des textes tronqués en très grande police |
| 7 | Android : émulateur et appareil réel, gestes du panneau, bouton retour de la carte vers la liste, carte Google | Élevée | Non faite : Android n'a jamais été validé |
| 8 | Lecteur d'écran : en-tête du panneau, fiches, ordre de lecture entre carte et liste | Moyenne | Partielle : libellés posés, jamais écoutés avec un lecteur d'écran |
| 9 | Essai des deux vues avec des personnes peu à l'aise avec un téléphone, sans aide, puis règle définitive | Hors code | Non faite |
| 10 | Nettoyage : tests, README mobile, suppression de la branche du prototype ; retrait de la vue non retenue si une seule est gardée | Faible | Non faite |

Les tâches 1 à 5 formaient le premier lot, livré sur iPhone avec les deux vues. Les tâches 6 à 8 demandent des appareils ou des réglages qu'on n'a pas encore. La tâche 9 peut se faire dès maintenant.

### Détail de l'essai (tâche 9)

Trois consignes, données sans explication :

1. Trouve la balade la plus proche de chez toi.
2. Montre-moi toutes les balades de la semaine.
3. Ouvre une balade et dis-moi combien de chiens sont inscrits.

Chaque personne essaie une vue, puis l'autre, dans un ordre qui alterne d'une personne à la suivante. On note où elle hésite, si elle fait glisser le panneau ou utilise le bouton, si elle comprend que déplacer la carte change la liste, et laquelle elle préfère.

## Terminé quand

- En vue Panneau, à l'ouverture, sur un iPhone récent, la carte et au moins deux fiches sont visibles.
- Le réglage change la vue tout de suite, et le choix est conservé au redémarrage.
- Chaque action se fait sans glisser.
- La recherche par zone, les filtres, la création d'une balade et les états vide, erreur et chargement fonctionnent comme aujourd'hui.
- Les deux vues ont tourné sur un iPhone, un simulateur et un appareil Android.
- Les personnes de l'essai réussissent les trois consignes sans aide, ou les blocages constatés sont corrigés.
- La règle définitive est écrite dans un nouvel ADR : une seule vue, ou les deux avec leur vue par défaut.

## Risques

- **Bibliothèque du panneau.** La documentation de `@gorhom/bottom-sheet` 5 ne couvre que Reanimated 3 et Gesture Handler 2. Le prototype tourne avec les versions 4 et 3 livrées par Expo SDK 58, mais c'est à revérifier à chaque montée de version.
- **Android.** Rien n'y a été observé, et les gestes y sont moins éprouvés.
- **Petits écrans.** Sur un iPhone SE avec un texte agrandi, les filtres prennent environ 300 points et le milieu ne laisse qu'environ 80 points de carte.
- **Compréhension.** En vue Panneau, la carte pilote la liste sans le dire. C'est l'objet de la tâche 5 et de l'essai.
- **Deux vues à maintenir.** Le code propre à chacune est petit, mais chaque évolution de l'onglet se vérifie deux fois. Ce coût cesse si l'essai conduit à n'en garder qu'une.

## Questions ouvertes

| Question | Piste |
| --- | --- |
| Position du panneau à l'ouverture quand aucune balade n'est proche | Basse, pour montrer la carte et inviter à la déplacer |
| Moyen d'actualiser | Automatique au retour sur l'onglet, plus un bouton discret dans l'en-tête du panneau |
| Choisir la vue depuis l'onglet Balades lui-même | Plus tard, si le réglage du profil est trop caché : une icône discrète dans l'en-tête |
| Vue par défaut selon l'appareil | À décider après l'essai, pas avant |
