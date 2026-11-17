# dogo — Plan de développement

**Version :** 0.1 · 18/11/2026

Le développement se fait en quatre lots avant le pilote ; chaque lot se termine par quelque chose d'utilisable sur un téléphone. Le lot 1 est détaillé tâche par tâche ; les lots suivants seront précisés au moment de les commencer.

Ce plan applique le [périmètre V1](perimetre-v1.md). Les choix techniques sont justifiés dans les [ADR](adr/README.md) ; ceux marqués « Proposé » attendent ta validation.

## Vue d'ensemble

| Lot | Objectif | Terminé quand |
| --- | --- | --- |
| 1 — Socle | Se connecter et décrire ses chiens | Sur un iPhone et un Android de test, tu te connectes avec Apple ou Google, tu crées ton profil et deux chiens, et tu les retrouves après réinstallation |
| 2 — Balades | Créer, trouver et rejoindre une balade | Avec deux comptes : l'un crée une balade, l'autre la trouve sur la carte, voit les chiens inscrits et s'inscrit. Démonstration aux éducateurs |
| 3 — Vie de la balade | Échanger et revenir chaque semaine | Un message dans le fil déclenche une notification chez les inscrits ; une balade hebdomadaire crée la suivante |
| 4 — Organisations et sécurité | Balades professionnelles, blocage, signalement, publication | L'application est publiée sur les deux stores ; un éducateur crée une balade réservée à ses membres |

Aucune durée n'est donnée : tu développes seul, sur ton temps libre. L'ordre compte plus que les dates.

## Structure du dépôt

Proposition, à valider avec l'ADR 0002.

```text
dogo/
├── api/                 API .NET : solution, projet web, tests
├── mobile/              Application Expo en TypeScript
├── docs/                Périmètre, plan, ADR
└── .github/workflows/   CI : build et tests de l'API, lint et types du mobile
```

## Modèle de données

Chaque entité arrive avec le lot qui en a besoin.

| Entité | Lot | Champs principaux |
| --- | --- | --- |
| Utilisateur | 1 | Identifiant Apple ou Google, prénom ou pseudo, photo, date de création |
| Chien | 1 | Propriétaire, nom, photo, gabarit, âge, sociabilité, réactivité, habitudes en laisse, race (facultative), description |
| Balade | 2 | Organisateur, titre, description, date et heure, point de rendez-vous, nombre maximum de chiens, gabarits admis, règles, accès (ouvert ou sur approbation), état (prévue ou annulée) |
| Inscription | 2 | Balade, chien, état (en attente, acceptée, refusée, annulée) |
| Série de balades | 3 | Balade d'origine, jour et heure de répétition |
| Message | 3 | Balade, auteur, texte, date |
| Appareil | 3 | Utilisateur, jeton de notification |
| Organisation | 4 | Nom, présentation, état de validation |
| Membre d'organisation | 4 | Utilisateur, rôle (éducateur ou membre), état (demandé ou accepté) |
| Blocage | 4 | Personne qui bloque, personne bloquée |
| Signalement | 4 | Auteur, personne ou chien visé, balade, type, faits observés, état |

Les catégories de gabarit restent à fixer ; le périmètre demande au minimum « petit » et « grand ».

## Lot 1 — Socle

**Mise en place**

- [ ] Créer l'arborescence `api/`, `mobile/`, `docs/` et le `.gitignore`
- [ ] Lancer PostgreSQL et PostGIS en local avec Docker Compose
- [ ] Mettre en place la CI : build et tests de l'API, lint et vérification des types du mobile

**API**

- [ ] Créer le projet .NET 10 en minimal API, organisé par fonctionnalité, avec sa description OpenAPI
- [ ] Brancher EF Core et écrire la première migration : utilisateurs et chiens
- [ ] Connexion : vérifier le jeton d'identité Apple ou Google, créer le compte au premier passage, émettre un jeton de session
- [ ] Profil : lire et modifier son propre profil
- [ ] Chiens : créer, modifier, supprimer et lister ses chiens ; seul le propriétaire peut modifier un chien
- [ ] Photos : recevoir et stocker la photo d'un profil ou d'un chien
- [ ] Tests : connexion, droits sur les chiens

**Mobile**

- [ ] Créer le projet Expo, la navigation et le client d'API généré depuis OpenAPI
- [ ] Écran de connexion Apple et Google
- [ ] Écran de profil
- [ ] Liste des chiens et formulaire de chien, avec photo
- [ ] Produire une version de test installable sur iPhone et Android

**À ta charge avant de finir le lot**

- Ouvrir un compte Apple Developer (payant, annuel) : nécessaire pour la connexion Apple et les versions de test sur iPhone.
- Créer un projet Google Cloud pour obtenir les identifiants de la connexion Google.
- Choisir l'identifiant de l'application sur les stores : il est difficile à changer après publication.

