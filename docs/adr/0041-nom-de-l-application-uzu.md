# ADR 0041 — Nom de l'application : Uzu

- **Statut :** Accepté
- **Date :** 19/11/2026
- **Note :** décision du porteur du projet.

## Contexte

L'application a été développée sous le nom provisoire `dogo` (ADR 0002), avec un identifiant de bundle et un schéma de lien provisoires (`com.victorsauter.dogo`, `dogo://`, spécification §7). Le porteur du projet a choisi son nom définitif : **Uzu**. L'identifiant de bundle iOS, le nom de paquet Android et le schéma de lien sont figés dès la première build envoyée à TestFlight ou à Google Play (ADR 0039) : le renommage devait avoir lieu avant.

## Décision

L'application s'appelle **Uzu**. Les identifiants définitifs sont :

| Élément | Valeur |
| --- | --- |
| Nom affiché | `Uzu` |
| Identifiant de bundle iOS et nom de paquet Android | `com.victorsauter.uzu` |
| Schéma de lien profond | `uzu://` (à la place de `dogo://`) |
| Slug Expo | `uzu` |

**Ce qui est renommé.**

- Le nom du produit dans la documentation, les titres, le texte affiché à l'utilisateur et la description OpenAPI (titre « Uzu API »).
- Les liens profonds que l'API met dans les notifications : `uzu://walks/<id>` et `uzu://organizations/<id>`. Le schéma est défini en un seul endroit dans l'API, la constante `NotificationService.DeepLinkScheme`.
- L'audience Apple d'exemple de l'API (`Auth__Apple__Audiences__0`), qui doit valoir l'identifiant de bundle.
- L'agent utilisateur des données de démonstration (`uzu-demo-data/1.0`) et la présentation de l'une des personnes fictives.
- Côté mobile (lot distinct, `mobile/app.config.ts` et le routage des notifications) : nom affiché, slug, schéma, identifiants.

**Ce qui garde volontairement le nom `dogo`, pour limiter le risque.**

- Le dépôt, ses dossiers, les noms de fichiers et de projets .NET, le namespace `Dogo.Api`, les classes (`DogoDbContext`, `DogoEnvironments`…) et les URL GitHub.
- La base de données, le projet et les conteneurs Docker `dogo`, les noms d'images locales (`dogo-api`), les volumes.
- Les noms de sections de configuration et de variables d'environnement existantes (`ConnectionStrings__Dogo`, `DOGO_VERSION`…).
- L'émetteur et l'audience du jeton d'accès de l'API (`dogo-api`, `dogo-app`) : ce sont des valeurs internes que l'utilisateur ne voit jamais ; les changer invaliderait les sessions ouvertes et n'apporterait rien.
- Les adresses d'exemple `admin@dogo.local` des tests et de la configuration de développement.

## Conséquences

- L'identifiant de bundle, le nom de paquet et le schéma sont figés dès la première build envoyée à TestFlight ou à Google Play : on ne les change plus ensuite sans créer une nouvelle application.
- En Production, l'audience Apple de l'API (`Auth__Apple__Audiences__0`) doit valoir l'identifiant de bundle, `com.victorsauter.uzu` ; sinon la connexion Apple est refusée.
- Les clients OAuth Google (iOS et Android) et la clé Google Maps Android (restriction par nom de paquet) sont à créer ou à restreindre pour `com.victorsauter.uzu` ; l'application Android du projet Firebase aussi. Rien n'a été créé avant ce renommage : il n'y a rien à migrer.
- Le contrat des notifications change : `data.url` commence par `uzu://`. L'application et l'API doivent être déployées ensemble ; une application encore sous `dogo://` ignorerait les liens (aucune build n'a été distribuée).
- `api/openapi.json` change (titre et description) : le client TypeScript du mobile doit être régénéré.
- Le dépôt garde le nom `dogo` : dans le code et l'infrastructure, `dogo` désigne le dépôt, `Uzu` le produit.

## Alternatives écartées

- **Tout renommer, dépôt, namespaces, base et conteneurs compris.** Rien de visible pour l'utilisateur, beaucoup de risque (migrations, conteneurs en place, volumes, historique Git, URL) et un grand diff sans bénéfice.
- **Changer l'émetteur et l'audience du jeton d'accès en `uzu`.** Cela invaliderait les sessions ouvertes pour une valeur que personne ne voit.
- **Garder l'identifiant `com.victorsauter.dogo`.** L'identifiant serait resté en contradiction avec le nom affiché, et le figer au premier envoi l'aurait rendu définitif.
