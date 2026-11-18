# dogo — application mobile

Application iOS et Android de dogo, en React Native avec Expo (SDK 58, React Native 0.88, React 19.3), TypeScript strict et Expo Router.

## Prérequis

- Node.js 22.13 ou plus récent (développé avec Node 26 et npm 11, utilisés aussi par la CI).
- Pour le simulateur iOS : Xcode 26.4 ou plus récent, sur macOS.
- Pour l'émulateur Android : Android Studio et un appareil virtuel.
- Pour un téléphone : l'application Expo Go (App Store ou Play Store).
- L'API dogo lancée en local (voir `api/README.md`), sur `http://localhost:5080` par défaut.

Tous les modules natifs utilisés aujourd'hui sont inclus dans Expo Go : aucune version de développement n'est nécessaire pour l'instant. Ce sera le cas quand la connexion Apple et Google ou les notifications arriveront (lots 1 et 3).

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

| Variable                | Défaut                  | Rôle                                                                             |
| ----------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`   | `http://localhost:5080` | Adresse de l'API, sans `/api/v1`                                                 |
| `EXPO_PUBLIC_DEV_LOGIN` | absente                 | `true` affiche la connexion de test (l'API doit avoir `Auth:AllowDevLogin=true`) |

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

Le script lit `../api/openapi.json` et échoue avec un message clair s'il n'existe pas. Le fichier `src/api/schema.d.ts` actuellement versionné est un **substitut vide** : il doit être régénéré dès que l'API publie `api/openapi.json`. À chaque changement de `api/openapi.json`, régénérer et versionner `schema.d.ts` dans la même demande de fusion.

## Structure

```text
mobile/
├── app.config.ts          nom, identifiants, schéma dogo://, textes des permissions
├── scripts/generate-api.mjs
└── src/
    ├── app/               écrans (Expo Router) — uniquement des routes et des dispositions
    │   ├── _layout.tsx    fournisseurs + garde d'authentification
    │   ├── (auth)/        écrans accessibles déconnecté (sign-in)
    │   └── (app)/         onglets : index (Balades), my-walks, profile
    ├── api/               client typé, erreurs, cache, photos, énumérations
    ├── auth/              session (magasin sécurisé, SessionProvider, useSession)
    ├── components/        composants de base (Screen, Text, Button, TextField…)
    ├── theme/             couleurs claires et sombres, espacements, rayons, typographie
    ├── strings/           tous les textes français (fr.ts)
    ├── lib/               configuration, fournisseurs de l'application
    └── test/              utilitaires de test (pas de tests ici)
```

Les tests vivent dans des dossiers `__tests__/` à côté du code testé, jamais dans `src/app/` (tout fichier de `src/app/` est une route).

## Conventions

### Ajouter un écran

1. Créer le fichier dans `src/app/(app)/` (connecté) ou `src/app/(auth)/` (déconnecté). Exemple : `src/app/(app)/walks/[id].tsx` donne `/walks/123` et `dogo://walks/123`.
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

### Session

- `useSession()` donne `status` (`loading`, `signedOut`, `signedIn`), `user`, `setSession(réponse)` et `signOut()`.
- Après un appel de connexion (`/auth/apple`, `/auth/google`, `/auth/dev`), appeler `setSession(réponse)` : la garde affiche alors les onglets.
- La session est conservée dans `expo-secure-store`. Le cache des données est vidé à la déconnexion.

### Permissions

Les textes iOS et Android (position, photos, appareil photo) sont dans `app.config.ts`. Le module qui en a besoin (`expo-location`, `expo-image-picker`…) doit reprendre les mêmes textes dans les options de son plugin. Le texte d'explication avant la demande d'autorisation des notifications est `t.permissions.notifications`.
