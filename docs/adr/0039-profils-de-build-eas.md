# ADR 0039 — Profils de build EAS : variables d'environnement EAS, numéros de build distants, TestFlight par le profil `preview`

- **Statut :** Proposé
- **Date :** 19/11/2026
- **Note :** décidé par l'agent mobile, sur délégation, d'après la documentation d'Expo consultée ce jour ; à confirmer. Précise l'[ADR 0021](0021-carte-et-position-mobile.md) (clé Google Maps) et l'[ADR 0022](0022-notifications-push-mobile.md) (identifiant du projet EAS), et complète l'[ADR 0033](0033-fin-de-session-et-delais-reseau.md) (configuration de distribution).

## Contexte

L'application n'a jamais été construite pour être distribuée : pas d'`eas.json`, une configuration pensée pour Expo Go. Le porteur du produit veut une build de test (TestFlight, test interne Android) dès qu'il aura ses comptes Apple Developer, Google et Expo, qui n'existent pas encore. Il faut donc préparer la configuration sans compte, sans secret ni adresse inventée dans le dépôt, et sans qu'une build puisse partir avec la connexion de test ou une API en `http`. Le fichier `.env` n'est pas versionné : EAS Build ne le voit pas.

## Décision

- **Quatre profils dans `mobile/eas.json`.** `development` (client de développement sur appareil) et `development-simulator` (même profil, pour le simulateur iOS), `preview` (testeurs) et `production` (stores). `expo-dev-client` est ajouté aux dépendances : sans lui, `developmentClient` ne produit pas un client de développement.
- **Variables par environnement EAS.** Chaque profil désigne son environnement (`"environment"`: `development`, `preview`, `production`) ; les valeurs (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_EAS_PROJECT_ID`, identifiants Google, clé Google Maps Android, `google-services.json` en variable de type fichier) sont posées avec `eas env:set` sur expo.dev, jamais dans le dépôt. Le bloc `env` d'`eas.json` est écarté : ses valeurs sont versionnées.
- **Numéros de build distants.** `"appVersionSource": "remote"` avec `autoIncrement` sur `preview` et `production` : EAS tient `buildNumber` et `versionCode` ; `app.config.ts` ne garde que la version affichée (`0.1.0`).
- **TestFlight par `preview`.** Sur iOS, `preview` est une build « store » envoyée à TestFlight (pas de distribution ad hoc, donc pas d'iPhone à enregistrer) ; sur Android, `preview` est un `.apk` à installer par un lien. Le Google Play (`.aab`) passe par `production`, avec deux profils de soumission : `production` (piste interne) et `closed-test` (piste de test fermé, `alpha`), en brouillon.
- **Garde-fou à la construction.** `app.config.ts` lit `EAS_BUILD_PROFILE` (posé par EAS Build) et, pour `preview` et `production`, échoue si `EXPO_PUBLIC_API_URL` est absente ou pas en `https`, ou si `EXPO_PUBLIC_DEV_LOGIN` vaut `true`. Sans cette variable (développement local, tests), rien n'est vérifié. Cela double l'écran « Application mal configurée » de l'ADR 0033 : l'erreur arrive avant la distribution, pas chez le testeur.
- **Identité en tête de `app.config.ts`.** Nom affiché, slug, schéma de lien et identifiants de bundle et de paquet sont regroupés dans une constante `APP`, que les textes des permissions reprennent : un renommage se fait à un seul endroit (plus les quelques valeurs externes listées dans `mobile/README.md`).
- **Réglages de build ajoutés.** `usesNonExemptEncryption: false` (chiffrement standard seulement : plus de question d'exportation à chaque envoi TestFlight) ; couleurs de l'écran de démarrage et de l'icône adaptative alignées sur la charte (`#FBF6EC`, `#14100D`, ADR 0030), l'image d'arrière-plan du modèle d'Expo de l'icône adaptative étant retirée pour que la couleur s'applique ; icône (patte blanche sur fond transparent, provisoire) et couleur fauve des notifications Android ; clé Google Maps Android passée par l'option `androidGoogleMapsApiKey` du plugin de `react-native-maps`, comme l'indique la documentation d'Expo pour le SDK 58 (l'ADR 0021 citait `android.config.googleMaps.apiKey`, qui fonctionne aussi).
- **Champs de soumission à remplir.** `appleId`, `appleTeamId` et `ascAppId` valent `A_REMPLIR_…` : leur forme invalide fait refuser `eas submit` pour iOS avec un message précis, plutôt que d'envoyer vers un compte inventé.

## Conséquences

- Aucune build n'a été lancée et aucun compte n'a servi : la configuration est validée localement (lecture des profils par l'analyseur d'`eas.json`, `expo config`, `expo prebuild` jetable pour les deux plateformes, `expo-doctor`, tests), pas par une vraie build.
- Les profils `preview` et `production` partagent un environnement par profil mais pas par plateforme : `preview` iOS (TestFlight) et `preview` Android (`.apk`) lisent les mêmes variables.
- L'identifiant de bundle iOS, le nom de paquet Android et le schéma `dogo://` sont figés dès le premier envoi à un store : le renommage prévu doit avoir lieu avant.
- Une clé Google Maps embarquée est lisible dans l'application ; sa protection repose sur les restrictions posées dans la console Google (nom de paquet et empreintes SHA-1 : keystore d'EAS et clé de signature de Google Play).
- `channel` n'a d'effet qu'avec `expo-updates` (non installé) ; il est prêt pour une décision ultérieure sur les mises à jour sans passer par les stores.
- Le garde-fou ne se déclenche que sur la machine de build : EAS CLI ne pose pas `EAS_BUILD_PROFILE` quand il lit la configuration en local ; la commande `eas env:exec` du README permet de la vérifier avant.
- Android : `userInterfaceStyle: automatic` demande `expo-system-ui` sur Android (avertissement du prébuild) ; non traité ici, à vérifier sur la première build.

## Alternatives écartées

- **Bloc `env` dans `eas.json`.** Versionné, donc inadapté à une adresse d'API propre à un environnement et à toute valeur qu'on ne veut pas dans le dépôt.
- **`.env` envoyé à EAS (`.easignore`).** Ferait voyager des fichiers locaux, avec le risque d'y embarquer `EXPO_PUBLIC_DEV_LOGIN=true`.
- **`appVersionSource: local`.** Oblige à committer chaque incrément et à les synchroniser entre machines.
- **`preview` iOS en distribution interne (ad hoc).** Demande d'enregistrer chaque iPhone de testeur avant chaque build (100 appareils par an au plus) ; TestFlight n'a pas cette contrainte et prépare l'envoi en production.
- **Trois profils seulement, sans `development-simulator`.** Le client de développement du simulateur iOS demande `ios.simulator: true`, incompatible avec le profil pour appareil.
- **Valeurs de soumission plausibles à la place de `A_REMPLIR_…`.** Une build pourrait partir vers un compte qui n'est pas celui du porteur.
