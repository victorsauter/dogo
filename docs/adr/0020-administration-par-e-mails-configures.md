# ADR 0020 — Administration : comptes désignés par leur e-mail dans la configuration, points d'entrée `/admin` sans écran

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** accepté par l'orchestrateur, sur délégation, pour lancer le développement ; à confirmer.

## Contexte

La spécification (§4.7, §7) confie à des administrateurs la validation des organisations, le traitement des signalements et la suspension des comptes. Le pilote compte une poignée d'administrateurs, connus d'avance, qui se connectent avec Apple ou Google comme tout le monde (ADR 0006). Il n'y a ni rôle en base, ni écran d'administration prévu en V1, ni fournisseur d'e-mails.

Il faut décider comment reconnaître un administrateur, comment il agit, et comment un testeur peut le devenir en local, où les comptes de test (`/auth/dev`) n'ont pas d'e-mail.

## Décision

- **Qui.** Est administrateur le compte dont l'e-mail figure dans `Admin:Emails` (comparaison sans casse). L'e-mail n'est enregistré que s'il est vérifié par Apple ou Google. Il est relu en base à chaque requête : retirer une adresse de la configuration, ou changer l'e-mail d'un compte, prend effet aussitôt. `GET /me` expose `isAdmin` pour que l'application puisse adapter son affichage.
- **Comment.** Des points d'entrée sous `/api/v1/admin` (organisations, signalements, suspension), décrits dans `openapi.json` comme les autres, sans écran. Un filtre posé sur le groupe répond 403 `admin.forbidden` à tout autre compte, avant le gestionnaire.
- **Garde-fous.** Un administrateur ne peut pas se suspendre lui-même (`admin.self_suspension`). Suspendre révoque les jetons de rafraîchissement ; le statut, relu à chaque requête, bloque les écritures tout de suite.
- **En local.** La connexion de test accepte un champ `email` facultatif, tenu pour vérifié ; `appsettings.Development.json` déclare `admin@dogo.local`. L'API refuse de démarrer en Production avec cette connexion active : un e-mail non vérifié ne peut donc pas y servir.
- **Signalements.** Une interface `IReportNotifier` prévient l'administration à chaque signalement ; son implémentation V1 journalise l'identifiant et le type, jamais les faits ni les personnes. L'adresse future est `Admin:ReportEmail`.

## Conséquences

- Aucune table ni migration pour les rôles ; ajouter ou retirer un administrateur est un changement de configuration (variable d'environnement `Admin__Emails__0`…), sans redéploiement du code.
- Un compte Apple qui masque son e-mail (relais privé) ne peut être administrateur qu'avec l'adresse de relais ; à savoir lors du choix des comptes.
- Administrer demande un client HTTP (curl par exemple) et un jeton d'accès ; acceptable pour quelques actions par semaine. Un écran pourra s'appuyer sur les mêmes points d'entrée.
- Une requête de plus par appel `/admin` (lecture de l'e-mail) ; négligeable.

## Alternatives écartées

- **Rôle stocké en base (`users.role`).** Demande un moyen de nommer le premier administrateur (script, migration de données) et un écran ou un point d'entrée pour les suivants ; plus lourd que la liste de configuration pour un pilote.
- **Revendication `admin` dans le jeton d'accès.** Prendrait effet seulement à l'expiration du jeton, et dépendrait de l'état au moment de la connexion.
- **Clé d'API d'administration partagée.** Ne dit pas qui a agi, se partage mal et se fait fuir facilement.
- **Écran d'administration dans l'application ou console web.** Hors périmètre V1 (spécification §7).
