# ADR 0015 — Capacité des balades : verrou sur la ligne de la balade et index unique partiel

- **Statut :** Proposé
- **Date :** 18/11/2026

## Contexte

Une balade a un nombre de places (`maxDogs`) et un chien ne peut avoir qu'une inscription active (`Pending` ou `Accepted`) par balade (spécification §4.3). Plusieurs personnes peuvent s'inscrire au même instant, l'organisateur peut accepter plusieurs demandes à la suite, et baisser `maxDogs` ou retirer un gabarit pendant ce temps. Compter puis insérer sans précaution laisse passer des dépassements : deux requêtes lisent « une place libre » et insèrent toutes les deux.

## Décision

- Toute écriture qui dépend de la capacité ou des inscriptions acceptées (inscrire, accepter, modifier ou annuler la balade) ouvre une transaction et verrouille d'abord la ligne de la balade avec `SELECT … FOR UPDATE` (`WalkQueries.LockWalkAsync`). Les vérifications et l'écriture se font sous ce verrou, en isolation `READ COMMITTED`.
- Un index unique partiel sur `registrations (walk_id, dog_id)` filtré sur `status IN ('Pending', 'Accepted')` garantit en base qu'un chien n'a qu'une inscription active ; sa violation est traduite en `registration.duplicate`.
- Annuler ou refuser une inscription libère une place et n'a pas besoin du verrou pour la capacité.

## Conséquences

- Les demandes simultanées sur une même balade s'exécutent l'une après l'autre ; celles sur des balades différentes ne se gênent pas. Le volume d'un pilote rend l'attente négligeable.
- Un test lance des inscriptions et des acceptations en parallèle ; sans le verrou, il échoue.
- Les lots suivants qui ajoutent une règle d'inscription (blocage, adhésion) la placent dans `RegistrationRules.CheckAsync`, sous le même verrou ; la création de la balade suivante d'une série (lot 3) peut réutiliser le même verrou si elle touche aux inscriptions.

## Alternatives écartées

- **Isolation `SERIALIZABLE`.** Correcte, mais impose de rejouer les transactions en échec de sérialisation, et étend le coût à toutes les requêtes de la transaction.
- **Compteur de places dans la balade, mis à jour par une requête conditionnelle.** Duplique une donnée dérivée des inscriptions, à tenir à jour dans chaque chemin (annulation, refus, suppression de chien ou de compte).
- **Verrou applicatif en mémoire.** Ne tient pas avec plusieurs instances de l'API.
