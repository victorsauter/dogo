# ADR 0003 — Application mobile native avec React Native et Expo

- **Statut :** Accepté
- **Date :** 18/11/2026

## Contexte

L'application doit être installable par tous les membres d'un groupe de balade, donc sur iPhone et sur Android. Elle repose sur une carte, des notifications et la connexion Apple ou Google. Elle est développée par une seule personne.

## Décision

L'application est native, sur iOS et Android, écrite une seule fois en TypeScript avec React Native et Expo.

## Conséquences

- Un seul code pour les deux plateformes.
- Le code applicatif peut être corrigé sans repasser par la validation des stores.
- Le mobile est en TypeScript et l'API en C# : les modèles ne sont pas partagés, d'où l'ADR 0007.
- Certains modules natifs, comme la connexion Google, peuvent demander une version de développement dédiée plutôt que l'application Expo Go ; à confirmer au lot 1.
- Les montées de version d'Expo et de React Native sont à prévoir régulièrement.

## Alternatives écartées

- **Site mobile installable.** Plus rapide à livrer, mais les notifications sur iPhone exigent d'ajouter le site à l'écran d'accueil.
- **.NET MAUI.** Un seul langage du serveur au téléphone, mais moins de composants prêts pour la carte et les notifications.
- **Flutter.** Solide, mais un langage de plus (Dart) sans autre usage dans le projet.
- **Swift et Kotlin.** La meilleure intégration à chaque plateforme, au prix de deux applications à écrire et à maintenir.
