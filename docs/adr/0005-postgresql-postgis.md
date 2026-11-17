# ADR 0005 — PostgreSQL et PostGIS pour les données

- **Statut :** Proposé
- **Date :** 18/11/2026

## Contexte

La fonction centrale de l'application est de trouver les balades proches d'un point, sur une carte et dans une liste. `DogoMeet` utilisait SQLite, sans donnée géographique.

## Décision

Les données sont stockées dans PostgreSQL, avec l'extension PostGIS pour les points de rendez-vous et la recherche par proximité. Le schéma évolue par migrations EF Core.

## Conséquences

- La recherche « balades autour de moi » se fait dans la base, avec un index géographique.
- Le développement local demande une base PostgreSQL, lancée avec Docker Compose.
- L'hébergement retenu doit proposer PostGIS.

## Alternatives écartées

- **SQLite.** Le plus simple à lancer, mais une base en un seul fichier convient mal à une API hébergée, et la recherche géographique demande une extension à part.
- **Latitude et longitude dans des colonnes simples.** Suffisant pour une seule ville. Écarté parce que PostGIS coûte peu à installer dès le départ et évite une migration plus tard.
