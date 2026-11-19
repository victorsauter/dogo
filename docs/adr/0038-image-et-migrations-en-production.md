# ADR 0038 — Image de l'API et migrations en production : image .NET Ubuntu non root, bundle EF Core à lancer à chaque déploiement

- **Statut :** Proposé
- **Date :** 19/11/2026

## Contexte

Rien n'existait pour déployer l'API : pas d'image, et `MigrateAsync` ne tourne qu'en Development (`Program.cs`). L'hébergeur n'est pas choisi ; l'API doit pouvoir tourner sur un serveur Docker comme sur une plateforme de conteneurs. Contraintes déjà décidées : PostgreSQL avec PostGIS (ADR 0005) ; photos sur un disque local, donc une seule instance en écriture et un volume sauvegardé (ADR 0010) ; file de notifications en mémoire (ADR 0019) ; l'API écoute en HTTP derrière un proxy qui termine TLS et refuse de démarrer hors Development si sa configuration n'est pas sûre (ADR 0031) ; le fuseau `Europe/Paris` doit exister ; SkiaSharp avec `SkiaSharp.NativeAssets.Linux.NoDependencies` (ADR 0032).

## Décision

**Image.** `api/Dockerfile`, en deux étapes, sur les images officielles `mcr.microsoft.com/dotnet/sdk:10.0-noble` (construction) et `aspnet:10.0-noble` (exécution). Ubuntu 24.04 est la distribution par défaut des images .NET 10 ; on la nomme dans l'étiquette pour qu'un changement de base ne passe pas inaperçu. Les images « chiseled » sont écartées : elles n'ont ni tzdata (Europe/Paris est obligatoire) ni shell. Le contexte de construction est `api/`.

- **Utilisateur** : `app` (uid 1654), fourni par l'image ; l'API écoute sur le port 8080 (`ASPNETCORE_HTTP_PORTS`), sans privilège.
- **Environnement** : `ASPNETCORE_ENVIRONMENT=Production` dans l'image ; `appsettings.Development.json` n'y est pas copié.
- **Volume** : `/data/photos`, propriété de `app`, déclaré `VOLUME` et réglé par `Storage__Local__Path` ; un volume nommé vide en hérite les droits, un dossier de l'hôte doit appartenir à l'uid 1654.
- **Taille** : seules les bibliothèques natives Linux x64 et arm64 de SkiaSharp sont gardées (le paquet apporte aussi Windows, macOS, Android : près de 480 Mo). Mesuré le 19/11/2026 : image de 376 Mo en arm64 (publication : 36 Mo ; bundle : 50 Mo).
- **Génération d'`openapi.json`** : la construction du projet l'écrit deux dossiers au-dessus du projet, hors du contexte. Dans l'image, elle est neutralisée par `OpenApiGenerateDocuments=false`, posé dans l'environnement de l'étape de construction ; rien ne change en local ni en CI.
- **Contrôle de santé** : `GET /api/v1/health` par une requête HTTP/1.0 écrite avec `bash` (l'image n'a ni curl ni wget). HTTP/1.0 n'envoie pas d'en-tête `Host`, que `AllowedHosts` accepte.
- **tini comme processus 1.** Constaté : lorsque la configuration est refusée au démarrage, .NET se termine par `SIGABRT`, que le noyau ignore pour le processus 1 d'un conteneur ; le processus tournait alors à 100 % du processeur au lieu de quitter (essai : plus de 60 s en cours, état « running »). Avec `tini` (paquet Ubuntu, 1 Mo), le conteneur s'arrête en quelques secondes (code 134) et la politique de redémarrage peut jouer ; `SIGTERM` est transmis et l'arrêt dure une seconde.

