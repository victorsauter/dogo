# dogo — application mobile

Application iOS et Android de dogo, en React Native avec Expo (SDK 58, React Native 0.88, React 19.3), TypeScript strict et Expo Router.

## Prérequis

- Node.js 22.13 ou plus récent (développé avec Node 26 et npm 11, utilisés aussi par la CI).
- Pour le simulateur iOS : Xcode 26.4 ou plus récent, sur macOS.
- Pour l'émulateur Android : Android Studio et un appareil virtuel.
- Pour un téléphone : l'application Expo Go (App Store ou Play Store).
- L'API dogo lancée en local (voir `api/README.md`), sur `http://localhost:5080` par défaut.

L'application se lance et s'utilise entièrement dans **Expo Go et le simulateur iOS** avec la connexion de test. Ce qui demande une **version de développement** (`expo prebuild` ou EAS, pas encore faits) :

- la **connexion Google** (`@react-native-google-signin/google-signin`, code natif absent d'Expo Go) ; sans elle, ou sans identifiants, le bouton est masqué ;
- les **notifications push** : sans projet EAS (`EXPO_PUBLIC_EAS_PROJECT_ID`), elles sont indisponibles et l'application l'ignore sans rien afficher (voir « Notifications » plus bas et l'[ADR 0022](../docs/adr/0022-notifications-push-mobile.md)).

La **connexion Apple** (`expo-apple-authentication`) fonctionne dans Expo Go sur iOS (le bouton est masqué sur Android) ; elle ne réussira pourtant qu'une fois l'API configurée avec un identifiant d'audience Apple (`Auth:Apple:Audiences`). Appareil photo, photothèque, sélecteur de date, cartes (`react-native-maps` : Apple Plans sur iOS, Google Maps sur Android), position (`expo-location`), menus natifs d’iOS (`@expo/ui`), verre liquide d’iOS 26 (`expo-glass-effect`), flou (`expo-blur`) et retour haptique (`expo-haptics`) fonctionnent dans Expo Go. Une version Android publiée demandera une clé Google Maps (voir l'[ADR 0021](../docs/adr/0021-carte-et-position-mobile.md)). Voir l'[ADR 0018](../docs/adr/0018-connexion-native-chargee-a-la-demande.md).

## Installation

```sh
cd mobile
npm ci
cp .env.example .env   # puis adapter les valeurs
```

npm 11 bloque par défaut les scripts d'installation et affiche un avertissement pour `fsevents` et `@parcel/watcher` : ces paquets sont facultatifs et l'application fonctionne sans ces scripts.

## Lancer l'application

```sh
npm start          # serveur Metro ; puis i (iOS), a (Android) ou QR code pour Expo Go
npm run ios        # ouvre directement le simulateur iOS
npm run android    # ouvre directement l'émulateur Android
```

- **Simulateur iOS** : `localhost` désigne l'ordinateur, la valeur par défaut convient.
- **Émulateur Android** : `localhost` désigne l'émulateur ; mettre `EXPO_PUBLIC_API_URL=http://10.0.2.2:5080`.
- **Téléphone réel** : sur le même réseau Wi-Fi, mettre l'adresse IP de l'ordinateur, par exemple `http://192.168.1.20:5080`.

Après un changement de `.env`, relancer Metro avec `npx expo start --clear`.

## Variables d'environnement

Lues une seule fois dans `src/lib/config.ts` (objet `config` typé). Expo intègre les variables `EXPO_PUBLIC_*` au moment de la construction : elles ne sont pas secrètes et ne doivent jamais contenir de secret.

| Variable                                                        | Défaut                                | Rôle                                                                                                               |
| --------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `EXPO_PUBLIC_API_URL`                                           | `http://localhost:5080`               | Adresse de l'API, sans `/api/v1`                                                                                   |
| `EXPO_PUBLIC_DEV_LOGIN`                                         | absente                               | `true` affiche la connexion de test (l'API doit avoir `Auth:AllowDevLogin=true`) et les données de démonstration   |
| `EXPO_PUBLIC_DEFAULT_LATITUDE`, `EXPO_PUBLIC_DEFAULT_LONGITUDE` | Seppois-le-Haut (`47.5339`, `7.1844`) | Centre de la carte quand la position n'est pas connue ; les deux sont nécessaires, une valeur invalide est ignorée |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`                              | absente                               | Identifiant client OAuth web de Google ; sans lui, bouton Google masqué (version de développement requise)         |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`                              | absente                               | Identifiant client OAuth iOS, requis en plus sur iOS ; il sert aussi au plugin natif (`app.config.ts`)             |
| `EXPO_PUBLIC_EAS_PROJECT_ID`                                    | absente                               | Identifiant du projet EAS (`eas init`) : sans lui, notifications push indisponibles (`extra.eas.projectId`)        |

## Données de démonstration (développement)

Avec `EXPO_PUBLIC_DEV_LOGIN=true`, l'écran de connexion montre, sous « Connexion de test », deux cartes réservées au développement (voir l'[ADR 0027](../docs/adr/0027-donnees-de-demonstration.md) et « Données de démonstration » dans `api/README.md`) :

- **« Données de démonstration »** : l'état (aucune donnée, ou le nombre de comptes, chiens, balades, messages et photos), l'interrupteur « Télécharger des photos » (activé par défaut), « Générer les données de démonstration » (avec les photos, compter quelques secondes à une minute : le bouton tourne et une phrase l'explique, puis un résumé s'affiche) et « Supprimer les données de démonstration » après confirmation. Générer à nouveau remplace les données de démonstration ; le compte de test (`dev-user-1`) n'est jamais touché. Si l'API répond 404 (`DemoData:Enabled` à `false`), la carte le dit en une phrase.
- **« Se connecter comme… »** : les comptes de démonstration avec leur avatar, leurs chiens, le badge « Éducateur » et leur organisation, et un champ de recherche (nom, chien ou organisation, sans tenir compte des accents). Toucher un compte ouvre une session par la connexion de test, avec son `subject`.

Pour essayer : lancer l'API en Development (`DemoData:Enabled` y est vrai), ouvrir l'application déconnectée, générer, puis se connecter comme `demo-marie-schmitt` (balade complète, fils de discussion), `demo-thomas-haas` (avertissement « Participant bloqué ») ou `demo-sandrine-gutzwiller` (responsable d'organisation : membres et demandes). Se déconnecter ramène à l'écran de connexion pour changer de compte.

Le code vit à part, dans `src/devtools/` (`demoData.ts` pour les appels typés depuis `schema.d.ts`, `DemoDataSection.tsx` pour l'interface) ; `loadDemoDataSection()` ne le charge que si `EXPO_PUBLIC_DEV_LOGIN` vaut `true` : sinon rien n'est rendu ni appelé. Les photos viennent de DiceBear (avatars dessinés, CC0) et de Wikimedia Commons (photos de races sous licence libre) ; elles restent sur l'API de développement.

## Scripts

| Commande                                  | Rôle                                                        |
| ----------------------------------------- | ----------------------------------------------------------- |
| `npm run typecheck`                       | Vérification des types (`tsc --noEmit`)                     |
| `npm run lint`                            | ESLint (configuration Expo, `eslint-config-prettier`)       |
| `npm run format` / `npm run format:check` | Prettier : corriger / vérifier                              |
| `npm test`                                | Tests Jest (`jest-expo`, React Native Testing Library 14)   |
| `npm run api:generate`                    | Régénère `src/api/schema.d.ts` depuis `../api/openapi.json` |

La CI (`.github/workflows/mobile.yml`) lance `npm ci`, puis types, lint, format et tests.

**Environnement des tests.** Jest tourne toujours en `TZ=Europe/Paris` (`jest.global-setup.js`), quel que soit le fuseau de la machine : les tests de dates couvrent les passages à l'heure d'été (29 mars 2026) et d'hiver (25 octobre 2026). Les minuteries de ramasse-miettes de TanStack Query (`gcTime`, 5 min) ne retiennent plus le processus (`jest.setup.ts`, `timeoutManager`) : sans cela Jest signalait « A worker process has failed to exit gracefully ». Un test qui lance une vraie minuterie longue doit la nettoyer.

## Régénérer le client d'API

```sh
npm run api:generate
npm run typecheck
```

Le script lit `../api/openapi.json` et échoue avec un message clair s'il n'existe pas. `src/api/schema.d.ts` est généré depuis `api/openapi.json` (lot 1 de l'API). À chaque changement de `api/openapi.json`, régénérer et versionner `schema.d.ts` dans la même demande de fusion.

## Structure

```text
mobile/
├── app.config.ts          nom, identifiants, schéma dogo://, textes des permissions
├── scripts/generate-api.mjs
└── src/
    ├── app/               écrans (Expo Router) — uniquement des routes et des dispositions
    │   ├── _layout.tsx    fournisseurs + garde d'authentification + `ErrorBoundary` (écran d'erreur en français, « Réessayer »)
    │   ├── +not-found.tsx adresse inconnue (`dogo://nimporte`) : écran en français, retour à l'accueil
    │   ├── (auth)/        écrans accessibles déconnecté (sign-in)
    │   ├── (legal)/       conditions d'utilisation et confidentialité, sans garde (ADR 0025)
    │   └── (app)/         pile : (tabs)/ (Balades, Mes balades `mine`, Profil) et écrans poussés
    │       ├── edit-profile, users/[id], dogs/new, dogs/[id]/{index,edit}
    │       ├── walks/new, walks/[id]/{index,edit,messages}, notifications
    │       ├── organizations/{index,new}, organizations/[id]/{index,edit,members}
    │       └── blocked, report, delete-account
    ├── api/               client typé, erreurs, cache, photos, énumérations, hooks (profile, dogs, walks, organisations, blocages, signalements, compte)
    ├── notifications/     notifications push : chargement conditionnel, enregistrement de l'appareil, liens, écoute
    ├── auth/              session (magasin sécurisé, SessionProvider, useSession), signIn, providers/ (Apple, Google)
    ├── components/        composants de base (Screen, Text, Button, TextField…)
    ├── discover/          les deux vues de l'onglet Balades (panneau, liste), leur préférence et le réglage du profil
    ├── theme/             couleurs claires et sombres (charte « Uzu »), espacements, rayons, typographie
    ├── strings/           tous les textes français (fr.ts)
    ├── lib/               configuration, fournisseurs, âge, dates, géographie, position, validation des formulaires, sélecteur de photo
    ├── devtools/          outils de développement (données de démonstration), chargés seulement avec EXPO_PUBLIC_DEV_LOGIN=true
    └── test/              utilitaires de test (pas de tests ici)
```

Les tests vivent dans des dossiers `__tests__/` à côté du code testé, jamais dans `src/app/` (tout fichier de `src/app/` est une route).

## Conventions

### Ajouter un écran

1. Créer le fichier dans `src/app/(app)/` (connecté ; un écran de détail ou de formulaire va là, un onglet dans `(app)/(tabs)/`, voir l'[ADR 0017](../docs/adr/0017-ecrans-empiles-sur-les-onglets.md)) ou `src/app/(auth)/` (déconnecté). Exemple : `src/app/(app)/walks/[id].tsx` donne `/walks/123` et `dogo://walks/123`.
2. L'envelopper dans `<Screen>` ; `scroll={false}` pour une liste (`FlatList`) ou un état centré, `edges={['top', 'left', 'right']}` dans un onglet.
3. Pour les états : `<LoadingState />`, `<ErrorState error={error} onRetry={refetch} />`, `<EmptyState title=… />`.
4. Utiliser `Text`, `Button`, `TextField`, `Card`, `ListItem`, `Avatar`, `ChoiceGroup` et les jetons de `useTheme()` ; aucune couleur ni taille en dur.
5. Ajouter un test de rendu ou de comportement dans un `__tests__/` hors de `src/app/`.

### Couleurs (charte « Uzu »)

La palette est celle du pelage d'un Jack Russell (voir l'[ADR 0030](../docs/adr/0030-charte-graphique-uzu.md)) ; les valeurs vivent dans `src/theme/tokens.ts`, en clair et en sombre :

- **fond blanc cassé** (`background`, `surface`) et **noir chaud** pour le texte (`text`) ;
- **fauve** (`primary`) pour l'action : boutons principaux, « + », pastille de filtre active, onglet actif, liens, épingles des balades ;
- **sable** pour les teintes douces : fond sélectionné (`primarySoft`), pastilles et bannières d'information (`infoSoft`), liserés (`border`) ;
- **balades des professionnels** en `pro` : noir chaud en clair, blanc cassé en sombre (badge « Pro », bordure de la fiche, épingle), toujours avec le libellé « Pro » ;
- le rouge de danger reste un rouge, brique, accordé à la palette.

Les épingles de la carte sont dessinées par l'application (`WalkPin` dans `WalksMap.tsx`) : un rond avec une patte, plus grand quand la balade est sélectionnée ; les épingles natives n'acceptent pas de glyphe. Le verre non teinté porte une teinte légère du fond (`glassTint`), et le panneau un voile du fond (`PANEL_VEIL`), pour pencher vers le blanc cassé plutôt que vers le vert d'Apple Plans, qu'on ne peut pas recolorer. Les paires texte/fond sont vérifiées dans `src/theme/__tests__/theme.test.ts` (4,5:1 pour le texte, 3:1 pour les icônes porteuses de sens) : une nouvelle paire utilisée s'y ajoute.

### Ajouter un texte

Tout texte affiché va dans `src/strings/fr.ts`, rangé par écran ou fonctionnalité, puis s'utilise par `t.section.cle`. Les variables s'écrivent `{nom}` et se remplissent avec `format(t.profile.greeting, { name })`. Les énumérations s'affichent avec `enumLabel('DogSize', value)`. Un nouveau code d'erreur de l'API s'ajoute dans `t.errors` sous son nom exact (`walk.full`).

### Ajouter un appel à l'API

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';

export function useMyDogs() {
  return useQuery({
    queryKey: ['me', 'dogs'],
    queryFn: () => unwrap(api.GET('/api/v1/me/dogs')),
  });
}

export function useCreateDog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDogRequest) => unwrap(api.POST('/api/v1/dogs', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me', 'dogs'] }),
  });
}
```

- Toujours passer par `api` (jeton, renouvellement et rejeu sont automatiques) et `unwrap()` (échec → `ApiError` avec un message français dans `error.message`, le code dans `error.code`, les erreurs de champ dans `error.fieldErrors`).
- Les types viennent de `schema.d.ts` (`components['schemas']['…']`) ; ne pas recopier de modèle à la main.
- Les clés de requête commencent par la ressource (`['me', …]`, `['walks', id]`).
- Une mutation **ne doit pas attendre** le rechargement des listes qu'elle rend périmées : `onSuccess` appelle `walksChanged()`, `organizationsChanged()` ou `invalidateDogs()`, qui lancent les invalidations sans les attendre (sinon, sur un réseau lent, le bouton tourne alors que l'écriture a réussi). Ce qui change le contenu d'une balade (profil, chien, organisation) passe par ces mêmes fonctions : les balades et les pages d'organisation se mettent à jour.
- Les photos (`photoUrl`, chemins relatifs) s'affichent avec `Avatar` ou `photoUri(photoUrl)`.

### Balades (lot 2)

- **Onglet « Balades »** (`(tabs)/index.tsx`, deux vues, voir plus bas) : carte (`WalksMap`) et liste (`WalkCard`) des mêmes balades, filtres période et taille. Quand la recherche atteint son plafond (100 résultats, `isSearchCapped()`), l'en-tête dit que la liste est partielle (« 100 balades affichées : zoome pour affiner ») au lieu d'annoncer 100 balades comme un total, et après une erreur il dit « Impossible de charger les balades », jamais « Aucune balade ». La recherche suit la zone visible : `searchParamsFor(region, filtres)` (`src/api/walks.ts`) calcule centre, rayon (plafonné à 100 km) et fin de période ; la requête part 400 ms après le dernier déplacement et garde les résultats précédents pendant le chargement (indicateur « Recherche… » après 300 ms seulement).
- **Fiche** `walks/[id]` : tout sur la balade, inscription de mes chiens (`WalkRegistrationPanel`), et pour l'organisateur demandes en attente, « Retirer », modification et annulation.
- **Repère du rendez-vous** : une nouvelle balade n'est validée que si la personne a touché la carte ou déplacé le repère (même quand la position est connue : on ne publie pas l'adresse de l'organisateur par défaut) ; sans permission de position, un avertissement le dit, avec « Ouvrir les réglages ». À la modification, le point enregistré compte comme placé (`pinPlaced`).
- **Formulaire** `walks/new`, `walks/[id]/edit` : `WalkForm` (validation `validateWalk` dans `src/lib/forms.ts`, point de rendez-vous sur `MeetingPointPicker`). Les conflits `walk.capacity_below_registered` et `walk.size_in_use` s'affichent sur leur champ (`walkSubmitErrors`).
- **« Mes balades »** : `GET /me/walks` avec `role` (`Organizer`, `Participant`) et `when` (`Upcoming`, `Past`), en PascalCase.
- **Cohérence** : toute écriture sur une balade passe par `walksChanged()`, qui met la fiche à jour depuis la réponse et invalide `['walks']`, `['me', 'walks']` et `['organizations']` (la page d'une organisation liste ses balades à venir), sans attendre les rechargements.
- **Dates** : `src/lib/dates.ts` (`formatWalkStart` → « Demain à 09:30 », `formatDuration` → « 1 h 30 »), en français et dans le fuseau de l'appareil (choix de produit à confirmer : l'heure d'une balade s'affiche dans le fuseau de celui qui la regarde, pas dans celui du lieu). Pluriels : `plural(t.discover.resultCount, n)`.
- **Champs des lots suivants** (`isProfessional`, `organization`, `hasBlockedParticipant`) sont déjà affichés par `WalkCard` et la fiche (badge « Pro » et bordure dans la couleur `pro`, nom de l'organisation, avertissement discret).

### Onglet « Balades » : deux vues au choix

L’onglet a deux vues, au choix de chacun dans le profil, sous **Réglages › Affichage des balades** (deux cartes avec une petite illustration : « Carte et panneau » et « Liste »). **« Carte et panneau » est la vue par défaut.** Le choix s’applique aussitôt à l’onglet et reste mémorisé sur l’appareil (`expo-secure-store`, clé `dogo.discoverLayout`) ; une valeur inconnue (ou l’ancienne « current ») redonne le panneau. Il ne dépend pas de `EXPO_PUBLIC_DEV_LOGIN`.

- Le code vit dans `src/discover/` : `shared.tsx` (état des filtres partagé par les deux vues, en-tête de la liste et rangée de pastilles, contrôles flottants sur la carte, recherche qui suit la carte, actualisation, boutons flottants), `PanelLayout.tsx`, `ListLayout.tsx`, `layoutPreference.ts` (la préférence) et `LayoutSetting.tsx` (le réglage du profil). La route `(tabs)/index.tsx` choisit la vue et garde les filtres.
- **Préférence observable** : `layoutPreference.ts` est un petit store (`useSyncExternalStore`) lu une fois depuis le stockage sécurisé, puis partagé par l’onglet et le réglage. `useDiscoverLayout()` renvoie `{ layout, setLayout }` ; `layout` vaut `null` le temps de la lecture (quelques millisecondes), l’onglet n’affiche alors rien plutôt que la mauvaise vue.
- **Filtres, communs aux deux vues** : une rangée de pastilles-menus sous le titre et « Créer » (`FilterBar`, composant `MenuPill`) : période (« 7 jours », par défaut ; Aujourd’hui, 7 jours, Toutes les dates), taille (« Taille », puis la valeur choisie : Petit, Moyen, Grand) et, **seulement dans la liste**, distance (« 10 km » ; 5, 10, 25 km : la carte plein écran suit sa zone visible). Chaque pastille est une capsule du matériau flottant (`Material`) ; une pastille dont la valeur diffère de la valeur par défaut est teintée de la couleur principale, en gras, et affiche la valeur choisie (pas seulement une couleur). Toucher une pastille ouvre son menu **sous elle** : sur iOS, le vrai menu du système (SwiftUI `Menu`, `@expo/ui`, inclus dans Expo Go, voir `src/components/nativeMenu.ts`) ; ailleurs (Android, web, tests), le menu de l’application (`AnchoredMenu` dans `MenuPill.tsx`) : il grandit depuis la pastille avec un ressort court, sur un matériau translucide, coche sur le choix courant, séparateurs fins, sans voile gris (un fond transparent capte le toucher extérieur pour fermer), recalé pour ne jamais sortir de l’écran (`placeMenu`), fermé aussi par le bouton retour d’Android. Un choix s’applique tout de suite et ferme le menu. Accessibilité : la pastille est un bouton « Taille, Petit » (état déplié), le menu nomme ses éléments et coche le choix. Les filtres vivent dans l’écran de l’onglet (`useDiscoverFilterState`) : ils restent les mêmes quand on change de vue dans le profil, pour toute la session.
- **Bouton « Ma position »** : capsule ronde du matériau flottant, de la taille des pastilles, en bas à droite de la carte (panneau et carte plein écran de la vue Liste), qui recentre la carte sur la position de l’utilisateur ; dans le panneau, il suit en continu le bord haut du panneau pendant le glissement (`animatedPosition` de `@gorhom/bottom-sheet`), sans monter au-dessus des pastilles, et s’efface à la position haute (le verre se « dématérialise » au lieu de baisser son opacité, que le verre ne supporte pas). Il n’est pas affiché quand la position est refusée ou indisponible (une phrase l’explique déjà sous les filtres).
- **« Carte et panneau »** : la carte occupe tout l’écran, jusqu’en haut, sans bande : seules des capsules flottent dessus (`MapTopControls`) : les pastilles à gauche et « Créer » à droite (bouton rond « + », verre teinté de la couleur principale, libellé « Créer une balade »). Le titre « Balades » n’est plus affiché (l’onglet le dit) mais reste un en-tête pour les lecteurs d’écran. Le panneau s’arrête, en position haute, sous les pastilles (`topInset`). **Marge de la carte** : le bas de `mapPadding` suit la position de repos du panneau (basse ou moyenne ; la haute garde celle du milieu, le logo est alors couvert), si bien que le logo « Plans » et « Légal » restent juste au-dessus du panneau ; elle suit la position visée (`onAnimate`), pas chaque image d’un glissement. Sur iOS, cette marge ne déplace que ces éléments (vérifié : la carte ne bouge pas, aucune recherche n’est relancée) ; la zone cherchée est toute la carte, panneau compris, donc « N balades dans cette zone » ne change pas quand on bouge le panneau. Sur Android, Google Maps recentrerait la caméra à chaque changement : la marge y reste celle de la position moyenne. Le panneau est sur le même matériau que les capsules aux positions basse et moyenne, et devient opaque en montant vers la position haute (comme les feuilles d’iOS), les fiches restant sur leur fond. Il a trois hauteurs (`@gorhom/bottom-sheet`) ; son en-tête tient sur une ligne : « N balades dans cette zone » à gauche (la liste suit la zone visible de la carte), un chevron et le bouton « Actualiser les balades » à droite. L’en-tête est un bouton : « Voir la liste » → « Agrandir la liste » → « Voir la carte ». Une épingle touchée remonte la balade en tête du panneau, mise en évidence. Pas de « tirer pour rafraîchir » (le geste servirait à baisser le panneau).
- **« Liste »** : liste plein écran, qui défile sous la barre d’état (un matériau translucide y apparaît dès que la liste défile), mêmes pastilles plus la distance (10 km par défaut), recherche autour de la position (ou du centre par défaut, avec une phrase), triée par date (`searchParamsAround`). « Créer » y est le même bouton rond, à côté du titre. Le bouton « Carte » (capsule teintée) ouvre une carte plein écran où les mêmes pastilles flottent, sans bande (sans la distance, recherche sur la zone visible) ; une épingle touchée affiche la balade en bas (« Fermer », ou toucher la balade pour l’ouvrir) ; « Liste » revient, filtres, défilement et dernière zone de carte conservés. Tirer pour rafraîchir y est conservé.
- **Actualisation au retour sur l’onglet** : les deux vues relancent la recherche quand l’onglet reprend le focus (`useRefetchOnFocusIfStale`, `src/lib/hooks.ts`), mais pas au premier affichage ni si les données ont moins de 30 secondes.
- **Mise en place** : `react-native-gesture-handler`, `react-native-reanimated` et `react-native-worklets` (versions d’Expo SDK 58, `npx expo install`) et `@gorhom/bottom-sheet` ; `GestureHandlerRootView` enveloppe l’application (`AppProviders`). Le plugin Babel des worklets est ajouté par `babel-preset-expo`, sans configuration. Dans les tests, `jest.setup.ts` charge les simulations de gesture-handler et remplace le panneau par une vue dont `snapToIndex` appelle `onChange` ; les tests qui changent de vue appellent `resetDiscoverLayout()` pour oublier le choix gardé en mémoire.
- **Finition native** : les jetons de mouvement, d’ombre et de matériau sont dans le thème (`motion`, `shadows`, `material`, couleurs `materialTint`, `materialFallback`, `glassTint`, `glassEdge`, `separator`, hauteur `controlHeight` des capsules, 44 pt dans une zone de toucher de 48). `PressableScale` réduit légèrement un contrôle pressé avec un ressort (pastilles, boutons, fiches de balade, boutons flottants) ; `haptics` (`src/lib/haptics.ts`, `expo-haptics`) donne un retour léger au choix dans un menu, au changement de hauteur du panneau et à l’épingle touchée ; `Material` est la seule surface de la couche flottante (pastilles, boutons, fiches et messages sur la carte, panneau, menus, barre d’état de la liste) : sur iOS 26 et plus, le verre liquide du système (`GlassView` d’`expo-glass-effect`, inclus dans Expo Go, après `isLiquidGlassAvailable()` et `isGlassEffectAPIAvailable()`), teinté de la couleur principale pour l’action principale et les pastilles actives (`tinted`) ; sur un iOS plus ancien, le flou d’`expo-blur` sous une teinte légère, avec un liseré clair et une ombre douce ; sur Android et le web, un fond du thème presque opaque. Les barres (`variant="bar"`) restent sur le flou, comme celles d’iOS. Avec « Réduire la transparence » (iOS), toutes les surfaces deviennent opaques. Pour faire disparaître une capsule de verre, on change son style (`hidden`), jamais son opacité ni celle d’un parent. Avec « Réduire les animations », les contrôles ne rétrécissent plus, le menu apparaît en fondu et le panneau suit le réglage du système. Dans les tests, Reanimated tourne sur son implémentation JavaScript (`resolver` de `jest.config.js`), le menu natif est remplacé par celui de l’application, `expo-haptics`, `expo-blur` et `expo-glass-effect` sont simulés (`jest.setup.ts` ; le verre y est indisponible, sauf dans `Material.test.tsx`), et la carte simulée expose sa `mapPadding`.

### Fil de balade, répétition et notifications (lot 3)

- **Fil** `walks/[id]/messages` : visible de l'organisateur et des propriétaires de chiens acceptés (`canUseThread`, `src/lib/thread.ts`) ; les autres voient, sur la fiche, une phrase qui explique l'absence du bouton. `useWalkMessages` (`src/api/messages.ts`) charge la dernière page (clé `['walks', id, 'messages']`, donc rafraîchie par `walksChanged`), la recharge au focus, par tirer pour rafraîchir et toutes les 15 s tant que l'écran est au premier plan, et ajoute les pages plus anciennes avec `before=<id du premier message>`. **Le cache du fil est cumulatif** : chaque lecture est fusionnée (sans doublon, par date) à ce qu'il contient au moment de la réponse, si bien qu'un message déjà reçu ne disparaît jamais ; si plus d'une page est arrivée entre deux lectures, les pages intermédiaires sont relues. L'envoi annule les lectures en cours avant d'écrire dans le cache. `useSendMessage` envoie de façon optimiste : le texte s'affiche aussitôt (« Envoi… »), puis devient le vrai message, ou « Message non envoyé » avec « Réessayer » / « Supprimer ». Annulée : lecture seule avec une bannière.
- **Notifications** (`src/notifications/`, voir l'[ADR 0022](../docs/adr/0022-notifications-push-mobile.md)) : `expo-notifications` n'est chargé que si `EXPO_PUBLIC_EAS_PROJECT_ID` est défini ; sinon tout est inactif, sans message. `offerNotifications()` explique puis demande l'autorisation (une seule fois, après une inscription ou une création de balade) ; `registerDevice()` / `unregisterDevice()` gèrent `PUT` et `DELETE /me/devices` (la déconnexion supprime l'appareil avant d'effacer la session) ; `targetForNotification()` ne suit que `dogo://walks/<id>` (le fil pour `message_posted`, sinon la fiche) ; `NotificationsEffects` (dans la disposition racine) écoute les notifications et le renouvellement du jeton push (`addPushTokenListener` : l'appareil est ré-enregistré, l'ancien jeton retiré). Un tap reçu pendant que la session se lit attend la connexion ; dès que la personne est déconnectée, un tap mémorisé est oublié et ceux qui arrivent sont ignorés (ils peuvent venir d'un autre compte). Les tests activent la fonction avec `config.easProjectId = '…'` ; `expo-notifications` y est simulé (`jest.setup.ts` : `__tap(data)`, `__receive(data)`, `__state`).
- **Notifications reçues, sur un appareil** : il faut une version de développement et un projet EAS (`eas init`, puis `EXPO_PUBLIC_EAS_PROJECT_ID`) ; ni Expo Go ni le simulateur sans projet ne peuvent obtenir de jeton. Sur Android, Expo Go ne gère plus les notifications push depuis le SDK 53.
- **Réglages** : écran `notifications` (onglet « Profil »), quatre interrupteurs liés à `/me/notification-preferences` (`useUpdateNotificationPreferences(change)`, enregistrement immédiat, retour en arrière en cas d'échec ; les envois se font l'un après l'autre, chacun portant les valeurs du cache à son tour) et l'état de l'autorisation du téléphone.
- **Répétition** : `repeatWeekly` dans `WalkForm` (création seulement, option `allowRepeat`), badge « Chaque semaine » (`repeatsWeekly`) sur `WalkCard` et la fiche, « Arrêter la répétition » (`useStopSeries`) pour l'organisateur.
- `SwitchRow` (interrupteur avec description) est le composant à réutiliser pour tout réglage.

### Organisations, blocage, signalement, compte (lot 4)

- **Ordre des écrans.** Les `Stack.Screen` / `Tabs.Screen` d'une disposition se déclarent dans l'ordre de tri d'Expo Router (`index` et groupes, routes statiques par longueur de nom, routes dynamiques) ; sinon le lancement affiche en développement une erreur « ROUTE_NAMES_CHANGED … not handled by any navigator ». Un test (`navigation-order.test.ts`) le vérifie ; voir l'[ADR 0026](../docs/adr/0026-ordre-de-declaration-des-ecrans.md). L'onglet « Mes balades » est donc `mine`.
- **Organisations** : onglet « Profil » (mes organisations, « Trouver », « Créer »), `organizations/` (recherche à 400 ms, création, fiche, modification), `organizations/[id]/members` (responsable et éducateurs ; changement de rôle réservé au responsable). Hooks dans `src/api/organizations.ts` ; toute écriture appelle `organizationsChanged()` (liste, fiche, membres). `organizingOrganizations()` donne les organisations pour lesquelles je peux organiser (approuvée, adhésion acceptée, responsable ou éducateur) : `WalkForm` montre alors « Organiser pour » (création seulement, `organizationId`).
- **Balade professionnelle** : le nom de l'organisation ouvre sa page ; un refus `walk.members_only` à l'inscription affiche une carte avec « Voir l'organisation » (`WalkRegistrationPanel`).
- **Organisateur supprimé** : `organizer` peut être `null` (« Compte supprimé », sans lien) dans `WalkCard` et la fiche.
- **Blocage** : « Bloquer » / « Débloquer » sur `users/[id]` (confirmation qui explique l'effet), liste `blocked`, et `src/api/blocks.ts` qui rafraîchit aussi les balades (`walksChanged`) pour le badge « Participant bloqué » (carte et fiche, avec une phrase d'explication).
- **Signalement** : un seul écran `report?kind=user|dog|walk&id=…&name=…` (`reportHref()` dans `src/lib/report.ts`), ouvert depuis un profil, un chien et une balade qui ne sont pas les miens.
- **Réglages et compte** : l'onglet « Profil » range « Mes chiens », les organisations, « Réglages » (notifications, personnes bloquées, textes légaux, suppression) puis « Se déconnecter ». `delete-account` demande de taper `SUPPRIMER`, appelle `DELETE /me`, puis `endSession()` (session effacée sur l'appareil seulement : ni déconnexion ni retrait de l'appareil, le serveur s'en est chargé) et l'écran de connexion affiche une phrase (`setSignInNotice`). Un compte `Suspended` voit un bandeau dans le profil.
- **Textes légaux** : `src/strings/legal.ts`, affichés par `LegalDocument` dans `(legal)/terms` et `(legal)/privacy` (accessibles connecté ou non, ADR 0025), avec le bandeau « Version provisoire — à faire valider avant la publication » et des passages `[…]` à compléter (éditeur, adresse, contact, droit applicable, durée de conservation des signalements).
- **Notifications** : `membership_requested` ouvre l'écran des membres, `membership_accepted` et `organization_approved` la fiche de l'organisation ; seul `dogo://organizations/<id>` est suivi, et le type doit correspondre au genre de lien.
- **Actualisation au retour** : `useRefetchOnFocus()` (`src/lib/hooks.ts`) relit le profil, les organisations et les membres quand l'écran reprend le focus (par exemple après une validation par l'équipe).
- **Administration** : pas d'écran (ADR 0020), à faire avec `curl` (voir `api/README.md`, « Agir en administrateur en local »).

