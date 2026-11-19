# ADR 0012 — Navigation par fichiers avec Expo Router

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** accepté par l'orchestrateur, sur délégation, pour lancer le développement ; à confirmer.
- **Précisé par :** [ADR 0017](0017-ecrans-empiles-sur-les-onglets.md), [ADR 0025](0025-pages-legales-hors-garde.md) et [ADR 0026](0026-ordre-de-declaration-des-ecrans.md) : structure des écrans, adresse `/mine`.

## Contexte

L'application compte une dizaine d'écrans en V1, répartis entre une partie réservée aux personnes connectées et un écran de connexion. Les notifications (lot 3) doivent ouvrir directement la bonne balade, ce qui demande des liens profonds (`dogo://`). Plusieurs agents ajouteront des écrans en suivant le même modèle.

## Décision

La navigation utilise Expo Router (SDK 58) : chaque fichier de `mobile/src/app/` est un écran. Le groupe `(auth)` contient la connexion, le groupe `(app)` les onglets « Balades », « Mes balades » et « Profil ». La disposition racine garde l'accès avec `Stack.Protected` selon l'état de la session, et redirige explicitement (`redirectTo`) vers `/sign-in` ou `/`. Les onglets sont ceux de `expo-router/js-tabs` ; les icônes viennent d'`expo-symbols` (SF Symbols sur iOS, Material Symbols sur Android).

## Conséquences

- Ajouter un écran revient à ajouter un fichier ; l'URL et le lien profond suivent sans configuration.
- Le schéma `dogo://` est déclaré dans `app.config.ts` ; une notification pourra ouvrir `dogo://walks/{id}` dès que la route existera.
- Les routes typées (`experiments.typedRoutes`) signalent un lien cassé à la vérification des types.
- Expo Router évolue à chaque SDK (onglets JavaScript déplacés vers `expo-router/js-tabs` au SDK 58, `redirectTo` apparu au SDK 58) : les montées de version demandent de relire le guide de migration.
- Les tests de navigation utilisent `renderRouter` sur l'arborescence réelle de `src/app`.

## Alternatives écartées

- **React Navigation configurée à la main.** Même moteur, mais l'arbre des écrans et les liens profonds se déclarent à la main, en double.
- **Onglets natifs (`NativeTabs`).** Plus fidèles à chaque plateforme, mais encore présentés comme instables et moins faciles à styler avec le thème.
- **Garde par redirection dans chaque écran.** Fonctionne, mais disperse la règle ; `Stack.Protected` la garde en un seul endroit.
