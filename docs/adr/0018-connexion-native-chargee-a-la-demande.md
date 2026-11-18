# ADR 0018 — Connexion Apple et Google : modules natifs chargés à la demande

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** décidé par l'agent mobile M2, sur délégation ; à confirmer.

## Contexte

Aucun compte Apple Developer ni projet Google Cloud n'existe encore, et l'application doit rester utilisable dans Expo Go et le simulateur iOS avec la connexion de test. La connexion Google demande du code natif absent d'Expo Go. La documentation d'Expo propose deux bibliothèques : `react-native-nitro-google-signin` et `@react-native-google-signin/google-signin`.

## Décision

- Google utilise `@react-native-google-signin/google-signin` (version gratuite : écran Google classique, jeton d'identité envoyé à `POST /auth/google`). Apple utilise `expo-apple-authentication`, qui fonctionne dans Expo Go sur iOS.
- Les deux modules sont chargés par `require` dans un `try/catch` au moment de l'usage (`src/auth/providers/`), jamais à l'import : un module absent donne un bouton masqué, pas un plantage.
- Le bouton Google n'apparaît que si `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` est défini (et `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` sur iOS) et que le module est présent. Le bouton Apple n'apparaît que sur iOS quand `isAvailableAsync()` répond vrai.
- Le plugin de configuration de Google n'est ajouté à `app.config.ts` que si l'identifiant iOS est défini, pour ne pas casser Expo Go ni `expo export`.

## Conséquences

- La connexion Google se teste uniquement dans une version de développement (`expo prebuild` / EAS), ce qui n'est pas fait ici.
- L'API doit accepter l'identifiant client web (le jeton d'identité a cet audience) dans `Auth:Google:Audiences`.
- Passer à `react-native-nitro-google-signin` plus tard (Credential Manager Android) ne touche que `providers/google.ts`.

## Alternatives écartées

- **`expo-auth-session`** : fonctionne dans Expo Go, mais n'est plus la voie que la documentation d'Expo met en avant pour Google.
- **Import statique des modules natifs** : plante au lancement dans Expo Go.
