# ADR 0037 — Organisations gelées, blocage indiscernable d'une balade complète, écritures concurrentes sans écrasement

- **Statut :** Proposé
- **Date :** 19/11/2026
- **Note :** les règles 1 et 2 sont des décisions du porteur du projet ; le mécanisme anti-course est un choix de l'agent API.

## Contexte

Une revue des règles métier a relevé trois défauts :

1. **Organisation qui n'est plus validée.** La spécification (§4.6) dit que seule une organisation `Approved` porte des balades, mais l'inscription ne regardait que l'adhésion et la tâche des séries recopiait `organizationId` sans rien revérifier. Quand le seul responsable supprime son compte (organisation `Closed`) ou qu'un administrateur refuse une organisation validée, les balades de ses éducateurs restaient ouvertes et leurs séries en créaient une nouvelle chaque semaine. Un membre qui partait gardait ses inscriptions.
2. **Blocage détectable.** Le refus `walk.not_allowed` n'était produit que par un blocage : la personne bloquée savait qu'elle l'était, ce que le §4.7 interdit.
3. **Courses.** Annuler une inscription, supprimer un chien et quitter une organisation ne prenaient pas le verrou de la balade (ADR 0015) : une acceptation concurrente pouvait réécrire `Accepted` sur une inscription que son auteur venait d'annuler, ou laisser une inscription acceptée sans chien. Une acceptation d'adhésion qui croisait un retrait répondait 500.

## Décision

**Organisation gelée, sans annulation.**
- Une balade dont l'organisation n'est plus `Approved` ne prend plus d'inscription : `walk.not_open` (409), comme une balade annulée ou commencée. Ce code dit déjà « cette balade n'accepte pas d'inscription » ; `walk.members_only` serait faux pour un membre et `organization.not_approved` concerne l'adhésion. L'acceptation d'une demande rejoue ce contrôle et la règle d'adhésion (`walk.members_only`).
- Avant de créer la balade suivante, sous le verrou de la série, la tâche vérifie que l'organisation est `Approved` et que l'organisateur en est encore responsable ou éducateur accepté. Sinon la série passe à inactive, sans créer de balade. C'est ce qui arrête aussi la série d'un éducateur rétrogradé ou retiré.
- Les balades déjà créées et leurs inscriptions acceptées restent ; l'organisateur peut les annuler.
- Quitter une organisation ou en être retiré annule (`Cancelled`) ses inscriptions `Pending` et `Accepted` aux balades à venir de cette organisation, sauf sur les balades qu'il organise lui-même (un organisateur inscrit ses chiens librement). Aucune notification n'est envoyée.

**Blocage indiscernable.** Une personne bloquée par l'organisateur reçoit exactement la réponse d'une balade complète : `walk.full`, 409, même titre, sans détail. Le contrôle est fait à la place de la capacité, dans l'ordre du tableau du §4.3 (balade ouverte, chien, gabarit, doublon, places et blocage, adhésion), et les deux requêtes tournent toujours, pour que ni l'ordre des erreurs ni le temps de réponse ne dépendent du blocage. Le code `walk.not_allowed` est retiré.

**Écritures concurrentes : conditions sur le statut et verrous de lignes, sans verrou de balade supplémentaire.**
- Tout changement de statut d'une inscription (accepter, refuser, annuler) et d'une adhésion (accepter, refuser) est un `UPDATE … WHERE id = … AND status IN (statuts attendus)`. En `READ COMMITTED`, PostgreSQL attend l'écrivain concurrent de la ligne puis réévalue la condition sur la version validée : une acceptation n'écrase jamais une annulation, un refus jamais une annulation, une annulation jamais un refus. Zéro ligne modifiée donne une réponse propre (`registration.not_active`, `membership.not_found` ou `membership.not_pending`).
- Le chien est verrouillé : `FOR UPDATE` pour le modifier ou le supprimer, `FOR SHARE` pour l'inscrire ou accepter son inscription. Ordre des verrous : les chiens, puis la balade. La suppression d'un chien verrouille le chien puis touche les lignes des balades (contrôles de clés étrangères) ; l'ordre inverse produisait des interblocages, observés en test.
- L'inscription à une balade professionnelle partage (`FOR SHARE`) la ligne de l'organisation et celle de l'adhésion ; quitter supprime d'abord l'adhésion, puis annule les inscriptions. Une fermeture, un refus ou un départ simultané attend donc l'inscription, ou est vu par elle.
- Créer un chien verrouille la ligne du compte, pour que le plafond de 20 chiens tienne.
- La suspension d'un compte (ADR 0036) verrouille la ligne du compte en `FOR NO KEY UPDATE`, pas en `FOR UPDATE` : le contrôle de clé étrangère d'une inscription du même compte prend `FOR KEY SHARE` sur cette ligne, et `FOR UPDATE` le faisait attendre alors qu'il détenait déjà la balade que la suspension réclame ensuite (interblocage constaté, revue d'intégration). Elle reste sérialisée avec la suppression du compte et la création d'un chien, qui prennent `FOR UPDATE`. Ordre complet : ligne du compte, chiens, puis balades (par identifiant croissant quand il y en a plusieurs). La suppression du compte garde `FOR UPDATE` (la ligne disparaît) : une inscription du même compte lancée en même temps peut encore échouer en 500, limite connue.

## Conséquences

- Plus de 500 sur les courses relevées ; des tests de concurrence lancent les paires de requêtes ensemble et vérifient les invariants.
- La personne bloquée peut encore remarquer une incohérence : la fiche montre des places libres (`acceptedDogsCount` et `maxDogs`) alors que l'inscription répond « complète ». Masquer la place sur la fiche ferait dépendre la fiche des blocages des autres ; ce n'est pas fait.
- Une balade gelée reste visible et marquée professionnelle, avec le nom de l'organisation, tant que l'organisateur ne l'annule pas.
- L'application mobile n'a plus de message pour `walk.not_allowed` à afficher ; le message de `walk.full` couvre les deux cas.
- Toute nouvelle écriture qui verrouille un chien et une balade doit respecter l'ordre « chiens, puis balade ».

## Alternatives écartées

- **Annuler les balades d'une organisation fermée ou refusée.** Écarté par le porteur : une fermeture involontaire (suppression de compte) ne doit pas défaire les balades des éducateurs.
- **Code d'erreur générique pour le blocage, partagé avec d'autres refus.** Aucun autre refus n'aurait produit ce code : il restait propre au blocage.
- **Verrou de la balade dans l'annulation, la suppression d'un chien et le départ.** La suppression d'un chien et le départ touchent plusieurs balades : il aurait fallu les verrouiller toutes, dans un ordre fixe, avec plus de risques d'interblocage, alors que seul le statut de la ligne est disputé. L'annulation ne fait que libérer une place (ADR 0015).
- **Jeton de concurrence (`xmin`) sur les inscriptions.** Transforme chaque course en erreur à rejouer côté serveur ou client ; la condition sur le statut donne directement la bonne réponse.
