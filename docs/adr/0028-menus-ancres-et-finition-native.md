# ADR 0028 — Filtres en pastilles-menus ancrées, menu natif d'iOS par `@expo/ui`, matériaux et retour haptique

- **Statut :** Proposé
- **Date :** 18/11/2026

## Contexte

Les filtres de l'onglet Balades s'ouvraient dans une feuille modale qui montait du bas de l'écran, sur un fond grisé, depuis un bouton situé en haut. Le responsable du produit trouve ce mouvement contre-intuitif et l'ensemble peu « natif » : il attend une application qui ressemble à une application iOS écrite en Swift (ce qu'on touche s'ouvre là où on le touche, sans voile, avec des ressorts et un retour haptique). L'application doit continuer à tourner dans Expo Go, sans version de développement.

## Décision

Chaque filtre devient une pastille qui ouvre un menu sous elle-même. Sur iOS, ce menu est le vrai menu du système (SwiftUI `Menu`), fourni par `@expo/ui` (`MenuView`, inclus dans Expo Go pour le SDK 58) ; sur Android, sur le web et dans les tests, c'est un menu de l'application ancré à la pastille (`AnchoredMenu`), sans voile gris. Les surfaces flottantes (en-tête sur la carte, menus, boutons sur la carte) utilisent un matériau translucide (`expo-blur` sur iOS, fond du thème presque opaque ailleurs) ; `expo-haptics` donne le retour haptique. Mouvements, ombres et matériaux sont des jetons du thème.

## Conséquences

- Sur iOS, le menu a exactement l'apparence et le comportement du système (Liquid Glass, accessibilité, fermeture) ; il n'est pas testable dans Jest, où le menu de l'application le remplace (`src/components/nativeMenu.ts` est simulé).
- Deux implémentations du menu à garder cohérentes (mêmes éléments, même coche) ; le menu de l'application reste celui d'Android.
- Trois dépendances de plus, toutes incluses dans Expo Go : `@expo/ui`, `expo-blur`, `expo-haptics`.
- Reanimated tourne désormais aussi dans les tests (sur son implémentation JavaScript, `resolver` de `jest.config.js`).

## Alternatives écartées

- **Garder la feuille en la stylant mieux** : le reproche porte sur le mouvement (toucher en haut, ouvrir en bas) et le voile, pas sur le style.
- **Menu de l'application partout** : réalisable, mais une imitation se remarque à côté des menus du système ; le menu natif est disponible sans version de développement.
- **Menu natif aussi sur Android (Compose `DropdownMenu` de `@expo/ui`)** : possible, mais non vérifiable ici (pas d'émulateur Android dans la boucle) ; le menu de l'application suit le thème et a été vérifié.
- **`@react-native-menu/menu`** : demande du code natif absent d'Expo Go.
