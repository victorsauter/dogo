# ADR 0021 — Carte et position dans l'application mobile

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** accepté par l'orchestrateur, sur délégation, pour lancer le développement ; à confirmer.
- **Précisé par :** [ADR 0039](0039-profils-de-build-eas.md) : la clé Google Maps Android passe par l'option du plugin et les variables d'environnement EAS.

## Contexte

Les tâches 16 à 18 demandent une carte des balades proches, une petite carte du point de rendez-vous sur la fiche, et le choix d'un point sur la carte à la création (spécification §7 : pas de recherche d'adresses). L'application doit rester utilisable dans Expo Go et le simulateur iOS. La documentation d'Expo (SDK 58) propose deux bibliothèques : `react-native-maps`, incluse dans Expo Go, et `expo-maps`, dont la mise en place passe par une version de développement.

## Décision

- Les cartes utilisent `react-native-maps` (version recommandée par Expo pour le SDK 58), avec le fournisseur par défaut : Apple Plans sur iOS, Google Maps sur Android.
- La position vient d'`expo-location`, autorisation « pendant l'utilisation » seulement, demandée à l'ouverture de l'onglet « Balades » et du formulaire de balade (`src/lib/location.ts`). Un refus ou une absence de position centre la carte sur un centre par défaut (`DEFAULT_CENTER` : Seppois-le-Haut, réglable par `EXPO_PUBLIC_DEFAULT_LATITUDE` et `EXPO_PUBLIC_DEFAULT_LONGITUDE`) avec une phrase d'explication ; l'écran n'est jamais bloqué.
- La recherche suit la zone visible : centre de la région et rayon couvrant la région (demi-diagonale, plafonnée aux 100 km de l'API), avec un délai de 400 ms après le dernier déplacement et les résultats précédents gardés pendant le chargement.

## Conséquences

- Tout fonctionne dans Expo Go sur iOS sans clé ni configuration.
- Une version Android publiée (EAS) demandera une clé Google Maps (`android.config.googleMaps.apiKey` dans `app.config.ts`), sans changement de code ; Expo Go Android utilise sa propre clé.
- Les tests simulent `react-native-maps` et `expo-location` (`jest.setup.ts`) : une carte y est une vue qui transmet `regionChangeComplete` et `press`.
- Les écrans de carte ne connaissent que `MapRegion` (`src/lib/geo.ts`) : changer de bibliothèque ne toucherait que `WalksMap`, `MeetingPointPicker` et la fiche de balade.

## Alternatives écartées

- **`expo-maps`.** Bibliothèque d'Expo plus récente, mais sa documentation renvoie à une version de développement pour la configuration, ce qui casserait l'usage dans Expo Go.
- **Google Maps aussi sur iOS.** Demande une clé dès maintenant pour un rendu équivalent.
- **Liste seule, sans carte.** Contraire au périmètre (carte des balades proches).
