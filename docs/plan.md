# Uzu — Plan de développement

**Version :** 0.4 · 19/11/2026

La V1 se développe en quatre lots, découpés en 31 tâches réparties sur six vagues de travail. Chaque tâche a une difficulté, et chaque groupe de tâches est confié à un sous-agent dont le modèle est choisi selon cette difficulté.

Ce plan applique le [périmètre V1](perimetre-v1.md) et la [spécification technique](specification-v1.md). Les choix techniques sont justifiés dans les [ADR](adr/README.md).

## État au 19/11/2026

Les 31 tâches sont réalisées et fusionnées dans `main`, avec les données de démonstration, les deux vues de l'onglet Balades et la charte graphique « Uzu ». La V1 tourne en local ; elle n'est ni hébergée ni publiée.

| Groupe | Contenu | Modèle | Demande de fusion |
| --- | --- | --- | --- |
| A1 | Socle de l'API : connexion, profil, chiens, photos | Opus | [#3](https://github.com/victorsauter/dogo/pull/3) |
| M1 | Socle de l'application mobile | Opus | [#2](https://github.com/victorsauter/dogo/pull/2) |
| A2 | Balades, recherche géographique, inscriptions | Opus | [#5](https://github.com/victorsauter/dogo/pull/5) |
| M2 | Connexion, profil, chiens | Sonnet | [#4](https://github.com/victorsauter/dogo/pull/4) |
| A3 | Fil de balade, notifications, rappels, séries | Opus | [#6](https://github.com/victorsauter/dogo/pull/6) |
| M3 | Carte, balades, inscriptions | Opus | [#7](https://github.com/victorsauter/dogo/pull/7) |
| A4 | Organisations, blocage, signalement, administration, suppression de compte | Opus | [#8](https://github.com/victorsauter/dogo/pull/8) |
| M4 | Fil de balade, notifications, répétition | Sonnet | [#9](https://github.com/victorsauter/dogo/pull/9) |
| M5 | Organisations, blocage, signalement, compte, textes légaux | Sonnet | [#10](https://github.com/victorsauter/dogo/pull/10) |
| Recette | Parcours complet dans le simulateur et correctifs | Opus | [#11](https://github.com/victorsauter/dogo/pull/11) |
| Suites | Guide de démarrage, données de démonstration, onglet Balades en Panneau et en Liste ([plan dédié](plan-panneau-balades.md)), charte « Uzu » | — | [#12](https://github.com/victorsauter/dogo/pull/12) à [#16](https://github.com/victorsauter/dogo/pull/16) |

### Revue générale avant mise en test

Une revue générale (sécurité, règles métier, application mobile, documentation, recette) a suivi. Ses constats, ses corrections et son verdict sont dans [`revue-v1.md`](revue-v1.md).

Les corrections sont réunies sur la branche `integration/revue-v1`, fusionnée dans `main` par une seule demande de fusion :

| Lot | Contenu | ADR |
| --- | --- | --- |
| 1 | Durcissement de l'API : environnements en liste blanche, limitation de débit, en-têtes, contrôles au démarrage | 0031 |
| 2 | Photos réécrites sans métadonnées | 0032 |
| 3 | Sessions et robustesse : mobile (session, réseau, écrans, synchronisation avec l'API) et API (jetons, suspension, signalements, règles métier) | 0033 à 0037, 0040 |
| 4 | Préparation du déploiement : image Docker, migrations, `eas.json`, [marche à suivre](deploiement.md) | 0038, 0039 |
| 5 | Documentation : spécification 0.2, anciens ADR annotés | — |
| 6 | Renommage en Uzu : nom affiché, `com.victorsauter.uzu`, liens `uzu://` ; le dépôt et le code gardent le nom `dogo` | 0041 |
| 7 | Défauts trouvés par la recette finale | 0040 révisé |

**Vérifications sur `integration/revue-v1` :** __TESTS__. Recette rejouée en entier sur simulateur iOS et, pour la première fois, sur émulateur Android. L'image Docker de l'API a été construite et lancée en local.

**Défauts connus de la version précédente de ce plan :**

- L'invitation à ajouter un chien après le premier profil : corrigé.
- Les inscriptions d'un membre qui quitte une organisation : tranché (elles sont annulées) et corrigé.
- Sans temps réel, un changement fait par quelqu'un d'autre n'apparaît qu'au retour sur l'écran, en tirant pour rafraîchir, ou toutes les 15 secondes dans le fil : inchangé, c'est le fonctionnement prévu en V1. L'application signale désormais quand un rafraîchissement échoue.

**Ce qui reste avant les premiers testeurs** (détail dans [`revue-v1.md`](revue-v1.md) et [`deploiement.md`](deploiement.md)) : fusionner la branche, choisir l'hébergeur, créer les comptes Apple, Google et Expo, fournir les textes légaux.

**Jamais essayé, faute de comptes ou d'appareil :** la connexion Apple et Google, la réception d'une notification, l'appareil photo, l'application sur un appareil physique, la création automatique de la balade suivante d'une série dans la durée.

## Organisation du travail

- **Un orchestrateur** découpe le travail, rédige les consignes, relit chaque changement, lance les vérifications et fusionne.
- **Des sous-agents** écrivent le code, chacun dans sa copie de travail et sur sa branche.
- **Une demande de fusion par groupe de tâches**, fusionnée seulement si la compilation, les tests et le lint passent.
- **L'API précède le mobile d'une vague** : le mobile se construit sur la description OpenAPI de l'API déjà fusionnée.

| Difficulté | Signification | Modèle |
| --- | --- | --- |
| Faible | Suit un modèle déjà présent dans le code | Sonnet |
| Moyenne | Plusieurs fichiers, quelques règles, peu d'inconnues | Sonnet |
| Élevée | Pose une fondation, règles métier croisées, concurrence ou intégration native | Opus |

Un groupe prend le modèle de sa tâche la plus difficile.

## Vagues

| Vague | API | Mobile |
| --- | --- | --- |
| 1 | Groupe A1 — Socle (Opus) | Groupe M1 — Socle (Opus) |
| 2 | Groupe A2 — Balades (Opus) | Groupe M2 — Connexion, profil, chiens (Sonnet) |
| 3 | Groupe A3 — Fil, notifications, récurrence (Opus) | Groupe M3 — Balades (Opus) |
| 4 | Groupe A4 — Organisations et sécurité (Opus) | Groupe M4 — Fil, notifications, récurrence (Sonnet) |
| 5 | — | Groupe M5 — Organisations et sécurité (Sonnet) |
| 6 | Vérification de bout en bout par l'orchestrateur | |

## Lot 1 — Socle

**Terminé quand :** sur un téléphone de test, on se connecte, on crée son profil et deux chiens, et on les retrouve après réinstallation.

| N° | Tâche | Difficulté | Groupe |
| --- | --- | --- | --- |
| 1 | Solution .NET 10, structure par fonctionnalité, erreurs normalisées, état du service, description OpenAPI générée | Moyenne | A1 |
| 2 | EF Core, PostgreSQL et PostGIS, migrations, Docker Compose, tests d'intégration sur une vraie base | Élevée | A1 |
| 3 | Connexion : vérification des jetons Apple et Google, jetons de session et de rafraîchissement, connexion de test | Élevée | A1 |
| 4 | Profil et chiens : lecture, création, modification, suppression, droits du propriétaire | Faible | A1 |
| 5 | Photos : envoi, contrôle du format, stockage derrière une interface | Moyenne | A1 |
| 6 | CI de l'API : compilation et tests | Faible | A1 |
| 7 | Projet Expo, navigation, thème et composants de base, textes français, lint, tests, CI | Élevée | M1 |
| 8 | Client d'API généré depuis OpenAPI, session en stockage sécurisé, renouvellement automatique du jeton | Élevée | M1 |
| 9 | Écrans de connexion Apple, Google et de test | Moyenne | M2 |
| 10 | Écran de profil, avec photo | Faible | M2 |
| 11 | Liste des chiens et formulaire de chien, avec photo | Moyenne | M2 |

## Lot 2 — Balades

**Terminé quand :** avec deux comptes, l'un crée une balade, l'autre la trouve sur la carte, voit les chiens inscrits et s'inscrit.

| N° | Tâche | Difficulté | Groupe |
| --- | --- | --- | --- |
| 12 | Balades : création, modification, annulation par l'organisateur | Moyenne | A2 |
| 13 | Recherche par proximité, période et gabarit, avec distance et places prises | Élevée | A2 |
| 14 | Inscriptions : règles de capacité, gabarit, doublon ; accès ouvert ou sur approbation ; sans dépassement en cas de demandes simultanées | Élevée | A2 |
| 15 | Fiche avec participants, « mes balades » | Faible | A2 |
| 16 | Carte et liste des balades proches, filtres | Élevée | M3 |
| 17 | Fiche d'une balade et inscription de ses chiens | Moyenne | M3 |
| 18 | Création et modification d'une balade, avec choix du point sur la carte | Élevée | M3 |
| 19 | Côté organisateur : demandes à approuver, inscrits ; écran « mes balades » | Moyenne | M3 |

## Lot 3 — Vie de la balade

**Terminé quand :** un message dans le fil déclenche une notification chez les inscrits, et une balade hebdomadaire crée la suivante.

| N° | Tâche | Difficulté | Groupe |
| --- | --- | --- | --- |
| 20 | Fil de messages par balade, réservé aux inscrits | Faible | A3 |
| 21 | Appareils, préférences, envoi par le service d'Expo derrière une interface | Moyenne | A3 |
| 22 | Notifications sur les événements d'inscription, de changement et de message | Moyenne | A3 |
| 23 | Rappels et récurrence hebdomadaire par tâches planifiées, sans doublon, changements d'heure compris | Élevée | A3 |
| 24 | Fil de la balade | Faible | M4 |
| 25 | Notifications : autorisation, enregistrement de l'appareil, ouverture de la bonne balade | Moyenne | M4 |
| 26 | Option « répéter chaque semaine », arrêt de la série, réglage des notifications | Faible | M4 |

## Lot 4 — Organisations et sécurité

**Terminé quand :** un éducateur d'une organisation validée crée une balade réservée à ses membres, et tout utilisateur peut bloquer, signaler et supprimer son compte.

| N° | Tâche | Difficulté | Groupe |
| --- | --- | --- | --- |
| 27 | Organisations, adhésions, rôles, balades professionnelles réservées aux membres | Élevée | A4 |
| 28 | Blocage et ses effets sur les inscriptions et l'affichage | Moyenne | A4 |
| 29 | Signalements et administration : validation des organisations, suspension | Moyenne | A4 |
| 30 | Suppression de compte | Moyenne | A4 |
| 31 | Écrans d'organisation, blocage, signalement, suppression de compte, conditions d'utilisation | Moyenne | M5 |

## Ce que ce plan ne couvre pas

Ces étapes demandent des comptes, des paiements ou des choix qui t'appartiennent ; l'application est écrite pour s'y brancher par simple configuration.

| Étape | Ce qu'il faut | Effet tant que ce n'est pas fait |
| --- | --- | --- |
| Connexion Apple | Compte Apple Developer (payant, annuel) | La connexion Apple ne peut pas être essayée ; la connexion de test la remplace |
| Connexion Google | Projet Google Cloud et identifiants | Idem |
| Notifications réelles | Compte et projet Expo, appareil physique | Les notifications sont journalisées côté serveur, pas reçues |
| Carte sur Android | Clé Google Maps | La carte ne s'affiche que sur iPhone |
| Hébergement | Choix d'un hébergeur proposant PostGIS | L'API tourne en local |
| Publication | Comptes des stores, fiches, validation | L'application s'installe en version de développement |
| Juridique | Conditions d'utilisation, données personnelles | Les textes fournis sont provisoires |

## Risques

- **Délais des stores.** Chaque première publication passe par une validation. Google Play impose en plus une période de test fermé aux nouveaux comptes personnels ; les conditions exactes sont à vérifier à la création du compte.
- **Exigences de l'App Store.** Le blocage, le signalement et la suppression de compte sont exigés d'une application où les utilisateurs publient du contenu et créent un compte.
- **Code non essayé sur appareil réel.** La connexion Apple et Google et les notifications ne peuvent être vérifiées qu'avec les comptes ci-dessus.
