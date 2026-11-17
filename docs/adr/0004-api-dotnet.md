# ADR 0004 — API en .NET 10, code organisé par fonctionnalité

- **Statut :** Accepté
- **Date :** 18/11/2026

## Contexte

Le premier développement, dans `DogoMeet`, est une API .NET en minimal API avec EF Core. Elle repose sur une couche générique : les mêmes points d'entrée, le même service et le même accès aux données servent à toutes les entités.

Le périmètre V1 ajoute des règles qui ne sont pas de simples lectures et écritures : s'inscrire à une balade selon la capacité et le gabarit, approuver une demande, bloquer une personne, réserver une balade aux membres d'une organisation.

## Décision

L'API reste en .NET, en version 10, en minimal API.

Le code est organisé par fonctionnalité : un dossier par domaine (comptes, chiens, balades, inscriptions, organisations, signalements), chacun avec ses points d'entrée, ses règles et ses tests.

## Conséquences

- La pile reste celle de `DogoMeet` ; seule l'organisation du code change.
- Une règle métier se lit et se teste à un seul endroit.
- Plus de code à écrire par entité que dans une couche générique.

## Alternatives écartées

- **Reprendre le CRUD générique de `DogoMeet`.** Déjà écrit, et très peu de code par entité. Les règles d'inscription, d'approbation et de blocage devraient toutefois vivre en dehors de la couche générique, ce qui ferait cohabiter deux styles. Option écartée le 18/11/2026.
- **Changer de langage côté serveur.** Aucun gain, et la perte de l'expérience acquise en .NET.