### Session

- `useSession()` donne `status` (`loading`, `signedOut`, `signedIn`), `user`, `setSession(réponse)`, `updateUser(user)` (après une modification du profil : met à jour la session et son stockage) et `signOut()`.
- Après un appel de connexion (`/auth/apple`, `/auth/google`, `/auth/dev`), appeler `setSession(réponse)` : la garde affiche alors les onglets.
- La session est conservée dans `expo-secure-store`. Avant d'être effacée à la déconnexion, `onBeforeSignOut` (3 s au plus, échec ignoré) retire l'appareil des notifications. Le cache des données est vidé à la déconnexion.

### Permissions

Les textes iOS et Android (position, photos, appareil photo) sont dans `app.config.ts`. Le module qui en a besoin (`expo-location`, `expo-image-picker`…) doit reprendre les mêmes textes dans les options de son plugin. Le texte d'explication avant la demande d'autorisation des notifications est `t.permissions.notifications`.

**Permission refusée.** Là où un refus est signalé (onglet Balades, création de balade, sélecteur de photo pour l'appareil photo, écran des notifications), un bouton « Ouvrir les réglages » mène aux réglages du téléphone (`openAppSettings()`, `src/lib/linking.ts`, qui ne lève jamais d'erreur). `useUserLocation()` relit la permission (sans la redemander) chaque fois que l'application revient au premier plan tant que la position manque. Pour ouvrir un plan, `openMapsAt()` essaie l'adresse native puis une adresse `https` de Google Maps, et la fiche prévient si rien ne s'ouvre.

