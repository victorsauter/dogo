# ADR 0029 — Filtres en pastilles-menus ancrées, menu natif d'iOS par `@expo/ui`, matériaux et retour haptique

- **Statut :** Proposé
- **Date :** 18/11/2026

## Contexte

Les filtres de l'onglet Balades s'ouvraient dans une feuille modale qui montait du bas de l'écran, sur un fond grisé, depuis un bouton situé en haut. Le responsable du produit trouve ce mouvement contre-intuitif et l'ensemble peu « natif » : il attend une application qui ressemble à une application iOS écrite en Swift (ce qu'on touche s'ouvre là où on le touche, sans voile, avec des ressorts et un retour haptique). L'application doit continuer à tourner dans Expo Go, sans version de développement.

## Décision

Chaque filtre devient une pastille qui ouvre un menu sous elle-même. Sur iOS, ce menu est le vrai menu du système (SwiftUI `Menu`), fourni par `@expo/ui` (`MenuView`, inclus dans Expo Go pour le SDK 58) ; sur Android, sur le web et dans les tests, c'est un menu de l'application ancré à la pastille (`AnchoredMenu`), sans voile gris. `expo-haptics` donne le retour haptique. Mouvements, ombres et matériaux sont des jetons du thème.

Sur la carte, il n'y a pas de bande d'en-tête : la carte va jusqu'en haut de l'écran et seuls des contrôles individuels flottent dessus, chacun une capsule de la même hauteur (`controlHeight`), du même matériau et de la même ombre : les pastilles à gauche, « Créer » à droite (bouton rond « + », teinté de la couleur principale), « Ma position » sur le bord du panneau. Le titre « Balades » n'est plus affiché en vue Panneau (l'onglet le dit), il reste un en-tête pour les lecteurs d'écran.

Toute la couche flottante (capsules, fiches et messages sur la carte, panneau, menus, barres) passe par un seul composant, `Material` :

- sur iOS 26 et plus, le **verre liquide du système** (`GlassView` d'`expo-glass-effect`, inclus dans Expo Go pour le SDK 58), seulement si `isLiquidGlassAvailable()` et `isGlassEffectAPIAvailable()` le confirment ; teinté de la couleur principale pour l'action principale et les filtres actifs ;
- sur un iOS plus ancien, le flou d'`expo-blur` sous une teinte légère, avec un liseré clair et une ombre douce ;
- sur Android et le web, un fond du thème presque opaque ;
- avec « Réduire la transparence », un fond opaque partout ;
- les barres (sous la barre d'état de la liste) restent sur le flou, comme les barres d'iOS : le verre est réservé aux contrôles.

Le panneau est sur ce matériau aux positions basse et moyenne et devient opaque en montant vers la position haute, où il porte une longue liste. La marge de la carte (`mapPadding`) suit la position de repos du panneau, pour que le logo « Plans » et la mention légale restent juste au-dessus de lui ; la zone cherchée reste toute la carte, si bien que bouger le panneau ne relance aucune recherche.

## Conséquences

- Sur iOS, le menu a exactement l'apparence et le comportement du système (Liquid Glass, accessibilité, fermeture) ; il n'est pas testable dans Jest, où le menu de l'application le remplace (`src/components/nativeMenu.ts` est simulé).
- Deux implémentations du menu à garder cohérentes (mêmes éléments, même coche) ; le menu de l'application reste celui d'Android.
- Quatre dépendances de plus, toutes incluses dans Expo Go : `@expo/ui`, `expo-blur`, `expo-glass-effect`, `expo-haptics`.
- Trois rendus du matériau à garder cohérents (verre, flou, fond opaque) ; seul `Material` les connaît. Le verre ne supporte pas une opacité réduite (il cesse de s'afficher) : pour le faire disparaître, on change son style (`hidden`), et rien de ce qui le contient ne doit être estompé. Une vue défilante qui le contient ne doit pas rogner son contenu (`overflow: 'visible'`), sinon sa lumière dessine un rectangle.
- Le texte sur verre suit les couleurs du thème (texte principal, ou `onPrimary` sur verre teinté) ; le système adapte la luminosité du verre au fond, ce qui ne se vérifie pas par un calcul de contraste mais à l'œil, en clair et en sombre.
- Sur Android, Google Maps recentre la caméra quand la marge change : la marge du bas y reste celle de la position moyenne du panneau (non vérifié sur un appareil).
- Dans Jest, le verre est simulé (indisponible par défaut) ; ses rendus sont testés dans `Material.test.tsx`.
- Reanimated tourne désormais aussi dans les tests (sur son implémentation JavaScript, `resolver` de `jest.config.js`).

## Alternatives écartées

- **Garder la feuille en la stylant mieux** : le reproche porte sur le mouvement (toucher en haut, ouvrir en bas) et le voile, pas sur le style.
- **Menu de l'application partout** : réalisable, mais une imitation se remarque à côté des menus du système ; le menu natif est disponible sans version de développement.
- **Menu natif aussi sur Android (Compose `DropdownMenu` de `@expo/ui`)** : possible, mais non vérifiable ici (pas d'émulateur Android dans la boucle) ; le menu de l'application suit le thème et a été vérifié.
- **`@react-native-menu/menu`** : demande du code natif absent d'Expo Go.
- **Garder une bande d'en-tête translucide sur la carte** : jugée « brute » ; iOS 26 (Plans) pose des contrôles isolés sur la carte.
- **Recalculer la zone cherchée selon la hauteur du panneau** : le compteur et les épingles changeraient à chaque mouvement du panneau et chaque mouvement lancerait une requête ; la zone reste toute la carte.