**Migrations : un bundle EF Core, construit dans la même image et lancé à chaque déploiement.** `dotnet ef migrations bundle` produit à l'étape de construction `/app/efbundle`, un exécutable qui applique les migrations sans SDK ni outil EF. Il est dans l'image de l'API : une étiquette désigne toujours un code et le schéma qui va avec. Lancement : `docker run --rm --entrypoint ./efbundle -e ConnectionStrings__Dogo=… dogo-api:<étiquette>` (ou le service `migrate` de l'exemple Compose), après l'arrêt de l'ancienne API et avant le démarrage de la nouvelle. La chaîne de connexion se passe par la variable `ConnectionStrings__Dogo` (la même que celle de l'API) : l'option `--connection` du bundle ne suffit pas, parce que l'application crée son `DbContext` avec la configuration avant de l'appliquer (essai : « Value cannot be null (Parameter 'Host') »). Le bundle est construit avec `ASPNETCORE_ENVIRONMENT=Production` et une chaîne factice (l'outil crée un contexte ; elle n'est pas embarquée).

Vérifié le 19/11/2026 sur une base vide créée dans le PostgreSQL de développement : les 4 migrations s'appliquent, le schéma obtenu est identique à celui du script SQL idempotent (comparaison de `pg_dump`), un second lancement répond « No migrations were applied », PostGIS 3.6.4 est actif.

## Conséquences

- Le déploiement est : sauvegarde, image, arrêt de l'API, bundle, démarrage, vérifications ([guide](../deploiement.md)). Il y a une courte interruption, normale avec une seule instance.
- Le bundle peut tourner avec un autre rôle PostgreSQL que l'API (celui du schéma) : recommandé par la documentation d'EF Core, possible ici sans changer le code. Pour le pilote, un seul rôle suffit.
- La première migration exécute `CREATE EXTENSION IF NOT EXISTS postgis` : sur une base gérée, activer d'abord PostGIS avec le compte administrateur du fournisseur ; la commande ne demande alors plus de droit.
- Le bundle ne montre pas le SQL qu'il exécutera : pour le relire, générer un script (`dotnet ef migrations script --idempotent`), qui reste une alternative documentée.
- Aucune modification de `Program.cs` : `MigrateAsync` reste réservé à Development.
- L'image se construit pour l'architecture de la machine qui la construit ; la base PostGIS officielle n'existe qu'en amd64, un serveur x86 est donc le choix simple.
- Les journaux d'une base vide contiennent une erreur apparente (lecture de `__EFMigrationsHistory` avant sa création) et un message `libgssapi_krb5.so.2` : sans conséquence.
- Si le refus de démarrer d'un autre hôte de conteneurs ne quitte pas non plus (plateforme sans `tini`), c'est l'image qui le garantit : ne pas remplacer son `ENTRYPOINT`.

## Alternatives écartées

- **Script SQL idempotent.** Relisible et sans outil à l'exécution, mais exécuté hors d'EF Core (pas de verrou de migration, comportement des transactions et des erreurs laissé à `psql`), et il faut un client SQL et un fichier à transporter. Gardé comme outil de relecture, pas comme moyen de déploiement.
- **Mode « migration » de l'exécutable** (`Dogo.Api.dll --migrate`) ou `MigrateAsync` au démarrage en Production. Zéro artefact en plus, mais modifie `Program.cs`, oblige l'API à utiliser un rôle propriétaire du schéma, et ferait migrer chaque instance au démarrage ; la documentation d'EF Core le déconseille pour l'automatisation. Le verrou d'EF Core 9 limite le danger, pas les droits de l'API.
- **Bundle dans une image séparée.** Respecte à la lettre « une image pour l'API, une pour la migration », mais deux étiquettes à garder alignées, et une erreur d'alignement applique le mauvais schéma. 50 Mo de plus dans l'image de l'API sont un moindre mal.
- **Bundle autonome (`--self-contained`).** Inutile : l'image de l'API contient déjà le runtime.
- **Images « chiseled » ou Alpine.** Plus petites, mais sans tzdata (chiseled) ou avec une libc différente (Alpine) ; l'image Ubuntu standard reste la seule qui garantit le fuseau et SkiaSharp sans réglage.
- **`--init` de Docker ou `init: true` de Compose.** Corrige le même défaut, mais seulement là où on y pense : une plateforme qui lance l'image sans cette option retrouverait le processus qui ne quitte pas. `tini` dans l'image protège partout.
- **Registre d'images.** Aucun registre n'est choisi ni utilisé : l'image se construit sur la machine de déploiement. À décider avec l'hébergeur.
