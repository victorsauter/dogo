# dogo — Plan : onglet Balades avec panneau coulissant

**Version :** 0.1 · 19/11/2026 · **État :** planifié, aucun développement engagé

L'onglet Balades passera à une carte en plein écran avec la liste dans un panneau coulissant ([ADR 0028](adr/0028-balades-carte-et-panneau-coulissant.md)). Ce document liste ce qu'il faut faire pour passer du prototype à l'application.

## D'où on part

Un prototype existe sur la branche locale `proto/balades-dispositions`, qui n'est pas poussée sur GitHub.

- **Contenu :** le panneau, mais aussi la variante « Liste », la disposition actuelle et un sélecteur pour passer de l'une à l'autre. Le code est dans `mobile/src/discover/`.
- **Vérifié :** 446 tests, dont les 433 existants ; essai sur simulateur iOS en mode clair et sombre ; essai sur un iPhone réel.
- **Jamais vérifié :** Android, un lecteur d'écran, des personnes extérieures au projet.

## Ce qui est déjà tranché

| Sujet | Choix |
| --- | --- |
| Disposition | Carte en plein écran, liste dans un panneau |
| Positions du panneau | Basse, milieu, haute ; ouverture au milieu |
| Sans geste | L'en-tête du panneau est un bouton qui change sa hauteur |
| Épingle touchée | Le panneau remonte, la balade passe en tête, mise en évidence |
| Recherche | La liste suit la zone visible de la carte |

## Travaux

| N° | Tâche | Difficulté |
| --- | --- | --- |
| 1 | Reprendre le panneau du prototype comme seule disposition ; retirer le sélecteur, la variante « Liste », la disposition actuelle et la préférence mémorisée | Moyenne |
| 2 | Actualiser sans tirer : actualisation au retour sur l'onglet, plus un moyen explicite | Faible |
| 3 | Filtres compacts : une seule rangée au-dessus de la carte, le reste derrière un bouton « Filtres » | Moyenne |
| 4 | Bouton « Ma position » pour recentrer la carte | Faible |
| 5 | Dire clairement que la liste dépend de la carte : « N balades dans cette zone », et un état vide qui invite à déplacer la carte | Faible |
| 6 | Petits écrans et texte agrandi : règles de repli quand le milieu laisse trop peu de carte | Moyenne |
| 7 | Android : émulateur et appareil réel, gestes entre panneau, liste et carte, bouton retour, carte Google | Élevée |
| 8 | Lecteur d'écran : en-tête du panneau, fiches, ordre de lecture entre carte et liste | Moyenne |
| 9 | Essai avec trois personnes peu à l'aise avec un téléphone, sans aide | Hors code |
| 10 | Nettoyage : tests, README mobile, suppression de la branche du prototype | Faible |

Les tâches 1 à 5 forment un premier lot livrable sur iPhone. Les tâches 6 à 8 demandent des appareils ou des réglages qu'on n'a pas encore. La tâche 9 peut se faire dès la fin du premier lot.

### Détail de l'essai (tâche 9)

Trois consignes, données sans explication :

1. Trouve la balade la plus proche de chez toi.
2. Montre-moi toutes les balades de la semaine.
3. Ouvre une balade et dis-moi combien de chiens sont inscrits.

On note où la personne hésite, si elle fait glisser le panneau ou utilise le bouton, et si elle comprend que déplacer la carte change la liste.

## Terminé quand

- À l'ouverture, sur un iPhone récent, la carte et au moins deux fiches sont visibles.
- Chaque action se fait sans glisser.
- La recherche par zone, les filtres, la création d'une balade et les états vide, erreur et chargement fonctionnent comme aujourd'hui.
- La disposition a tourné sur un iPhone, un simulateur et un appareil Android.
- Les trois personnes de l'essai réussissent les trois consignes sans aide, ou les blocages constatés sont corrigés.

## Risques

- **Bibliothèque du panneau.** La documentation de `@gorhom/bottom-sheet` 5 ne couvre que Reanimated 3 et Gesture Handler 2. Le prototype tourne avec les versions 4 et 3 livrées par Expo SDK 58, mais c'est à revérifier à chaque montée de version.
- **Android.** Rien n'y a été observé, et les gestes y sont moins éprouvés.
- **Petits écrans.** Sur un iPhone SE avec un texte agrandi, les filtres prennent environ 300 points et le milieu ne laisse qu'environ 80 points de carte.
- **Compréhension.** La carte pilote la liste sans le dire. C'est l'objet de la tâche 5 et de l'essai.

## Questions ouvertes

| Question | Piste |
| --- | --- |
| Position du panneau à l'ouverture quand aucune balade n'est proche | Basse, pour montrer la carte et inviter à la déplacer |
| Moyen d'actualiser | Automatique au retour sur l'onglet, plus un bouton discret dans l'en-tête du panneau |
| Filtre de distance (5, 10, 25 km) de la variante « Liste » | Ne pas le reprendre : la zone visible fait foi |
