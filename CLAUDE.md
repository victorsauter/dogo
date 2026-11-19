# Uzu — Consignes pour les agents

Uzu est une application mobile pour trouver et organiser des balades entre chiens. Le dépôt, le code, les namespaces et l'infrastructure gardent le nom `dogo` (ADR 0041) ; identifiants de l'application : `com.victorsauter.uzu`, schéma de lien `uzu://`. Ce dépôt contient l'API (`api/`), l'application mobile (`mobile/`) et la documentation (`docs/`).

## À lire avant de coder

1. `docs/specification-v1.md` : modèle de données, règles, points d'entrée. C'est le contrat ; ne t'en écarte pas sans le signaler.
2. `docs/plan.md` : la tâche que tu réalises et sa place dans l'ensemble.
3. `docs/adr/` : les décisions techniques déjà prises.
4. Le `README.md` du dossier où tu travailles (`api/` ou `mobile/`), s'il existe : commandes et conventions locales.

## Règles

- **Langues.** Code, identifiants, noms de fichiers et messages de journal en anglais. Textes affichés à l'utilisateur en français. Documentation en français.
- **Périmètre.** Ne réalise que les tâches demandées. Ce qui n'est pas dans la spécification ne se code pas ; note-le dans ton compte rendu.
- **Dossiers.** Un agent API ne modifie pas `mobile/`, et inversement. Ne modifie pas `docs/perimetre-v1.md` ni `docs/plan.md`.
- **Secrets.** Aucun secret, clé ou jeton dans le dépôt. Les valeurs de configuration sensibles passent par des variables d'environnement, avec un fichier d'exemple.
- **Dépendances.** Versions stables et récentes. Vérifie dans la documentation officielle plutôt que de mémoire, surtout pour Expo et .NET 10.
- **Tests.** Chaque règle métier de la spécification a au moins un test. Un changement sans test pour ce qu'il ajoute n'est pas terminé.
- **Décisions.** Une décision technique structurante s'écrit dans un nouvel ADR (`docs/adr/`, modèle `0000-modele.md`), avec la ligne correspondante dans l'index.
- **Commits.** Messages en français, au format `type: résumé` (`feat`, `fix`, `docs`, `test`, `chore`). Ne pousse pas et n'ouvre pas de demande de fusion : l'orchestrateur s'en charge.

## Terminé veut dire

- `api/` : `dotnet build` sans avertissement nouveau, `dotnet test` vert, `api/openapi.json` régénéré et versionné.
- `mobile/` : vérification des types, lint et tests verts ; le client d'API régénéré si `api/openapi.json` a changé.
- Le `README.md` du dossier décrit comment lancer et tester ce que tu as ajouté.
- Ton compte rendu liste ce qui est fait, ce qui ne l'est pas, ce que tu n'as pas pu vérifier, et tout écart avec la spécification.

## Ne pas faire

- Toucher au dépôt `DogoMeet`, ni s'en inspirer pour la structure du code.
- Créer des comptes, déployer, lancer des builds payants ou envoyer de vraies notifications.
- Arrêter ou modifier les conteneurs Docker qui ne portent pas le nom du projet `dogo`.
