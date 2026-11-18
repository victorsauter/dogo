# ADR 0019 — Notifications et tâches planifiées : file en mémoire, boucle périodique, rappels au plus une fois

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** accepté par l'orchestrateur, sur délégation, pour lancer le développement ; à confirmer.

## Contexte

Le lot 3 envoie des notifications push à chaque événement de la spécification (§4.4) et fait tourner deux traitements sans requête : le rappel deux heures avant une balade et la création de la balade suivante d'une série hebdomadaire (§4.5). L'ADR 0008 retient le service d'Expo pour l'envoi. Il faut décider où et quand ces envois et ces traitements s'exécutent.

Contraintes : une notification ne doit jamais faire échouer ni ralentir la requête qui l'a provoquée ; elle ne doit partir qu'une fois l'événement enregistré ; chaque rappel ne part qu'une fois, même après un redémarrage ou avec plusieurs instances de l'API ; une série n'a jamais plus d'une balade à venir. Le pilote tourne sur une seule petite instance, sans autre infrastructure que PostgreSQL.

## Décision

- **Notifications.** Le gestionnaire de la requête dépose un événement (type, sujet, auteur de l'action, destinataires) dans une file en mémoire (`NotificationQueue`, un `Channel` borné) **après** la validation de la transaction, puis répond. Un service d'arrière-plan (`NotificationDispatcher`) lit la file et confie chaque événement à `NotificationService`, qui retire l'auteur et les doublons, applique les préférences, charge les appareils, compose les textes français et appelle `IPushSender`. Les échecs sont journalisés et n'arrêtent pas la boucle. `IPushSender` a deux implémentations : `ExpoPushSender` (lots de 100, suppression des appareils signalés `DeviceNotRegistered`) et `LoggingPushSender`, choisies par `Notifications:Provider` (`Log` par défaut).
- **Tâches planifiées.** La logique est dans des services ordinaires (`WalkReminderJob`, `WalkSeriesJob`) qui reçoivent l'horloge (`TimeProvider`). Un service hébergé (`BackgroundJobsService`) les appelle à intervalle fixe (`BackgroundJobs:Interval`, une minute par défaut) et survit à leurs exceptions. `BackgroundJobs:Enabled` le désactive ; les tests l'éteignent et appellent les services avec une horloge contrôlée.
- **Rappels au plus une fois.** Le rappel est réservé en base avant l'envoi : un seul `UPDATE walks SET reminder_sent_at = now WHERE reminder_sent_at IS NULL AND status = 'Scheduled' AND starts_at > now AND starts_at <= now + 2 h RETURNING id`. Deux exécutions simultanées ne peuvent pas réserver la même balade ; un redémarrage ne la renvoie pas. Modifier l'heure de début remet la réservation à zéro.
- **Une balade à venir par série.** La création de la suivante verrouille la ligne de la série (`SELECT … FOR UPDATE`) et revérifie sous ce verrou qu'aucune balade de la série n'est à venir, comme l'ADR 0015 le fait pour la capacité.

## Conséquences

- Aucune dépendance nouvelle (ni ordonnanceur, ni courtier de messages) ; plusieurs instances peuvent faire tourner les tâches sans se gêner, la base arbitre.
- Garantie « au plus une fois », pas « au moins une fois » : un arrêt entre la réservation d'un rappel et son envoi, ou des notifications encore en file à l'arrêt du processus, sont perdus. C'est acceptable pour des notifications de confort ; les informations restent dans l'application.
- Une notification part au plus une minute environ après l'échéance d'un rappel ; une balade créée moins de deux heures avant son début reçoit son rappel au passage suivant de la tâche (le texte donne l'heure, pas « dans 2 heures »).
- Les accusés de réception d'Expo (`getReceipts`) ne sont pas consultés : un appareil désinscrit n'est retiré que lorsque le ticket immédiat le signale. À ajouter si les jetons morts s'accumulent.
- La balade suivante reprend l'heure locale de la précédente ; une heure locale inexistante (passage à l'heure d'été, entre 2 h et 3 h) est décalée d'une heure et le reste ensuite. Cas improbable pour une balade.

## Alternatives écartées

- **Envoi dans la requête.** Simple, mais lie la durée et la réussite de la requête au service d'Expo.
- **Table de notifications à envoyer (outbox) en base.** Garantit l'envoi même après un arrêt, au prix d'une table, d'un balayage et d'un nettoyage ; disproportionné pour un pilote.
- **Ordonnanceur dédié (Quartz.NET, Hangfire).** Apporte persistance et tableau de bord, mais une dépendance et des tables de plus pour deux tâches d'une minute.
- **Verrou consultatif PostgreSQL pour n'exécuter les tâches que sur une instance.** Inutile tant que chaque tâche est sûre en concurrence par elle-même.
- **Marquer le rappel après l'envoi.** Donne « au moins une fois » mais des doublons en cas d'exécutions simultanées ou d'arrêt pendant l'envoi ; la spécification demande un seul envoi.
