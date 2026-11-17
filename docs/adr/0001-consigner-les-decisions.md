# ADR 0001 — Consigner les décisions d'architecture dans des ADR

- **Statut :** Accepté
- **Date :** 18/11/2026

## Contexte

Le projet est développé par une seule personne, sur son temps libre, avec l'aide d'un assistant. Entre deux séances de travail, les raisons d'un choix technique se perdent vite.

## Décision

Chaque décision technique structurante est écrite dans un fichier court du dossier `docs/adr/`, numéroté et daté.

## Conséquences

- Une décision se retrouve sans relire tout l'historique du dépôt.
- Les recommandations non validées restent visibles, avec le statut « Proposé ».
- Il faut écrire un nouveau fichier à chaque changement d'avis, au lieu de modifier l'ancien.

## Alternatives écartées

- **Tout garder dans le document de périmètre.** Il mélangerait produit et technique, et deviendrait trop long.
- **Ne rien écrire.** Les choix seraient rediscutés à chaque reprise du projet.
