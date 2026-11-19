# ADR 0022 — Notifications push mobile : module chargé seulement avec un projet EAS, indisponibilité silencieuse

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** décidé par l'agent mobile M4, sur délégation ; à confirmer.
- **Précisé par :** [ADR 0041](0041-nom-de-l-application-uzu.md) : le schéma de lien est `uzu://`.

## Contexte

Les notifications push passent par `expo-notifications` et le service d'Expo (ADR 0008, 0019). L'application tourne aujourd'hui dans Expo Go et le simulateur iOS, sans projet EAS : aucun jeton ne peut y être obtenu, et depuis le SDK 53 les notifications push distantes n'existent plus dans Expo Go sur Android. Rien ne doit planter, bloquer ni afficher d'erreur dans ces conditions (voir aussi l'ADR 0018 pour les modules natifs).

## Décision

- L'identifiant du projet EAS vient de `EXPO_PUBLIC_EAS_PROJECT_ID`, copié par `app.config.ts` dans `extra.eas.projectId` et lu par `config.easProjectId`. Il est absent par défaut.
- `expo-notifications` est chargé par `require` dans un `try/catch` (`src/notifications/native.ts`), et seulement si cet identifiant existe. Sans identifiant, ou si le module ne se charge pas, les notifications sont « indisponibles » : aucune écoute, aucun appel, aucun message ; seul un journal de développement le dit.
- L'autorisation n'est jamais demandée au lancement : une explication dans l'application (`t.permissions.notifications`) précède la demande du système, après une inscription à une balade ou une création de balade, une seule fois (mémorisé dans `expo-secure-store`).
- L'appareil est enregistré (`PUT /me/devices`) à chaque démarrage connecté quand l'autorisation est accordée et qu'un jeton existe. À la déconnexion, `SessionProvider` attend (3 s au plus, échec ignoré) `onBeforeSignOut`, qui supprime l'appareil, **avant** d'effacer la session : l'appel a encore besoin du jeton d'accès. Cela précise l'ADR 0014, qui effaçait la session en premier.
- Un appui sur une notification n'ouvre que `dogo://walks/<id>` (le fil pour `message_posted`, la fiche sinon) ; tout autre lien est ignoré. Un appui reçu avant la connexion attend qu'elle soit prête.

## Conséquences

- Expo Go et le simulateur fonctionnent comme avant ; les notifications se testent sur un appareil avec une version de développement et un projet EAS (`EXPO_PUBLIC_EAS_PROJECT_ID`).
- Les tests simulent `expo-notifications` (`jest.setup.ts`) et activent l'identifiant en modifiant `config.easProjectId`.
- Une session qui se termine sans déconnexion volontaire (renouvellement refusé) ne retire pas l'appareil : l'API le retire quand Expo le déclare invalide, ou quand un autre compte l'enregistre.

## Alternatives écartées

- **Importer `expo-notifications` en tête de fichier.** Journalise une erreur au lancement dans Expo Go sur Android.
- **Demander l'autorisation au lancement.** Taux de refus élevé et contraire aux consignes d'Expo et des plateformes.
- **Retirer l'appareil après avoir effacé la session.** L'appel serait refusé (401) : le jeton resterait associé au compte.
