# ADR 0023 — Suppression de compte : suppression réelle en une transaction, balades conservées sans organisateur

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** accepté par l'orchestrateur, sur délégation, pour lancer le développement ; à confirmer.
- **Précisé par :** [ADR 0036](0036-suspension-et-signalements.md) (un compte suspendu peut se supprimer) ; [ADR 0042](0042-chien-relie-a-plusieurs-humains.md) (un chien n'est supprimé que si l'utilisateur en était le dernier propriétaire).

## Contexte

La spécification (§4.8) demande qu'une suppression de compte annule les balades à venir de la personne et prévienne leurs inscrits, supprime ses chiens, inscriptions, appareils, adhésions, blocages et jetons, ferme les organisations dont elle était le seul responsable, et conserve ses messages et ses signalements sans auteur (`authorId`, `reporterId` nuls).

Jusqu'au lot 3, une balade dépendait de son organisateur par une clé étrangère en cascade : supprimer l'utilisateur effaçait toutes ses balades, passées comprises, avec les inscriptions des autres participants et tout le fil de messages. Cela contredit « annule » et « conserve ses messages ». Par ailleurs, un jeton d'accès reste valide 15 minutes (ADR 0009) : après la suppression, une requête authentifiée par ce jeton visait un compte inexistant.

## Décision

- **Suppression réelle.** La ligne `users` est supprimée, avec ses données personnelles ; pas de compte « fantôme » anonymisé.
- **Une transaction.** `AccountDeletion` verrouille la ligne de l'utilisateur, passe ses balades `Scheduled` à venir à `Cancelled` par un seul `UPDATE … RETURNING` (qui verrouille leurs lignes comme l'ADR 0015), puis supprime ou détache tout le reste, explicitement, dans l'ordre de la spécification. Les notifications `walk_cancelled` (inscrits `Accepted` et `Pending`) et l'effacement des fichiers de photos suivent la validation (ADR 0019).
- **Balades conservées.** `walks.organizer_id` devient facultatif (`ON DELETE SET NULL`) : toutes les balades de la personne restent, sans organisateur, pour l'historique et le fil des autres participants. Les séries hebdomadaires de la personne sont supprimées, ce qui les arrête. Dans les réponses, `organizer` peut donc valoir `null`.
- **Références détachées plutôt que supprimées.** Messages (`author_id`), signalements (`reporter_id`, `target_user_id`, et `target_dog_id` par la suppression des chiens), organisations (`created_by_id`) passent à `null`.
- **Jetons encore valides.** Le middleware qui vérifiait déjà la suspension (`AccountStatusMiddleware`) relit le compte à chaque requête authentifiée : un compte disparu reçoit 401 `auth.invalid_token` partout, plutôt qu'une erreur 500 ou une écriture orpheline.

## Conséquences

- Le contrat change : `organizer` est nullable dans les trois formes de balade. L'application doit afficher un organisateur absent (« Compte supprimé »), comme elle le fait déjà pour l'auteur d'un message.
- Une lecture de la table `users` par requête authentifiée, lectures comprises ; négligeable à l'échelle du pilote, et c'est elle qui rend la suspension et la suppression immédiates.
- Les organisateurs dont un participant supprime son compte voient sa place libérée sans notification (la spécification n'en prévoit pas).
- Un compte suspendu ne peut pas se supprimer (toute écriture est refusée, §1) ; à revoir si une demande d'effacement doit passer par l'administration.
- Se reconnecter avec le même compte Apple ou Google crée un compte neuf.

## Alternatives écartées

- **Laisser la cascade supprimer les balades.** Efface l'historique et les messages des autres participants, contrairement à la spécification.
- **Anonymiser la ligne `users` au lieu de la supprimer.** Évite un `organizer` nullable, mais garde un enregistrement par compte supprimé, contredit les auteurs nuls de la spécification et demande un statut de plus à filtrer partout (connexion, profils, recherches).
- **Révoquer les jetons d'accès par une liste noire.** Une table et un nettoyage de plus, alors que le compte est de toute façon relu pour la suspension.