### Photos, formulaires et tests des écrans

- Choisir une photo : `PhotoPicker` (photothèque ou appareil photo, via `pickPhoto()` de `src/lib/photoPicker.ts`, qui recadre en carré, réduit à 1280 px et réencode en JPEG). L'envoi se fait par `useUploadMyPhoto()` / `useUploadDogPhoto()` (multipart, champ `file`). La partie fichier est un `File` d'`expo-file-system` : depuis le SDK 58, le `fetch` global est celui d'`expo/fetch`, qui refuse l'objet `{ uri, name, type }` propre à React Native (voir `src/api/photoUpload.ts`). Une erreur levée dans l'application (et non par le réseau) donne une `ApiError` de type `client`, jamais « Impossible de joindre le serveur ». Les erreurs `photo.too_large` et `photo.unsupported_type` ont leur message français.
- **Navigation après un `await`** (enregistrement, création, suppression) : `useFocusedRouter()` (`src/lib/hooks.ts`) donne `back()` et `replace()` qui ne font rien si l'écran n'a plus le focus ; sans cela, un retour arrière pendant l'envoi faisait dépiler un écran de trop. À utiliser à la place de `useRouter()` dans tout écran qui navigue après une écriture.
- **Premier chien** : après la première modification du profil (`?welcome=1`), un membre sans chien est conduit à `dogs/new?welcome=1` (« Dernière étape : présente ton chien ») ; sans chien, le profil et l'inscription à une balade proposent déjà « Ajouter un chien ».
- Formulaires : limites de l'API dans `src/lib/forms.ts` (`limits`, `validateDog`, `validateProfile`) ; les erreurs de champ du serveur s'affichent sur le bon champ par `serverFieldErrors()`.
- Défilement vers la première erreur : un formulaire rendu dans un `Screen` qui défile appelle `useScrollToFirstError()(errors)` après un échec de validation (client ou serveur). Les champs se repèrent par leur nom : prop `name` de `TextField` et `DateField`, ou `<FieldAnchor name="…">` autour d'un autre champ (groupe de puces, carte). Le composant qui appelle le crochet doit être **à l'intérieur** du `Screen`.
- Tests d'écran : `renderRouter('./src/app', …)` avec `mockApi({ 'GET /api/v1/me': () => ok(…) })` (`src/test/mockApi.ts`, qui remplace `fetch` ; `call.form` donne le corps multipart relu) ; les modules natifs (`expo-apple-authentication`, `photoPicker`, sélecteur de date) sont simulés avec `jest.mock`. `jest.setup.ts` simule pour tous les tests `expo-file-system` (`File` est un vrai `Blob`), `react-native-maps` (une vue qui transmet `regionChangeComplete` et `press`) et `expo-location` (autorisée, à Altkirch ; le centre par défaut est Seppois-le-Haut). Données de balade : `walkResult()`, `walkDetail()`, `participant()` dans `src/test/fixtures.ts`.
