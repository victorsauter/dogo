# Revue générale de la V1

Version 0.2 — 19/11/2026. Revue de `main` au commit `b8a2832` (PR #2 à #16 fusionnées), corrections réunies sur la branche `integration/revue-v1`.

Ce document dit si la V1 est prête à être déployée et testée par de vrais utilisateurs, liste ce qui ne va pas par gravité, et suit les corrections.

## Verdict

**Sur `main`, la V1 n'était pas prête à être mise en test.** Le code métier était sain et bien testé ; ce qui manquait était autour : garde-fous de configuration, durcissement de l'API, robustesse de la session côté mobile, et tout ce qui sert à déployer.

**Sur `integration/revue-v1`, le code est prêt pour une mise en test.** La recette finale (API, iPhone, Android) ne trouve plus aucun défaut bloquant. Ce qui sépare encore la V1 de ses premiers testeurs ne se règle pas dans le code : fusion de la branche, choix de l'hébergeur, comptes Apple, Google et Expo, textes légaux, et les essais qui demandent un vrai appareil.

| Domaine | Avant la revue (`main`) | Après corrections (`integration/revue-v1`) |
| --- | --- | --- |
| Règles métier de l'API | Prêt, avec 2 bugs | Prêt : bugs corrigés, règles nouvelles décidées et testées |
| Sécurité de l'API | Pas prêt : 1 constat bloquant, 11 importants | Prêt : tous corrigés et vérifiés par l'exécution ; reste une décision (connexion d'un compte suspendu) |
| Application mobile | Pas prête : 3 constats bloquants, 8 importants | Prête côté code ; restent les textes légaux et, pour Android, la clé Google Maps et les identifiants Google |
| Déploiement | Rien n'existait | Fichiers prêts et essayés en local (image Docker, migrations, `eas.json`, marche à suivre) ; rien n'est déployé, l'hébergeur reste à choisir |
| Documentation | À mettre à jour | À jour ; ADR 0031 à 0040 à confirmer |
| Recette | — | Rejouée en entier, Android compris ; voir la section « Recette » |
| Jamais essayé | Connexion Apple et Google, notification réelle, appareil physique | Inchangé : il faut des comptes et un appareil |

## Méthode

- État de référence : builds, tests, lint, vulnérabilités des dépendances, CI.
- Quatre revues en lecture seule : sécurité de l'API, règles métier contre la spécification, application mobile, documentation.
- Les constats bloquants ont été relus dans le code avant d'être retenus.
- Recette sur simulateur iOS et émulateur Android.

Gravité : **bloquant** = à corriger avant toute mise en test avec de vrais utilisateurs ; **important** = à corriger avant le pilote ; **mineur** = à corriger quand on y passe.

## État de référence

Tout est vert au 18/11/2026, sans modification du dépôt.

| Contrôle | Résultat |
| --- | --- |
| Tests API (PostGIS par Testcontainers) | 448 passés |
| Tests mobile | 541 passés, 37 suites |
| Types, lint, format mobile | conformes |
| `expo-doctor` | 20 contrôles sur 20 |
| Build API | 0 avertissement, `openapi.json` à jour |
| Vulnérabilités NuGet | aucune |
| `npm audit` | 22 modérées, aucune haute ni critique |
| CI de `main` | 6 dernières exécutions réussies |

Réserves : les tests API ont tourné en `Debug` (la CI construit en `Release`) ; Jest signale un processus de test qui ne se ferme pas proprement.

## Constats bloquants

### SEC-1 — Garde-fous d'environnement en liste noire

`api/src/Dogo.Api/Infrastructure/Auth/AuthOptions.cs:60-63`, `Features/DemoData/DemoDataOptions.cs:50`, `AuthOptions.cs:53-54`.

La connexion de test et les données de démonstration ne sont refusées que si l'environnement s'appelle exactement `Production`. L'administrateur est reconnu par son e-mail, quel que soit le fournisseur, et `POST /auth/dev` prend l'e-mail fourni comme vérifié. La clé de signature de développement est dans le dépôt.

- Sur un serveur nommé `Staging` avec la connexion de test active, n'importe qui obtient le rôle administrateur avec l'e-mail listé dans `Admin:Emails`, ouvre la session de n'importe quel compte de test, et vide les données par `DELETE /dev/demo-data`, qui est anonyme.
- Sur un serveur lancé en `Development` (tentant, pour la migration automatique), la clé publique du dépôt permet de forger un jeton pour n'importe quel compte.

Sans gravité si le serveur tourne en `Production`. Retenu comme bloquant parce que l'erreur de configuration est probable au premier déploiement de test.

Correction (lot 1) : liste blanche d'environnements, clé de développement refusée hors Development, un compte de test n'est jamais administrateur hors de cette liste.

### MOB-1 — Aucune configuration de build de distribution

`mobile/src/lib/config.ts:34,67,70`, `mobile/src/app/(auth)/sign-in.tsx`, pas d'`eas.json`.

- Sans `EXPO_PUBLIC_API_URL`, l'application retombe en silence sur `http://localhost:5080` : une build de test n'atteint aucun serveur.
- La connexion de test et les données de démonstration s'affichent sur la seule foi de `EXPO_PUBLIC_DEV_LOGIN`. Une build faite depuis un poste dont le `.env` l'active les embarque.

Correction (lots 3 et 4) : `eas.json` avec ses variables par profil, URL obligatoire et en `https` hors développement, connexion de test impossible dans une build de distribution.

### MOB-2 — Déconnexion sur toute erreur passagère du rafraîchissement

`mobile/src/api/authFetch.ts:69-71`.

Toute réponse non réussie inférieure à 500 efface la session. Un 404, 408 ou 429 renvoyé par un proxy pendant un déploiement déconnecte tous les utilisateurs actifs, sans message. La limitation de débit ajoutée par le lot 1 rend ce cas certain : **cette correction doit être en place avant que le lot 1 soit déployé.**

Correction (lot 3) : seuls 401, et 403 avec son code, effacent la session.

### MOB-3 — Textes légaux incomplets

`mobile/src/strings/legal.ts:27,68,74,87,129,135,141`.

Éditeur, adresse, contact, hébergeur et durée de conservation sont des marqueurs entre crochets, affichés tels quels. C'est du contenu, pas du code : **à fournir par le porteur.**

### MOB-4 — Android : carte et connexion (seulement si Android est distribué)

`mobile/app.config.ts:60-75`. Sans clé Google Maps, la carte reste grise hors Expo Go ; sans identifiant Google, Android n'a aucun moyen de connexion.

## Constats importants

### Sécurité de l'API

| N° | Constat | Où | Lot |
| --- | --- | --- | --- |
| SEC-2 | Le rejeu d'un jeton de rafraîchissement révoque toutes les sessions de l'utilisateur. Une réponse perdue sur réseau mobile déconnecte tous ses appareils | `SessionService.cs:82-101` | 3 |
| SEC-3 | Le blocage se devine : `walk.not_allowed` n'est produit que par un blocage, et passe avant `walk.full` (contraire au §4.7) | `RegistrationRules.cs:57-61` | 3, décision |
| SEC-4 | Aucune limitation de débit ni plafond par compte : spam de notifications par inscriptions et annulations en boucle, messages et redemandes illimités, disque rempli par des chiens avec photo, corps JSON jusqu'à 28 Mo | `Program.cs:65-69` | 1 et 3 |
| SEC-5 | Jetons d'appareil non validés et sans plafond par compte | `NotificationEndpoints.cs:39-57` | 1 |
| SEC-6 | Données personnelles dans les journaux : extrait des messages du fil (fournisseur `Log`, qui est le défaut), jeton d'appareil dans les erreurs d'Expo | `LoggingPushSender.cs:17`, `ExpoPushSender.cs:61-110` | 1 |
| SEC-7 | Suspension incomplète : les balades et séries du compte suspendu continuent, il reçoit encore les notifications, un administrateur suspendu lit encore les signalements, et il ne peut pas supprimer son compte | `AccountStatusMiddleware.cs:34-38`, `AdminEndpoints.cs:164-189` | 1 et 3, décision |
| SEC-8 | Le job de série ne revérifie ni l'organisation ni le rôle (même cause que MET-1) | `WalkSeriesJob.cs:82-98` | 3 |
| SEC-9 | Course entre annulation et acceptation d'une inscription : une inscription annulée peut rester acceptée et occuper une place | `RegistrationEndpoints.cs:99-186` | 3 |
| SEC-10 | Un signalement n'alerte personne, et il n'y a pas d'écran d'administration | `ReportNotifier.cs:19-28` | décision |
| SEC-11 | Photos : métadonnées EXIF et GPS conservées par le serveur (l'application mobile réencode, mais un autre client peut envoyer l'original) ; cache public d'un an après suppression | `PhotoEndpoints.cs:119-150` | 2 |
| SEC-12 | Sans `tzdata` sur l'image, plus aucune notification ne part et la série hebdomadaire échoue chaque minute | `NotificationTexts.cs:72`, `WalkSeriesJob.cs:79` | 1 et 4 |

### Règles métier

| N° | Constat | Où | Lot |
| --- | --- | --- | --- |
| MET-1 | Une organisation fermée ou refusée garde des balades ouvertes aux inscriptions, et la série d'un éducateur continue de créer des balades. La spécification (§4.6) dit que seule une organisation approuvée porte des balades | `RegistrationRules.cs:65-72`, `WalkSeriesJob.cs:82-98` | 3, décision |
| MET-2 | Changer la taille d'un chien déjà accepté contourne les gabarits admis par la balade. Aucun test ne couvre ce cas | `DogEndpoints.cs:109-112` | 3 |

### Application mobile

| N° | Constat | Où | Lot |
| --- | --- | --- | --- |
| MOB-5 | Aucun délai d'expiration sur les requêtes ; la création attend en plus l'invalidation du cache. Sur réseau faible, « Créer » tourne sans fin alors que la balade existe, et l'utilisateur la crée deux fois | `authFetch.ts`, `api/walks.ts:119-125` | 3 |
| MOB-6 | Persistance de la session fragile : si l'écriture du jeton renouvelé échoue, le lancement suivant présente l'ancien jeton et déconnecte tous les appareils (avec SEC-2) ; `revoke` est sauté si l'effacement échoue | `sessionStore.ts:100-119`, `SessionProvider.tsx:100-101` | 3 |
| MOB-7 | Déconnexion forcée sans explication ; `t.auth.sessionExpired` n'est utilisée nulle part | `authFetch.ts:71,113-116` | 3 |
| MOB-8 | Pas de limite d'erreur ni d'écran `+not-found` : une exception de rendu ferme l'application, un lien inconnu affiche un écran en anglais | `src/app/_layout.tsx` | 3 |
| MOB-9 | Sans permission de position, la balade est créée à Seppois-le-Haut sans avertissement | `walks/new.tsx:24`, `WalkForm.tsx:97-98` | 3 |
| MOB-10 | Fil de messages : après « Charger plus », les nouveaux messages font disparaître ceux de la jonction | `api/messages.ts:51-64` | 3 |
| MOB-11 | Android : le clavier risque de masquer le champ du fil et le bas des formulaires | `components/Screen.tsx:75` | recette puis 3 |
| MOB-12 | Retour arrière pendant un enregistrement : la navigation dépile un écran de trop | `walks/[id]/edit.tsx:46`, `edit-profile.tsx:76` et autres | 3 |

## Constats mineurs

API :
- Exception après le commit si la suppression d'un fichier de photo échoue : 500 alors que l'opération a réussi (`AccountDeletion.cs:96-106`). Lot 2.
- `/auth/logout` ne retire pas l'appareil de notification ; l'application le fait avant, au mieux (`AuthEndpoints.cs:83-88`).
- Jetons d'identité : ni `ValidAlgorithms`, ni `nonce` (`JwksIdentityTokenValidator.cs:109-118`).
- Adhésions sans verrou : une acceptation qui croise un retrait répond 500 (`MembershipEndpoints.cs:164,296`).
- Fichiers de photo orphelins sur envois concurrents (`PhotoEndpoints.cs:75-105`).
- Rappel renvoyé quand l'horaire est déplacé dans la fenêtre des 2 heures (`WalkEndpoints.cs:269-274`).
- Titre de balade fait d'espaces accepté (`WalkRequests.cs:19-22`).
- Valeurs d'énumération numériques probablement acceptées (`Program.cs:27`), à vérifier.
- `startsAt` sans borne supérieure ni exigence de décalage horaire (`WalkRequests.cs:28`).
- Acceptation possible d'une demande sur une balade réservée après le départ de l'organisation (`RegistrationEndpoints.cs:166-176`).
- Jetons de rafraîchissement jamais purgés ; `AllowedHosts` à `*` ; pas de délai maximal par job.
- Pagination : `/organizations/{id}/memberships` sans `limit` ; aucune liste hors le fil ne va au-delà de 100.

Mobile :
- Préférences de notification : deux bascules rapides peuvent arriver dans le désordre (`api/notifications.ts:24-40`).
- Un message envoyé pendant une interrogation disparaît jusqu'à 15 s (`api/messages.ts:117`).
- Le tap sur une notification mémorisé hors session s'ouvre après la connexion d'un autre compte (`NotificationsEffects.tsx:27,63`).
- Pas d'écoute du renouvellement du jeton push.
- Aucun lien vers les réglages après un refus de la position ou de la caméra.
- Le plafond de 100 résultats n'est pas signalé (`PanelLayout.tsx:393`).
- `Linking.openURL` et `openSettings` sans `catch` (`walks/[id]/index.tsx:48`, `notifications.tsx:103`).
- Noms et photos périmés jusqu'à 30 s après une modification de profil, de chien ou d'organisation.
- Heures affichées dans le fuseau du téléphone ; tests de dates dépendants du fuseau de la machine.
- Couleurs de l'écran de démarrage différentes de la charte ; pas de `usesNonExemptEncryption`.
- Google non déconnecté à la déconnexion ; lien profond reçu hors session perdu.

## Constats infirmés

- Nom de chien fait d'espaces : `[Required]` le refuse déjà, un test le couvre.
- E-mail Apple ou Google non vérifié donnant le rôle administrateur : non, seul un e-mail vérifié est retenu.
- Traversée de chemin, SVG ou HTML par les photos : non, nom contraint et formats limités.
- Injection SQL : non, tout le SQL brut est paramétré.
- Accès à la ressource d'un autre par un identifiant imbriqué : non, filtré partout.
- `request.clone()` sur le téléversement, bouton de déconnexion bloqué, dépendance d'effet du fil : pas de défaut.

## Couverture des règles de la spécification

Les 50 règles (R1 à R50) sont appliquées par le code. 45 sont « conformes et testées ». Tests insuffisants :

| Règle | Cas manquant |
| --- | --- |
| R3 pagination | Valeur par défaut de 50 jamais testée ; `limit` absent ou non testé sur les adhésions, les blocages, les organisations, l'administration |
| R33 rappel | Balade créée à moins de 2 heures du début ; modification après l'envoi du rappel |
| R38 heure de série | Aucun test ne modifie l'heure par `PATCH` puis ne vérifie la balade suivante |
| R40 organisation approuvée | Seule la création est contrôlée (voir MET-1) |
| Verrou des inscriptions (ADR 0015) | Baisse de `maxDogs`, suppression de chien ou annulation en parallèle d'une acceptation |
| Rejeu du jeton (ADR 0009) | Deux rafraîchissements parallèles |

## Documentation

Corrections à faire (lot 5) :
- `docs/plan.md` et `docs/plan-panneau-balades.md` disent que les deux vues de l'onglet Balades ne sont pas développées ; les tâches 1 à 5 sont livrées (#15, #16), 6 à 10 restent. Chiffres de tests périmés (415 et 446, pour 541 réels). Dates du 19/11.
- ADR 0003, 0006, 0007, 0012, 0014 précisés par des ADR plus récents sans annotation ; numéros 0016 et 0024 jamais attribués.
- Spécification : `/dev/demo-data`, `isAdmin` et `email` dans `GET /me`, `reminderSentAt`, formes des réponses, version.
- `mobile/README.md` : intitulés « lot 2, 3, 4 » sans sens pour un nouveau lecteur.

Promesses du périmètre que la V1 ne tient pas :
- Le signalement « arrive chez toi » : il est seulement écrit dans les journaux (SEC-10).
- Le droit de réponse par e-mail : aucun canal, aucun contact défini.
- Les règles sur les chiens de 1re et 2e catégorie : aucune règle ni champ.

## Décisions à prendre

Elles reviennent au porteur. Chaque ligne donne une recommandation.

Décidé par le porteur pendant la revue, le 18/11/2026 :

| Sujet | Décision |
| --- | --- |
| Organisation fermée ou refusée, membre qui part (MET-1) | Geler sans annuler : plus de nouvelle inscription, série arrêtée, inscriptions à venir du membre parti annulées ; les balades déjà créées restent |
| Blocage qui se devine (SEC-3) | Répondre exactement comme pour une balade complète |
| Compte suspendu (SEC-7) | Séries arrêtées, balades à venir annulées, appareils retirés ; le compte peut supprimer son compte |
| Signalements (SEC-10) | Notification push aux administrateurs |

Reste à décider :

| Sujet | Recommandation |
| --- | --- |
| Identifiant de bundle et schéma de lien définitifs | À fixer avant la première build de test ; conditionne le renommage en Uzu |
| Hébergeur | Serveur Hetzner Cloud avec Docker Compose ; comparatif dans `docs/deploiement.md` |
| Connexion d'un compte suspendu pour supprimer son compte | L'autoriser pour cette seule action |
| Ajouts faits sans demande explicite (voir « Corrections ») | Les garder |
| Textes légaux, points juridiques du périmètre | Contenu à fournir |
| Phrases de `docs/perimetre-v1.md` qui ne sont plus vraies (signalement, droit de réponse, chiens de 1re et 2e catégorie, feuille de route) | Les reformuler |
| ADR 0031 à 0040 au statut « Proposé », et les 18 ADR « acceptés sur délégation » | À confirmer ou à reprendre |

## Corrections

Toutes les corrections sont réunies sur la branche `integration/revue-v1`. Rien n'est fusionné dans `main`.

| Lot | Branche | Contenu | ADR |
| --- | --- | --- | --- |
| 1 | `fix/api-durcissement` | SEC-1, SEC-4, SEC-5, SEC-6, SEC-12 : environnements en liste blanche, clé de développement refusée ailleurs, contrôles au démarrage, limitation de débit (429), en-têtes, corps limité à 256 Ko, journaux sans texte ni jeton | 0031 |
| 2 | `fix/photos-vie-privee` | SEC-11 : photos décodées puis réécrites sans métadonnées, HEIC refusé, cache privé d'un jour, suppression de fichier qui n'échoue plus la requête | 0032 |
| 3a | `fix/mobile-session-reseau` | MOB-1 (partie application), MOB-2, MOB-5, MOB-6, MOB-7 : session gardée sur erreur passagère, fin de session expliquée, délai de 20 s, écran de configuration manquante, connexion de test réservée au développement | 0033 |
| 3b | `fix/mobile-ecrans` | MOB-8, MOB-9, MOB-10, MOB-12 et les mineurs : limite d'erreur, route inconnue, épingle exigée, fil cumulatif, navigation après enregistrement, invitation à ajouter un chien | 0034 |
| 3c | `fix/api-sessions-suspension` | SEC-2, SEC-7, SEC-10 : délai de grâce et familles de jetons, purge, suspension qui gèle et annule, signalements notifiés aux administrateurs | 0035, 0036 |
| 3d | `fix/api-regles-metier` | SEC-3, SEC-8, SEC-9, MET-1, MET-2 : organisations gelées, blocage indiscernable, taille d'un chien inscrit, courses, validation, plafonds, tests manquants | 0037 |
| 4a | `chore/deploiement-api` | Image Docker, bundle de migrations, intégration continue, Dependabot, `docs/deploiement.md` | 0038 |
| 4b | `chore/mobile-build-de-test` | `eas.json`, garde-fou de build, charte de l'écran de démarrage, marche à suivre | 0039 |
| 5 | `docs/mise-a-jour-apres-revue` | Spécification 0.2, anciens ADR annotés, plan de l'onglet Balades | — |
| 3e | `fix/mobile-synchro-api` | Client régénéré, nouveaux codes d'erreur, règles de formulaire, REC-1 à REC-4, REC-6, clavier et mode sombre Android | 0040 |
| 6 | — | Renommage en Uzu : attend l'identifiant de bundle et le schéma de lien | — |

État des tests sur `integration/revue-v1` : 611 côté API (448 avant la revue), 795 côté mobile (541 avant).

Un défaut que seule la réunion des lots a fait apparaître a été corrigé : une suspension qui croisait une inscription du même compte provoquait un interblocage et une erreur 500.

### Ce qui reste ouvert après corrections

- **Suppression d'un compte suspendu (RF-1).** L'API l'autorise, mais un compte suspendu ne peut plus s'authentifier : la suppression n'est possible que tant que sa session ouverte tient, soit 15 minutes. Confirmé par la recette finale. À décider : laisser un compte suspendu se connecter pour cette seule action.
- **Suppression de compte et inscription simultanées depuis le même compte** : l'inscription peut répondre 500. Très improbable, sans effet sur les données ; consigné dans l'ADR 0037.
- **Blocage** : la personne bloquée reçoit « balade complète », mais la fiche affiche toujours les places prises ; elle peut donc voir des places libres.
- **REC-5** (`HEAD /photos/…` en 401) : non traité.
- **MOB-3** (textes légaux) et **MOB-4** (clé Google Maps et identifiants Google pour Android) : dépendent du porteur.
- **Volumes Docker** : dix volumes anonymes vides laissés par les essais de l'image, à supprimer à la main.

### Ajouts faits sans demande explicite, retirables

| Ajout | Où |
| --- | --- |
| La suspension annule aussi les inscriptions du compte aux balades des autres | commit `e6df22b` |
| Une balade commence au plus un an dans le futur | commit `17ffbae` |
| L'épingle du point de rendez-vous doit être placée volontairement même quand la position est connue | lot 3b |
| Le départ d'un membre annule ses inscriptions sans prévenir l'organisateur | lot 3d |
| Dépendances mobiles ajoutées : `expo-dev-client`, `expo-system-ui` | lots 4b et 3e |
| Icône de notification provisoire (patte blanche) | lot 4b |

## Recette

### Première passe, avant corrections

Faite sur `main` (`b8a2832`) : API par `curl`, application dans Expo Go sur simulateur iPhone 17 Pro (iOS 26.0).

Conforme : connexion de test, profil et photo, chiens, onglet Balades en Panneau et en Liste avec ses filtres, création, modification et annulation d'une balade, inscription à un ou plusieurs chiens, gabarit refusé, balade complète, approbation, retrait, fil de messages, organisations et adhésions, balade réservée aux membres, blocage, signalement, changement de compte sans donnée résiduelle, suppression du compte, mode sombre, reprise après arrêt de l'API. En `Production`, l'API refuse bien de démarrer avec la connexion de test, les données de démonstration ou sans clé de signature.

Constats de la revue confirmés par l'exécution :

| Constat | Observation |
| --- | --- |
| SEC-1 | En `Staging` avec la connexion de test, `POST /auth/dev` avec l'e-mail administrateur donne `isAdmin: true` et `GET /admin/reports` répond 200 |
| SEC-11 | Une photo JPEG avec des coordonnées GPS ressort identique octet pour octet par son URL publique |
| SEC-4 | 30 requêtes rapides sur `/auth/refresh` : 30 réponses 401, aucun 429 |
| En-têtes | En `Production`, aucun en-tête de sécurité sur les réponses |
| MOB-10 | Fil de 76 messages : après « Charger les messages précédents » et l'arrivée d'un message, un message disparaît à la jonction |
| MOB-12 | « Enregistrer » puis « Retour » avant la réponse : la navigation dépile un écran de trop |
| MOB-8 | Un lien inconnu affiche l'écran « Unmatched Route » en anglais |
| MOB-9 | Position refusée : la balade se crée à Seppois-le-Haut sans avertissement |
| MOB-3 | Les textes légaux affichent leurs marqueurs entre crochets |

Défauts nouveaux, tous mineurs :

| N° | Défaut |
| --- | --- |
| REC-1 | Appuis répétés sur une carte de balade ou sur « + » : l'écran s'ouvre deux fois |
| REC-2 | Très grande taille de police : titres tronqués, bouton « Carte » qui recouvre une carte de balade, avatar rogné, heure tronquée dans le formulaire |
| REC-3 | API arrêtée : l'onglet Balades garde ses anciennes données sans le signaler |
| REC-4 | Balade inexistante : écran d'erreur réseau avec un « Réessayer » inutile |
| REC-5 | `HEAD /photos/…` répond 401 alors que `GET` répond 200 |
| REC-6 | État vide de l'onglet Balades : le même titre apparaît deux fois |

Non testé :
- **Android** : l'émulateur est devenu instable (« System UI isn't responding ») sur une machine saturée par les autres tâches. À rejouer.
- Liens `dogo://` : le schéma n'existe pas dans Expo Go ; il faut une version de développement.
- Interrupteurs des préférences de notification par appui court : résultat non concluant sur simulateur, à vérifier sur appareil.
- Dans l'interface : balade hebdomadaire, capacité nulle, gabarits restreints, signalement d'un chien ou d'une balade, onglet « Inscrit ».

### Recette finale, après corrections

Faite le 19/11/2026 sur `integration/revue-v1` (`6075561`), sur une base séparée : API par `curl`, application dans Expo Go sur simulateur iPhone 17 Pro et sur émulateur Android (API 37).

**API.** Chaque correction a été vérifiée par l'exécution.

| Point | Observation |
| --- | --- |
| Environnements (SEC-1) | Refus de démarrer en `Staging` avec la connexion de test ou les données de démonstration, en `Staging` et `Production` avec la clé de développement, en `Production` sans chaîne de connexion, sans audience Apple ou Google, ou avec les notifications en mode journal. Une `Production` valide démarre ; `/auth/dev` et `/dev/demo-data` y répondent 404 |
| En-têtes | `nosniff` partout ; HSTS d'un an en HTTPS sur un hôte non local |
| Débit (SEC-4) | 61e requête d'authentification de la minute : 429 `rate_limit.exceeded` avec `Retry-After` ; 31e message du fil en dix minutes : 429 |
| Corps trop gros | 300 Ko de JSON : 413 `request.too_large` ; une photo de 4,2 Mo passe |
| Photos (SEC-11) | Une photo avec position GPS, commentaire et bloc Photoshop ressort sans aucun des trois ; faux JPEG et HEIC refusés (415) ; cache privé, `nosniff`, bac à sable |
| Jeton de rafraîchissement (SEC-2) | Rejoué dans la minute : accepté. Rejoué après 65 s : refusé, et toute sa famille est révoquée ; l'autre session du compte reste valide |
| Blocage (SEC-3) | Réponse identique octet pour octet à celle d'une balade complète |
| Taille d'un chien inscrit | Passage à une taille refusée par la balade : 409 `dog.size_in_use` ; les autres modifications passent |
| Organisation refusée (MET-1) | Nouvelle inscription : 409 `walk.not_open` ; la balade reste ; le membre qui part perd son inscription |
| Suspension (SEC-7) | Balade à venir annulée, série arrêtée, inscription chez un autre libérée, écritures en 403, lectures en 200, suppression du compte possible avec le jeton en cours |
| Signalement (SEC-10) | Notification « Nouveau signalement » à l'administrateur, sans les faits ; le texte d'un message n'apparaît nulle part dans le journal |
| Énumérations et dates | Valeur numérique à la place d'un nom, `startsAt` sans décalage : 400 |

**iPhone.** Parcours principaux conformes : connexion de test, profil avec photo, chien, création de balade, inscription, fil, blocage, signalement, suppression du compte. Corrections vérifiées :

| Point | Observation |
| --- | --- |
| Nouveau membre | Après le profil, l'écran « Nouveau chien » s'ouvre avec son explication |
| Point de rendez-vous (MOB-9) | Création sans repère refusée ; position refusée : avertissement et bouton vers les réglages |
| Fil de plus de 50 messages (MOB-10) | Les messages anciens se raccordent sans trou ; les nouveaux arrivent seuls ; une rafale de 75 messages s'affiche sans manque aux jonctions |
| « Enregistrer » puis « Retour » (MOB-12) | Retour sur la fiche, pas d'écran de trop, modification enregistrée |
| Liens (MOB-8, REC-4) | Lien inconnu : « Page introuvable » en français ; balade inexistante : « Cette balade n'existe pas ou plus » avec un retour |
| API arrêtée (REC-3) | Message clair et « Réessayer » ; l'onglet Balades garde sa liste et signale son heure |
| Fin de session (MOB-2, MOB-5) | Retour à la connexion avec « Ta session a expiré. Reconnecte-toi. » |
| Débit | « Trop de demandes d'un coup. Réessaie dans 60 s. », sans déconnexion |
| Très grande police (REC-2) | Les écrans se replient sans texte tronqué ; deux réserves mineures ci-dessous |
| Mode sombre | Lisible partout |
| Préférences de notification | Bascules répétées et bascules pendant une API gelée : l'état final est le bon côté serveur |
| 20 chiens | Message de plafond, bouton d'ajout retiré ; 409 `dog.limit_reached` par l'API |

**Android.** Première recette sur cette plateforme. Conforme : lancement, connexion de test, données de démonstration, carte avec ses épingles, filtres, fiche, formulaire de création avec le clavier, modification du profil, mode sombre, retour matériel, police agrandie. L'émulateur est resté instable (blocages système sous charge, carte grise avec le rendu graphique par défaut) : ce sont des défauts de l'environnement, non démontrés comme des défauts de l'application.

**Défauts trouvés par la recette finale.** Aucun bloquant.

| N° | Gravité | Défaut | Suite |
| --- | --- | --- | --- |
| RF-1 | Important | Un compte suspendu ne peut plus se connecter : il ne peut supprimer son compte que pendant les 15 minutes de son jeton en cours | Décision à prendre |
| RF-2 | Important, à confirmer sur appareil | Trois appuis espacés d'une seconde sur « + » ou sur une carte, avant que l'écran n'apparaisse, empilent deux écrans : la garde de 800 ms ne suffit pas sur une machine lente | Lot 7 |
| RF-3 | Mineur | Android, fil : le champ de saisie est à moitié masqué par le clavier ; l'affichage du message après envoi n'a pas été confirmé | Lot 7 |
| RF-4 | Mineur | En `Production`, `POST /auth/dev` avec un corps invalide répond 400 au lieu de 404, et `/dev/demo-data` avec un corps non JSON répond 401 | Lot 7 |
| RF-5 | Mineur | `GET /walks?from=` accepte une date sans décalage, alors que les écritures la refusent | Lot 7 |
| RF-6 | Mineur | Le fichier photo servi porte un profil de couleur sRGB standard écrit par la bibliothèque, alors que le README annonçait sa suppression | Lot 7 |
| RF-7 | Mineur | Balade inexistante : titre générique « Oups, un problème est survenu » | Lot 7 |
| RF-8 | Mineur | API arrêtée : l'indicateur de rafraîchissement tourne jusqu'à 40 s ; au retour de l'API, le signal « Impossible d'actualiser » ne s'efface qu'au changement d'onglet | Lot 7 |
| RF-9 | Mineur | Très grande police : rangée de filtres coupée au bord, bouton « Carte » qui recouvre une carte de balade | Lot 7 |
| RF-10 | Mineur | Android en mode sombre : la carte reste claire | Lot 7 |
| RF-11 | Mineur | Réponse 429 : `Retry-After` donne toujours la fenêtre entière, sans décompte | Laissé tel quel |

Non testé par la recette finale :
- De vrais doubles appuis de moins d'une seconde, et des bascules d'interrupteur instantanées : l'outil de pilotage espace ses appuis d'environ une seconde.
- L'arrêt effectif de la série d'une organisation gelée à son échéance hebdomadaire.
- La demande d'adhésion jusqu'au bout et la vue Panneau sur iPhone (vue sur Android) ; la création complète d'une balade sur Android.
- La cause d'un délai dépassé quand l'émulateur Android joint l'API par l'adresse `10.0.2.2` (par redirection de port, tout fonctionne).

## Ce qui n'a pas pu être vérifié

- Connexion Apple et Google, réception réelle d'une notification, appareil photo : il faut des comptes et un appareil physique.
- Liens `dogo://` : le schéma n'existe pas dans Expo Go ; il faut une version de développement.
- L'image Docker de l'API a été construite et lancée en local seulement, jamais chez un hébergeur.
- Comportement d'Expo face à un jeton d'appareil mal formé dans un lot.
- Plans d'exécution des recherches géographiques sur un grand volume.
- Exigences actuelles d'Apple sur la révocation du jeton à la suppression du compte.
