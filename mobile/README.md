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

La **connexion Apple** (`expo-apple-authentication`) fonctionne dans Expo Go sur iOS (le bouton est masqué sur Android) ; elle ne réussira pourtant qu'une fois l'API configurée avec un identifiant d'audience Apple (`Auth:Apple:Audiences`). Appareil photo, photothèque, sélecteur de date, cartes (`react-native-maps` : Apple Plans sur iOS, Google Maps sur Android) et position (`expo-location`) fonctionnent dans Expo Go. Une version Android publiée demandera une clé Google Maps (voir l'[ADR 0021](../docs/adr/0021-carte-et-position-mobile.md)). Voir l'[ADR 0018](../docs/adr/0018-connexion-native-chargee-a-la-demande.md).

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
| `EXPO_PUBLIC_DEV_LOGIN`                                         | absente                               | `true` affiche la connexion de test (l'API doit avoir `Auth:AllowDevLogin=true`)                                   |
| `EXPO_PUBLIC_DEFAULT_LATITUDE`, `EXPO_PUBLIC_DEFAULT_LONGITUDE` | Seppois-le-Haut (`47.5339`, `7.1844`) | Centre de la carte quand la position n'est pas connue ; les deux sont nécessaires, une valeur invalide est ignorée |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`                              | absente                               | Identifiant client OAuth web de Google ; sans lui, bouton Google masqué (version de développement requise)         |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`                              | absente                               | Identifiant client OAuth iOS, requis en plus sur iOS ; il sert aussi au plugin natif (`app.config.ts`)             |
| `EXPO_PUBLIC_EAS_PROJECT_ID`                                    | absente                               | Identifiant du projet EAS (`eas init`) : sans lui, notifications push indisponibles (`extra.eas.projectId`)        |

## Scripts

| Commande                                  | Rôle                                                        |
| ----------------------------------------- | ----------------------------------------------------------- |
| `npm run typecheck`                       | Vérification des types (`tsc --noEmit`)                     |
| `npm run lint`                            | ESLint (configuration Expo, `eslint-config-prettier`)       |
| `npm run format` / `npm run format:check` | Prettier : corriger / vérifier                              |
| `npm test`                                | Tests Jest (`jest-expo`, React Native Testing Library 14)   |
| `npm run api:generate`                    | Régénère `src/api/schema.d.ts` depuis `../api/openapi.json` |

La CI (`.github/workflows/mobile.yml`) lance `npm ci`, puis types, lint, format et tests.

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
    │   ├── _layout.tsx    fournisseurs + garde d'authentification
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
    ├── theme/             couleurs claires et sombres, espacements, rayons, typographie
    ├── strings/           tous les textes français (fr.ts)
    ├── lib/               configuration, fournisseurs, âge, dates, géographie, position, validation des formulaires, sélecteur de photo
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
- Les photos (`photoUrl`, chemins relatifs) s'affichent avec `Avatar` ou `photoUri(photoUrl)`.

### Balades (lot 2)

- **Onglet « Balades »** (`(tabs)/index.tsx`) : carte (`WalksMap`) et liste (`WalkCard`) des mêmes balades, filtres période et gabarit. La recherche suit la zone visible : `searchParamsFor(region, filtres)` (`src/api/walks.ts`) calcule centre, rayon (plafonné à 100 km) et fin de période ; la requête part 400 ms après le dernier déplacement et garde les résultats précédents pendant le chargement (indicateur « Recherche… » après 300 ms seulement).
- **Fiche** `walks/[id]` : tout sur la balade, inscription de mes chiens (`WalkRegistrationPanel`), et pour l'organisateur demandes en attente, « Retirer », modification et annulation.
- **Formulaire** `walks/new`, `walks/[id]/edit` : `WalkForm` (validation `validateWalk` dans `src/lib/forms.ts`, point de rendez-vous sur `MeetingPointPicker`). Les conflits `walk.capacity_below_registered` et `walk.size_in_use` s'affichent sur leur champ (`walkSubmitErrors`).
- **« Mes balades »** : `GET /me/walks` avec `role` (`Organizer`, `Participant`) et `when` (`Upcoming`, `Past`), en PascalCase.
- **Cohérence** : toute écriture sur une balade passe par `walksChanged()`, qui met la fiche à jour depuis la réponse et invalide `['walks']` et `['me', 'walks']`.
- **Dates** : `src/lib/dates.ts` (`formatWalkStart` → « Demain à 09:30 », `formatDuration` → « 1 h 30 »), en français et dans le fuseau de l'appareil. Pluriels : `plural(t.discover.resultCount, n)`.
- **Champs des lots suivants** (`isProfessional`, `organization`, `hasBlockedParticipant`) sont déjà affichés par `WalkCard` et la fiche (badge « Pro » et bordure, nom de l'organisation, avertissement discret).

### Fil de balade, répétition et notifications (lot 3)

- **Fil** `walks/[id]/messages` : visible de l'organisateur et des propriétaires de chiens acceptés (`canUseThread`, `src/lib/thread.ts`) ; les autres voient, sur la fiche, une phrase qui explique l'absence du bouton. `useWalkMessages` (`src/api/messages.ts`) charge la dernière page (clé `['walks', id, 'messages']`, donc rafraîchie par `walksChanged`), la recharge au focus, par tirer pour rafraîchir et toutes les 15 s tant que l'écran est au premier plan, et ajoute les pages plus anciennes avec `before=<id du premier message>`. `useSendMessage` envoie de façon optimiste : le texte s'affiche aussitôt (« Envoi… »), puis devient le vrai message, ou « Message non envoyé » avec « Réessayer » / « Supprimer ». Annulée : lecture seule avec une bannière.
- **Notifications** (`src/notifications/`, voir l'[ADR 0022](../docs/adr/0022-notifications-push-mobile.md)) : `expo-notifications` n'est chargé que si `EXPO_PUBLIC_EAS_PROJECT_ID` est défini ; sinon tout est inactif, sans message. `offerNotifications()` explique puis demande l'autorisation (une seule fois, après une inscription ou une création de balade) ; `registerDevice()` / `unregisterDevice()` gèrent `PUT` et `DELETE /me/devices` (la déconnexion supprime l'appareil avant d'effacer la session) ; `targetForNotification()` ne suit que `dogo://walks/<id>` (le fil pour `message_posted`, sinon la fiche) ; `NotificationsEffects` (dans la disposition racine) écoute les notifications. Les tests activent la fonction avec `config.easProjectId = '…'` ; `expo-notifications` y est simulé (`jest.setup.ts` : `__tap(data)`, `__receive(data)`, `__state`).
- **Notifications reçues, sur un appareil** : il faut une version de développement et un projet EAS (`eas init`, puis `EXPO_PUBLIC_EAS_PROJECT_ID`) ; ni Expo Go ni le simulateur sans projet ne peuvent obtenir de jeton. Sur Android, Expo Go ne gère plus les notifications push depuis le SDK 53.
- **Réglages** : écran `notifications` (onglet « Profil »), quatre interrupteurs liés à `/me/notification-preferences` (`useUpdateNotificationPreferences`, enregistrement immédiat, retour en arrière en cas d'échec) et l'état de l'autorisation du téléphone.
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

### Photos, formulaires et tests des écrans

- Choisir une photo : `PhotoPicker` (photothèque ou appareil photo, via `pickPhoto()` de `src/lib/photoPicker.ts`, qui recadre en carré, réduit à 1280 px et réencode en JPEG). L'envoi se fait par `useUploadMyPhoto()` / `useUploadDogPhoto()` (multipart, champ `file`). La partie fichier est un `File` d'`expo-file-system` : depuis le SDK 58, le `fetch` global est celui d'`expo/fetch`, qui refuse l'objet `{ uri, name, type }` propre à React Native (voir `src/api/photoUpload.ts`). Une erreur levée dans l'application (et non par le réseau) donne une `ApiError` de type `client`, jamais « Impossible de joindre le serveur ». Les erreurs `photo.too_large` et `photo.unsupported_type` ont leur message français.
- Formulaires : limites de l'API dans `src/lib/forms.ts` (`limits`, `validateDog`, `validateProfile`) ; les erreurs de champ du serveur s'affichent sur le bon champ par `serverFieldErrors()`.
- Défilement vers la première erreur : un formulaire rendu dans un `Screen` qui défile appelle `useScrollToFirstError()(errors)` après un échec de validation (client ou serveur). Les champs se repèrent par leur nom : prop `name` de `TextField` et `DateField`, ou `<FieldAnchor name="…">` autour d'un autre champ (groupe de puces, carte). Le composant qui appelle le crochet doit être **à l'intérieur** du `Screen`.
- Tests d'écran : `renderRouter('./src/app', …)` avec `mockApi({ 'GET /api/v1/me': () => ok(…) })` (`src/test/mockApi.ts`, qui remplace `fetch` ; `call.form` donne le corps multipart relu) ; les modules natifs (`expo-apple-authentication`, `photoPicker`, sélecteur de date) sont simulés avec `jest.mock`. `jest.setup.ts` simule pour tous les tests `expo-file-system` (`File` est un vrai `Blob`), `react-native-maps` (une vue qui transmet `regionChangeComplete` et `press`) et `expo-location` (autorisée, à Altkirch ; le centre par défaut est Seppois-le-Haut). Données de balade : `walkResult()`, `walkDetail()`, `participant()` dans `src/test/fixtures.ts`.