## Lot 2 — Balades

**API**

- [ ] Balades : créer, modifier et annuler une balade dont on est l'organisateur
- [ ] Recherche : balades à venir autour d'un point, filtrées par date et par gabarit admis
- [ ] Inscription d'un ou plusieurs chiens, avec les règles : capacité restante, gabarit admis, pas de doublon, balade à venir
- [ ] Accès sur approbation : l'organisateur accepte ou refuse chaque demande
- [ ] Désinscription, et libération de la place
- [ ] Participants : les profils des chiens inscrits sont lisibles avant de rejoindre
- [ ] Tests sur chaque règle d'inscription

**Mobile**

- [ ] Carte et liste des balades proches, avec filtres
- [ ] Fiche d'une balade : détails, lieu, chiens inscrits
- [ ] Création d'une balade
- [ ] Inscription : choix du ou des chiens
- [ ] Côté organisateur : demandes à approuver, liste des inscrits
- [ ] « Mes balades » : celles que j'organise et celles où je suis inscrit

**Sortie du lot :** une version de test montrée aux éducateurs que tu connais. Leurs retours peuvent modifier les lots 3 et 4. L'API doit être hébergée à ce moment-là.

## Lot 3 — Vie de la balade

**API**

- [ ] Fil de messages par balade, réservé aux inscrits et à l'organisateur
- [ ] Enregistrement des appareils pour les notifications
- [ ] Notifications : nouvelle inscription, approbation ou refus, changement ou annulation, nouveau message
- [ ] Rappel avant la balade, envoyé par une tâche planifiée
- [ ] Récurrence hebdomadaire : création de la balade suivante et notification aux inscrits de la précédente

**Mobile**

- [ ] Fil de la balade
- [ ] Demande d'autorisation des notifications, au bon moment
- [ ] Ouverture de la bonne balade depuis une notification
- [ ] Option « répéter chaque semaine » à la création
- [ ] Réglage des notifications reçues

## Lot 4 — Organisations et sécurité

**API**

- [ ] Organisations : demande de création, validation à la main, fiche
- [ ] Éducateurs rattachés à une organisation
- [ ] Adhésion : demande d'un membre, acceptation par l'organisation
- [ ] Balades professionnelles : créées par un éducateur, réservées aux membres, marquées comme telles
- [ ] Blocage : une personne bloquée ne peut plus s'inscrire à mes balades ; les balades où elle est inscrite me sont signalées
- [ ] Signalement : formulaire privé, transmis par e-mail
- [ ] Suspension d'un compte à la main
- [ ] Suppression de son propre compte

**Mobile**

- [ ] Fiche d'organisation, demande d'adhésion, gestion des membres
- [ ] Marquage visuel des balades professionnelles
- [ ] Bloquer et signaler, depuis un profil ou une balade
- [ ] Suppression du compte
- [ ] Conditions d'utilisation et politique de confidentialité

**Publication**

- [ ] Fiches des stores : nom, description, captures d'écran, politique de confidentialité
- [ ] Envoi en validation sur l'App Store et sur Google Play
- [ ] Points juridiques du périmètre traités : responsabilité, données personnelles, chiens de 1re et 2e catégorie

**Sortie du lot :** l'application est publiée et le pilote ouvre dans la ville retenue.

## Décisions techniques à venir

| Sujet | À décider avant | Note |
| --- | --- | --- |
| Stockage des photos | La fin du lot 1 | Dépend de l'hébergement retenu |
| Hébergement de l'API et de la base | La démonstration du lot 2 | La base doit proposer PostGIS si l'ADR 0005 est accepté |
| Fond de carte | Le lot 2 | Une clé Google Maps est en général nécessaire sur Android ; à vérifier |
| Envoi d'e-mails | Le lot 4 | Pour recevoir les signalements |
| Outil d'administration | Le lot 4 | Valider une organisation, suspendre un compte : écran dédié ou action directe en base |
| Suivi des plantages | Le pilote | Pour voir les erreurs rencontrées par les premiers utilisateurs |

## Risques

- **Délais des stores.** Chaque première publication passe par une validation. Google Play impose en plus une période de test fermé aux nouveaux comptes personnels ; les conditions exactes sont à vérifier à la création du compte.
- **Exigences de l'App Store.** Le blocage, le signalement et la suppression de compte sont exigés d'une application où les utilisateurs publient du contenu et créent un compte. Ils sont dans le lot 4 pour cette raison.
- **Charge de travail.** Tout ce qui n'est pas dans le périmètre V1 va dans le tableau « Hors V1 », pas dans un lot en cours.
