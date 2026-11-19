# ADR 0036 — Suspension d'un compte (geler, annuler, laisser partir) et notification push des signalements ; précise les ADR 0020 et 0023

- **Statut :** Proposé
- **Date :** 19/11/2026

## Contexte

Jusqu'ici, suspendre un compte (ADR 0020) refusait ses écritures et révoquait ses jetons, sans plus. Ses balades à venir restaient affichées et ouvertes aux inscriptions alors que l'organisateur ne pouvait plus les gérer, ses séries hebdomadaires continuaient d'en créer, ses appareils recevaient encore des notifications, et ses inscriptions bloquaient des places. Un compte suspendu ne pouvait pas non plus se supprimer (ADR 0023, conséquence notée « à revoir »), ce qui le privait de son droit à l'effacement.

Pour les signalements, l'ADR 0020 prévoyait un e-mail à `Admin:ReportEmail` ; faute de fournisseur, l'implémentation ne faisait que journaliser. Sans écran d'administration, personne ne voyait arriver un signalement.

Le porteur du projet a tranché : à la suspension, « geler, annuler, laisser partir » ; pour les signalements, une notification push aux administrateurs.

## Décision

**Suspension**, en une transaction (`AccountSuspension`, `Features/Users/`), qui verrouille la ligne de l'utilisateur :

- **geler** : statut `Suspended` (écritures refusées aussitôt par `AccountStatusMiddleware`), jetons de rafraîchissement révoqués ;
- **annuler** : séries hebdomadaires arrêtées (`active = false`, la tâche des séries relit ce champ sous le verrou de la série) ; balades `Scheduled` non commencées passées à `Cancelled`, inscrits `Accepted` et `Pending` prévenus (`walk_cancelled`) après la validation, exactement comme une annulation par l'organisateur. Ce code est partagé avec la suppression de compte (`UpcomingWalksCancellation`) ;
- appareils de notification supprimés : plus rien n'atteint le compte ;
- **extension**, non demandée mot pour mot et isolée pour pouvoir être retirée : ses inscriptions `Pending` et `Accepted` aux balades non commencées des autres passent à `Cancelled`, sous le verrou des balades (ADR 0015, pris dans l'ordre des identifiants), ce qui libère les places ; sans notification, comme une annulation par la personne ;
- **laisser partir** : `DELETE /me` est la seule écriture permise à un compte suspendu (métadonnée `AllowWhileSuspended` lue par le middleware). La suppression conserve les signalements qui le concernent, sans auteur ni cible (ADR 0023).

Restent intacts : balades passées, chiens, messages, adhésions, signalements. **Rétablir** (`unsuspend`) remet seulement le statut à `Active` et ne restaure rien. La suspension reste idempotente.

**Signalements.** `AdminReportNotifier` remplace `LoggingReportNotifier`. Une fois le signalement enregistré, il garde la ligne de journal (identifiant, type) et dépose dans la file des notifications (ADR 0019) une notification `report_created` pour chaque administrateur, selon la règle complète de l'ADR 0031 (compte actif, e-mail listé, compte de test seulement en Development et Testing), sauf le signalant. Le texte (« Nouveau signalement » ; « Un signalement « {catégorie} » attend d'être examiné. ») ne donne que la catégorie, jamais les faits ni les personnes, puisqu'il s'affiche sur l'écran verrouillé. Cette notification ne dépend d'aucune préférence (catégorie `Administration`, toujours permise). Elle ne porte pas de champ `url` : l'application mobile affiche la notification et ignore le toucher (`targetForNotification` renvoie `null` sans lien), faute d'écran d'administration. `Admin:ReportEmail` reste inutilisée.

**Administrateur affiché.** `isAdmin` de `GET /me` et des sessions suit désormais la même règle complète (levée de la limite notée dans l'ADR 0031).

## Conséquences

- Une suspension a des effets visibles pour les autres : balades annulées et notifiées, places libérées. Un rétablissement ne les défait pas ; l'organisateur rétabli recrée ses balades et ses séries, se reconnecte, et l'application réenregistre son appareil.
- Les organisateurs dont un participant est suspendu voient sa place libérée sans notification, comme pour une suppression de compte.
- Un compte suspendu peut toujours lire et se supprimer ; rien d'autre.
- Les administrateurs doivent avoir l'application installée et les notifications autorisées pour être prévenus ; sinon, `GET /admin/reports` reste le seul moyen de voir les signalements.
- Le type `report_created` est nouveau pour l'application : elle ne le connaît pas (`notificationTypes`) et l'ignore proprement ; un écran d'administration pourra plus tard lui donner un lien.

## Alternatives écartées

- **Suspension qui ne fait que geler.** Laisse des balades fantômes ouvertes aux inscriptions et des séries qui continuent.
- **Supprimer les séries comme la suppression de compte.** Rien à garder pour un compte supprimé ; pour un compte suspendu, les désactiver suffit et garde le lien des balades à leur série.
- **Rétablissement qui restaure.** Les inscrits ont été prévenus de l'annulation et ont pu s'organiser autrement ; rouvrir des balades sans eux serait trompeur.
- **Refuser la suppression à un compte suspendu.** Prive la personne du droit à l'effacement ; l'historique utile (signalements) est de toute façon conservé.
- **Faits ou nom de la personne visée dans la notification.** Exposés sur l'écran verrouillé d'un téléphone.
- **Lien vers un écran qui n'existe pas.** L'application l'ignorerait ou afficherait une page introuvable.
- **E-mail à `Admin:ReportEmail`.** Aucun fournisseur choisi ; le push réutilise un mécanisme existant.
