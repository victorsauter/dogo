# ADR 0008 — Notifications push, sans temps réel

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** accepté par l'orchestrateur, sur délégation, pour lancer le développement ; à confirmer.

## Contexte

Le périmètre V1 retient un fil de discussion simple par balade, sans temps réel ni photos. Les inscrits doivent être prévenus d'une inscription, d'une approbation, d'un changement, d'un nouveau message et de l'approche de la balade.

## Décision

L'application n'ouvre pas de connexion permanente avec l'API. Le fil se charge à l'ouverture et se rafraîchit à la demande ; les nouveautés arrivent par notification push.

Les notifications passent par le service de notifications d'Expo, qui les relaie vers Apple et Google.

## Conséquences

- Pas d'infrastructure de temps réel à héberger ni à surveiller.
- Un message s'affiche chez les autres après une notification ou un rafraîchissement, pas instantanément.
- L'API enregistre un jeton par appareil et l'efface quand il n'est plus valide.
- Les rappels avant balade demandent une tâche planifiée côté serveur.
- L'envoi dépend d'un service tiers ; le remplacer plus tard ne touche que l'envoi.

## Alternatives écartées

- **Messagerie en temps réel.** Plus agréable, mais sort du périmètre et alourdit l'hébergement.
- **Lien vers un groupe externe.** Rien à construire, mais les échanges quittent l'application.
- **Envoi direct vers Apple et Google.** Supprime l'intermédiaire, au prix de deux intégrations à maintenir.
