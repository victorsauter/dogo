# Uzu — Guide de déploiement de l'API

**Version :** 0.1 · 19/11/2026 · pour un pilote (quelques dizaines d'utilisateurs, un village)

Ce guide s'adresse à une personne qui met l'API en ligne pour la première fois. Il suppose le dépôt cloné, Docker installé sur la machine de déploiement et l'[ADR 0038](adr/0038-image-et-migrations-en-production.md) comme référence des choix (image, migrations). Le choix de l'hébergeur n'est **pas** fait : la section 7 compare des options et recommande, la décision revient au porteur.

## 1. Architecture cible

```
 téléphones ──HTTPS──▶ proxy TLS ──HTTP :8080──▶ API (1 instance) ──▶ PostgreSQL + PostGIS
                       (Caddy, ou celui                │
                        de l'hébergeur)                └──▶ volume des photos (/data/photos)
                                                       └──▶ HTTPS sortant : Apple, Google (clés JWKS), Expo (notifications)
```

- **Proxy TLS.** Termine HTTPS et transmet en HTTP. L'API refuse de lire `X-Forwarded-For` et `X-Forwarded-Proto` sauf du proxy déclaré (`Proxy__*`, ADR 0031) : sans cela, la limitation de débit par adresse IP verrait l'adresse du proxy pour tout le monde. Le proxy doit laisser passer des corps de 6 Mo (photos).
- **Une instance d'API.** Image `dogo-api`, utilisateur sans privilèges, port 8080, contrôle de santé `/api/v1/health`.
- **PostgreSQL avec PostGIS** (ADR 0005), à joindre depuis l'API seulement, jamais depuis Internet.
- **Volume des photos** monté sur `/data/photos`, sauvegardé (ADR 0010). Les photos sont servies sans authentification par l'API elle-même (`/photos/…`).

**Ce qui interdit plusieurs instances d'API**, et pourquoi :

| Élément | Raison | Conséquence avec deux instances |
| --- | --- | --- |
| Photos sur disque local (ADR 0010) | Un volume ne s'attache qu'à une machine | Une photo écrite par l'une n'existe pas pour l'autre : images cassées |
| Limitation de débit en mémoire (ADR 0031) | Compteurs par processus | La limite réelle est multipliée par le nombre d'instances |
| File de notifications en mémoire (ADR 0019) | Perdue à l'arrêt du processus, non partagée | Notifications en file perdues à chaque redémarrage (déjà le cas avec une instance) |
| Tâches planifiées | Chaque instance les lance ; la base arbitre (rappels au plus une fois, ADR 0019) | Sans danger, mais inutile |

Passer à plusieurs instances demande d'abord un stockage d'objets pour les photos (autre implémentation de `IPhotoStorage`) et une limite de débit partagée : hors périmètre du pilote.

Un déploiement a donc une **courte interruption** (quelques secondes à la mise à jour) : acceptable ici, et c'est le comportement des plateformes à volume (Render, Railway) aussi.

## 2. Variables d'environnement

L'image fixe déjà `ASPNETCORE_ENVIRONMENT=Production`, `ASPNETCORE_HTTP_PORTS=8080` et `Storage__Local__Path=/data/photos`. Le modèle complet est [`api/.env.example`](../api/.env.example) (copier en `.env`, jamais versionné) ; la référence de chaque clé est dans le [README de l'API](../api/README.md#configuration). Ne rien écrire de secret dans ce dépôt : gérer ces valeurs dans le gestionnaire de secrets de l'hébergeur ou dans un `.env` du serveur (droits 600).

| Variable | À poser | Si elle manque ou est fausse |
| --- | --- | --- |
| `ConnectionStrings__Dogo` | Oui. `Host=…;Port=5432;Database=dogo;Username=…;Password=…` | **Refus de démarrer** (« ConnectionStrings:Dogo is empty »). Avec une base injoignable : l'API démarre mais `/api/v1/health` répond 503 |
| `Auth__Jwt__SigningKey` | Oui. 32 octets au moins, secrète : `openssl rand -base64 48` | **Refus de démarrer**, y compris avec la clé de développement du dépôt. La changer invalide les jetons d'accès en cours (15 minutes) ; les sessions se renouvellent seules, les jetons de rafraîchissement étant en base (ADR 0009) |
| `Auth__Apple__Audiences__0` | L'identifiant de l'application iOS (`com.victorsauter.uzu`, ADR 0041, d'après `mobile/app.config.ts`) | Avec `Auth__Google__Audiences__*` vide aussi : **refus de démarrer** en Production. Seul Apple manquant : la connexion Apple est refusée |
| `Auth__Google__Audiences__0`, `__1`… | Identifiants client OAuth Google utilisés par l'application (web, et iOS : voir `mobile/.env.example`) | Voir ci-dessus ; seul Google manquant : la connexion Google est refusée |
| `Notifications__Provider` | `Expo` | `Log` (valeur par défaut) en Production : **refus de démarrer** |
| `Notifications__Expo__AccessToken` | Seulement si la « sécurité renforcée » est activée dans le projet Expo | Sinon facultatif ; si elle est activée et le jeton absent, l'envoi est refusé par Expo (visible dans les journaux) |
| `AllowedHosts` | Le nom public, par exemple `api.example.com` (plusieurs : séparés par `;`) | Reste `*` : accepte n'importe quel en-tête `Host`. Un nom faux : toute requête reçoit 400 |
| `Proxy__Enabled` | `true` derrière un proxy | `false` : `X-Forwarded-*` ignorés, l'API voit l'adresse du proxy, la limitation par IP s'applique à tous ensemble (429 en cascade) |
| `Proxy__KnownProxies__0` ou `Proxy__KnownNetworks__0` | Adresse ou réseau CIDR du proxy, tel que vu par l'API | Vide : seule la boucle locale est crue, donc rien derrière un proxy distant. Valeur invalide : refus de démarrer |
| `Proxy__ForwardLimit` | `1` (défaut) ; plus seulement avec une chaîne de proxys de confiance | |
| `RateLimiting__Enabled`, `RateLimiting__Auth__*`, `RateLimiting__Writes__*`, `RateLimiting__SensitiveWrites__*` | Garder les défauts (60 par minute, 60 par minute, 30 par 10 minutes) | `Enabled=false` coupe toute limite : à éviter en ligne. Plusieurs personnes sur une même adresse (réseau mobile d'opérateur) partagent la limite de `/auth` |
| `Admin__Emails__0`, `__1`… | E-mails (vérifiés par Apple ou Google) des administrateurs | Vide : personne n'est administrateur, aucune organisation ne peut être validée, aucun signalement n'est lisible |
| `Admin__ReportEmail` | Facultatif | Sans effet pour l'instant : aucun envoi d'e-mails (les signalements sont lus par `GET /admin/reports`) |
| `Storage__Local__Path` | Garder `/data/photos` et y monter le volume | Un autre chemin non monté : les photos disparaissent à chaque recréation du conteneur |
| `BackgroundJobs__Enabled`, `BackgroundJobs__Interval` | Garder `true` et `00:01:00` | `false` : plus de rappels de balade ni de séries hebdomadaires |
| `Auth__AllowDevLogin`, `DemoData__Enabled` | Ne pas les poser (ou `false`) | Vrai hors Development et Testing : **refus de démarrer** |
| `ASPNETCORE_ENVIRONMENT` | Garder `Production`. Tout nom autre que `Development` ou `Testing` vaut Production | `Development` ou `Testing` ouvriraient la connexion de test : ne jamais les poser |
| `ASPNETCORE_URLS` | Ne pas le poser avec l'image | Il l'emporte sur le port de l'image ; le contrôle de santé de l'image ne le suivrait plus |
| `ASPNETCORE_FORWARDEDHEADERS_ENABLED` | Ne jamais le poser | Fait confiance à n'importe quel émetteur de `X-Forwarded-For` |

Le fuseau `Europe/Paris` est fourni par l'image ; sur un autre support (sans image), installer `tzdata` ou l'API refuse de démarrer.

Quand l'API refuse de démarrer, le conteneur s'arrête (code 134) en journalisant la liste complète des erreurs : `docker logs <conteneur>`.

## 3. Mise en ligne et mises à jour

Les commandes ci-dessous supposent l'exemple Docker Compose ([`api/deploy/docker-compose.production.example.yml`](../api/deploy/docker-compose.production.example.yml)), à copier et adapter ; sur une plateforme gérée, les mêmes étapes se font avec ses outils (voir la section 7). `dc` désigne `docker compose -f docker-compose.production.example.yml`.

### 3.1 Première mise en ligne

1. **Serveur.** Docker et Compose installés, ports 80 et 443 ouverts, un enregistrement DNS du nom public vers le serveur, pare-feu qui ne laisse rien d'autre (surtout pas 5432).
2. **Configuration.** Dans `api/deploy/`, créer `.env` à partir de `api/.env.example` plus `POSTGRES_PASSWORD` (`openssl rand -hex 24`), `API_DOMAIN` et `DOGO_VERSION` ; droits `chmod 600 .env`. Aucune variable de développement.
3. **Image.** `DOGO_VERSION=$(git rev-parse --short HEAD)` (à reporter dans `.env`), puis `dc build api`. L'image est construite sur le serveur, sans registre.
4. **Base.** `dc up -d db`, attendre l'état `healthy` (`dc ps`).
5. **Migrations.** `dc run --rm migrate`. Sur une base vide, la première migration exécute `CREATE EXTENSION IF NOT EXISTS postgis` : l'image PostGIS le permet ; sur une base gérée, activer PostGIS d'abord avec le compte administrateur du fournisseur, la commande devient sans effet.
6. **Démarrage.** `dc up -d api caddy`. Le premier certificat TLS prend quelques secondes.
7. **Vérifications** (3.3).

### 3.2 Mise à jour

Ordre à respecter :

1. **Sauvegarde** (section 4) : au minimum le `pg_dump` de la base, noter l'étiquette actuelle (`DOGO_VERSION`).
2. **Récupérer le code** (`git pull`) et fixer la nouvelle étiquette : `DOGO_VERSION=$(git rev-parse --short HEAD)`, à reporter dans `.env`.
3. **Construire l'image** : `dc build api`. L'ancienne image reste sur la machine, c'est le retour arrière.
4. **Arrêter l'API** : `dc stop api` (interruption de service pendant les deux étapes suivantes, quelques secondes).
5. **Appliquer les migrations** : `dc run --rm migrate`. Le bundle ne fait rien s'il n'y a rien à appliquer (« No migrations were applied »). Il pose un verrou de base : deux exécutions simultanées ne se gênent pas.
6. **Démarrer** : `dc up -d api`. Les anciennes images se nettoient plus tard (`docker image prune`).
7. **Vérifications** (3.3).

À chaque montée de version du SDK ou du runtime .NET, relire les notes de version et reconstruire l'image sans cache (`dc build --no-cache --pull api`) : l'étiquette de base (`10.0-noble`) reçoit les correctifs de sécurité à chaque reconstruction.

### 3.3 Vérifications après déploiement

Remplacer `$API` par l'adresse publique (`https://api.example.com`).

```bash
API=https://api.example.com

# 1. L'API répond et la base est jointe (attendu : 200 {"status":"Healthy"})
curl -sS -i $API/api/v1/health

# 2. La connexion de test n'existe pas (attendu : 404)
curl -sS -o /dev/null -w '%{http_code}\n' -X POST $API/api/v1/auth/dev \
  -H 'Content-Type: application/json' -d '{"subject":"x","displayName":"x"}'

# 3. Une route protégée exige un jeton (attendu : 401)
curl -sS -o /dev/null -w '%{http_code}\n' $API/api/v1/me

# 4. En-têtes de sécurité (attendu : strict-transport-security et x-content-type-options)
curl -sS -I $API/api/v1/health | grep -i -E 'strict-transport|x-content-type'

# 5. Un en-tête Host étranger est refusé (attendu : 400)
curl -sS -o /dev/null -w '%{http_code}\n' --resolve autre.example.com:443:$(dig +short api.example.com | head -1) \
  https://autre.example.com/api/v1/health

# 6. HTTP redirige vers HTTPS (attendu : 308 ou 301)
curl -sS -o /dev/null -w '%{http_code}\n' http://api.example.com/api/v1/health

# 7. Une photo inconnue : 404, avec les en-têtes de la route des photos
curl -sS -i $API/photos/00000000000000000000000000000000.jpg | head -5

# 8. Le certificat est valide et n'expire pas bientôt (attendu : une date dans 60 à 90 jours)
echo | openssl s_client -connect api.example.com:443 -servername api.example.com 2>/dev/null | openssl x509 -noout -enddate
```

Puis, sur le serveur : `dc ps` (api `healthy`), `dc logs --tail 50 api` (pas d'erreur), et, depuis l'application installée, une connexion Apple ou Google réelle, la création d'un chien avec photo, puis un redémarrage (`dc restart api`) : la photo doit toujours s'afficher.

### 3.4 Retour arrière

- **Code seul** (pas de migration dans la mise à jour, ou migration compatible avec l'ancien code) : remettre l'ancienne étiquette (`DOGO_VERSION=<précédente>` dans `.env`) puis `dc up -d api`. L'image précédente est encore sur la machine ; sinon, `git checkout <commit>` et `dc build api`.
- **Avec migration** : une migration ne se défait pas toute seule sans risque. Deux voies :
  1. *Restaurer la sauvegarde d'avant mise à jour* (section 4) : sûr, perd les données écrites depuis. C'est la voie par défaut pour un pilote.
  2. *Descendre le schéma* : `dc run --rm migrate <NomDeLaDerniereBonneMigration>` (le service a déjà `./efbundle` pour point d'entrée) exécute les méthodes `Down` des migrations suivantes, avec leurs pertes de données possibles (colonne supprimée). À réserver à une migration relue.
- Avant toute mise à jour, relire les migrations ajoutées (`api/src/Dogo.Api/Infrastructure/Persistence/Migrations/`) : une colonne supprimée ou renommée n'est pas récupérable sans sauvegarde. Une migration qui ne fait qu'ajouter est compatible avec l'ancien code.

## 4. Sauvegardes

Deux choses à sauvegarder : la **base** et le **volume des photos**. Le reste (image, configuration) se refait depuis le dépôt et le gestionnaire de secrets : garder une copie de `.env` hors du serveur.

| Quoi | Fréquence | Conservation | Commande |
| --- | --- | --- | --- |
| Base | Chaque nuit, plus avant chaque mise à jour | 7 quotidiennes, 4 hebdomadaires | `dc exec -T db pg_dump -U dogo -Fc dogo > dogo-$(date +%F-%H%M).dump` |
| Photos | Chaque nuit | Idem | `docker run --rm -v dogo-production_photos:/photos:ro -v "$PWD":/backup alpine tar czf /backup/photos-$(date +%F).tgz -C /photos .` |

- **Ordre.** Sauvegarder la base **d'abord**, les photos ensuite : le fichier d'une photo référencée par la base existe alors toujours dans la copie des photos. L'inverse laisserait des liens vers des photos absentes. Des photos orphelines en trop sont sans conséquence.
- **Hors du serveur.** Copier chaque sauvegarde ailleurs que sur la machine (autre hébergeur ou stockage d'objets, par exemple avec `rclone` ou `restic`) ; une sauvegarde sur le disque qui tombe en panne ne sert à rien. Chiffrer la copie : elle contient des données personnelles.
- **Instantanés de l'hébergeur** (disque entier) : un complément, pas la sauvegarde principale ; une copie du disque d'une base en marche peut être incohérente.
- **Planifier** avec `cron` sur le serveur (un script qui enchaîne dump, photos, copie, suppression des anciennes) et faire échouer bruyamment : un code de sortie non nul envoyé à une alerte (voir la section 5).

**Test de restauration** (avant d'ouvrir aux testeurs, puis une fois par mois) : sur une base de test, jamais sur la production.

```bash
dc exec db createdb -U dogo dogo_restauration
dc exec -T db pg_restore -U dogo -d dogo_restauration --no-owner < dogo-AAAA-MM-JJ-HHMM.dump
dc exec db psql -U dogo -d dogo_restauration -c 'select count(*) from users' -c 'select count(*) from walks'
dc exec db dropdb -U dogo dogo_restauration
# Photos : extraire l'archive dans un dossier vide et ouvrir une photo
mkdir /tmp/photos-test && tar xzf photos-AAAA-MM-JJ.tgz -C /tmp/photos-test && ls /tmp/photos-test | head
```

Les nombres doivent correspondre à ceux de la production, et `select postgis_version()` répondre. Noter la durée : c'est le temps de reprise réel.

## 5. Surveillance minimale

- **Santé.** `GET /api/v1/health` (200 si la base répond, 503 sinon). Brancher un service de sondes gratuit (UptimeRobot, Better Stack, Healthchecks.io…) sur cette URL avec une alerte par e-mail ; non vérifié ici : choisir sur leurs sites officiels. L'image porte son propre contrôle (`docker ps` indique `healthy`).
- **Journaux.** Sur la sortie standard, au format console de .NET : `dc logs -f api`. Les niveaux utiles : `warn` et `fail`. Avec Compose, limiter leur taille (`logging: driver: local` ou `max-size`) pour ne pas remplir le disque. Les journaux ne contiennent ni jetons d'appareil ni texte des messages (sauf niveau Debug). Un message `Cannot load library libgssapi_krb5.so.2` au démarrage est sans conséquence (le pilote PostgreSQL cherche Kerberos, inutilisé).
- **Disque.** Surveiller l'espace (`df -h`, `docker system df`) : photos, sauvegardes locales et journaux le remplissent. Alerte à 80 %.
- **Signalements** (spécification §4.7) : aucun e-mail n'est envoyé ; chaque signalement n'écrit dans le journal que son identifiant et son type. Les lire par l'API, avec un jeton d'administrateur : `GET /api/v1/admin/reports` (statut `Open` par défaut), et les clore par `PATCH /api/v1/admin/reports/{id}`. Pas d'écran d'administration : à faire au moins chaque jour pendant le pilote.
- **Jeton d'administrateur.** Les routes `/admin` demandent un jeton d'accès de ton compte (listé dans `Admin__Emails`). L'application ne l'affiche pas. En dernier recours, le signer toi-même avec la clé de signature, pour 15 minutes, en lisant la clé dans l'environnement (jamais en argument de commande) :

  ```bash
  export DOGO_KEY='…'   # la valeur de Auth__Jwt__SigningKey ; ne pas la laisser dans l'historique du shell
  python3 -I - <<'EOF'
  import base64, hashlib, hmac, json, os, time
  b = lambda d: base64.urlsafe_b64encode(d).rstrip(b"=").decode()
  now = int(time.time())
  head = b(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
  body = b(json.dumps({"sub": "<identifiant-utilisateur>", "iss": "dogo-api", "aud": "dogo-app",
                       "iat": now, "nbf": now, "exp": now + 900}, separators=(",", ":")).encode())
  sig = b(hmac.new(os.environ["DOGO_KEY"].encode(), f"{head}.{body}".encode(), hashlib.sha256).digest())
  print(f"{head}.{body}.{sig}")
  EOF
  ```

  L'identifiant utilisateur se lit en base (`select id from users where email = '…'`). Un meilleur outil d'administration est à prévoir si le pilote grandit.
- **Notifications.** Si aucune notification n'arrive, chercher dans les journaux les erreurs d'envoi à Expo ; elles sont journalisées sans casser les requêtes (ADR 0019). Les notifications en file au moment d'un redémarrage sont perdues.

## 6. Liste de contrôle avant d'ouvrir aux testeurs (côté API)

- [ ] L'API tourne en `Production` ; `/api/v1/auth/dev` répond 404 ; `DemoData__Enabled` et `Auth__AllowDevLogin` ne sont pas posés.
- [ ] La clé de signature a été générée pour ce déploiement, n'est dans aucun fichier du dépôt, et une copie est dans le gestionnaire de mots de passe.
- [ ] `AllowedHosts` vaut le nom public ; un autre `Host` reçoit 400.
- [ ] TLS valide (note A attendue sur un test comme SSL Labs, non vérifié ici), HTTP redirige vers HTTPS, HSTS présent.
- [ ] `Proxy__Enabled=true` avec la bonne adresse de proxy : vérifier dans les journaux ou par un test que deux clients différents n'ont pas la même adresse vue par l'API (sinon la limite de débit les confond).
- [ ] `Notifications__Provider=Expo` ; une notification réelle reçue sur un appareil physique (rejoindre une balade avec deux comptes).
- [ ] Connexion Apple et Google réelles essayées depuis l'application de test, avec les bonnes audiences.
- [ ] `Admin__Emails` contient ton adresse ; une organisation de test a été validée par `POST /api/v1/admin/organizations/{id}/approve`, un signalement de test lu par `GET /api/v1/admin/reports`.
- [ ] Une photo téléversée survit à `restart` et à la recréation du conteneur ; elle ne contient plus de position GPS (ADR 0032).
- [ ] Les sauvegardes de la base et des photos tournent, sont copiées hors du serveur, et une restauration a été **essayée**.
- [ ] Une sonde externe surveille `/api/v1/health` et envoie une alerte qui t'arrive.
- [ ] Le pare-feu n'expose que 80, 443 (et SSH, par clé seulement) ; la base n'est pas joignable depuis Internet.
- [ ] Le disque a de la marge (photos : quelques centaines de Ko chacune, 2 048 px au plus).
- [ ] Un plan de reprise écrit : qui fait quoi si l'API tombe un soir de week-end, et la durée de restauration mesurée.
- [ ] Hors API, mais bloquant pour des testeurs : l'adresse de l'API dans l'application mobile, les textes légaux définitifs (le plan les donne provisoires) et la déclaration des données personnelles (RGPD, hébergeur et sous-traitants à confirmer).

## 7. Choisir un hébergeur

Contraintes du pilote : une petite instance (512 Mo à 2 Go de mémoire), PostgreSQL avec **PostGIS**, un **volume persistant** pour les photos et **une seule instance** (section 1), données **dans l'Union européenne**, coût d'un pilote. Prix relevés sur les sites officiels les 18 et 19/11/2026, **hors taxes** sauf mention, à confirmer avant de s'engager. « Non vérifié » signale ce que je n'ai pas pu lire.

| Option | Nature | PostGIS | Volume persistant | Région dans l'UE | Ordre de grandeur mensuel pour le pilote |
| --- | --- | --- | --- | --- | --- |
| **A. Hetzner Cloud + Docker Compose** | Serveur privé virtuel, tout à gérer soi-même | Image `postgis/postgis` dans Compose (x86 seulement ; la gamme ARM ne convient pas) | Disque du serveur ; sauvegardes quotidiennes du serveur proposées (7 emplacements, le volume attaché n'en fait pas partie) | Allemagne (Falkenstein, Nuremberg) et Finlande (Helsinki) | CPX12 (2 Go) : 9,99 € (Helsinki) ou 11,99 € (Allemagne) ; sauvegardes à partir de 1,10 € ; soit environ 12 à 15 € |
| **B. Railway** | Plateforme gérée tout-en-un (API, volume, base) | Modèle PostGIS à part dans leur catalogue (le modèle PostgreSQL par défaut n'en a pas) | Un volume par service, 5 Go au plus au plan Hobby ; redéploiement avec courte interruption ; pas de réplicas avec un volume | Une seule région européenne : Amsterdam (EU West Metal) | Hobby 5 $ par mois, ressources incluses jusqu'à 5 $ ; RAM 10 $/Go/mois, CPU 20 $/vCPU/mois, volume 0,15 $/Go/mois : environ 10 à 15 $ (calcul à partir du barème, non mesuré) |
| **C. Render** | Plateforme gérée + base gérée | Oui, par `CREATE EXTENSION postgis` (non vérifié : les droits nécessaires ne sont pas documentés) | Disque sur service payant, une instance, pas de déploiement sans interruption, sauvegarde automatique toutes les 24 h gardée 7 jours | Francfort (seule région européenne) | Non vérifié : la page des tarifs n'a pas pu être lue |
| **D. Fly.io** | Plateforme de conteneurs ; base gérée en option | Oui sur leur base gérée, à choisir à la création | Volume attaché à une machine, 0,15 $/Go/mois ; sauvegarde quotidienne de 5 jours par défaut, déconseillée comme sauvegarde principale | API à Paris (`cdg`) ; base gérée seulement à Amsterdam, Francfort ou Londres | Machine 512 Mo : 4,39 $ ; base gérée « Basic » : 38 $ ; soit environ 45 $ avec la base gérée |
| **E. Base gérée séparée : Scaleway** | Base PostgreSQL gérée + petite machine pour l'API | Oui (activée par `CREATE EXTENSION postgis`) | Sur la machine de l'API, comme l'option A | France (Paris) ; autres régions européennes (non vérifié ici) | Nœud de base « DB-DEV-S » à 0,0156 €/h, soit environ 11,4 €/mois, plus le stockage, plus une machine (non vérifié : les pages de tarifs n'ont pas pu être lues, ce chiffre vient d'un extrait de résultat de recherche) |
| **F. Microsoft Azure** (Container Apps + PostgreSQL flexible) | Services gérés d'un grand fournisseur | Oui (PostGIS 3.6.4 sur PostgreSQL 14 à 18, après l'avoir ajouté à la liste `azure.extensions`) | Partage Azure Files monté dans le conteneur (le stockage prend en charge plusieurs conteneurs ; on garde un réplica) | Plusieurs régions européennes (non listées ici) | Non vérifié ; ensemble de services le plus lourd à configurer pour un pilote |
| **Écartée : Scalingo** | Plateforme française gérée | Oui | **Non** : le disque du conteneur est temporaire et perdu à chaque redémarrage ; ils recommandent un stockage d'objets | — | Inutilisable tel quel : l'ADR 0010 demande un disque persistant |

Sources : [Hetzner Cloud, plans Regular Performance](https://www.hetzner.com/cloud/regular-performance/) (tarifs, emplacements, sauvegardes), [Hetzner, sauvegardes et instantanés](https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/) ; [Railway, tarifs](https://docs.railway.com/pricing/plans), [volumes](https://docs.railway.com/volumes/reference), [régions](https://docs.railway.com/deployments/regions), [PostgreSQL](https://docs.railway.com/databases/postgresql) ; [Render, extensions PostgreSQL](https://render.com/docs/postgresql-extensions), [disques](https://render.com/docs/disks), [régions](https://render.com/docs/regions) ; [Fly.io, tarifs](https://fly.io/pricing), [volumes](https://docs.fly.io/volumes/overview), [Managed Postgres](https://docs.fly.io/mpg), [régions](https://docs.fly.io/reference/regions) ; Scaleway : [tutoriel PostGIS](https://www.scaleway.com/en/docs/tutorials/postgis-managed-databases) et [tarifs des bases gérées](https://www.scaleway.com/en/pricing/managed-databases-pricing/) (ces pages refusent la lecture automatique : seuls des extraits de recherche ont été vus) ; [Azure, PostGIS sur PostgreSQL flexible](https://learn.microsoft.com/azure/postgresql/extensions/concepts-extensions-versions) et [liste d'autorisation](https://learn.microsoft.com/azure/postgresql/extensions/how-to-allow-extensions), [Azure Container Apps, volumes](https://learn.microsoft.com/azure/container-apps/storage-mounts) ; [Scalingo, système de fichiers](https://doc.scalingo.com/platform/app/filesystem) et [PostgreSQL](https://doc.scalingo.com/databases/postgresql/overview).

**Ce que je n'ai pas pu vérifier :** les prix de Render et d'Azure ; les prix et les droits de création d'extension de Scaleway (pages inaccessibles à l'outil) ; les conditions de traitement des données personnelles (contrat de sous-traitance, RGPD) de chaque fournisseur ; la disponibilité réelle d'un modèle PostGIS sur Railway au moment de l'essai ; la valeur exacte du coût d'un pilote, qui dépend du trafic sortant et du stockage ; le comportement de l'image sur la gamme ARM (PostGIS n'y est pas publié par l'image officielle, voir `api/README.md`). Ne pas non plus prendre ces prix comme un devis : les relire le jour de la commande.

**Remarques sur l'image.** L'image de l'API tourne avec l'utilisateur `app` (uid 1654) ; les plateformes qui montent leurs volumes en `root` (Railway le documente : variable `RAILWAY_RUN_UID=0` pour une image non-root) demandent un réglage de plus, ou de relâcher cet utilisateur. L'image se construit pour la machine qui la construit (amd64 ou arm64) : construire sur la machine cible, ou avec `docker buildx build --platform linux/amd64`.

### Recommandation

**Option A : un serveur Hetzner Cloud avec Docker Compose** (un CPX12 de 2 Go dans un centre allemand ou finlandais), en ajoutant les sauvegardes du serveur et une copie quotidienne de `pg_dump` et des photos vers un stockage hors du serveur.

- *Coût le plus bas et lisible* pour quelques dizaines d'utilisateurs : une ligne de facture, environ 12 à 15 € par mois, sans consommation à surveiller.
- *Correspond exactement aux contraintes décidées* : une instance, un disque persistant (l'ADR 0010 n'a rien à changer), PostGIS avec l'image officielle déjà utilisée en développement, données en Allemagne ou en Finlande.
- *Le fichier d'exemple est prêt* : l'image, le bundle de migrations et le proxy TLS fonctionnent ensemble ; la procédure de la section 3 est celle qui a été essayée.
- *Le prix à payer* : le système, les mises à jour de sécurité du serveur, le pare-feu, les sauvegardes et les alertes sont à la charge du porteur. Activer les mises à jour de sécurité automatiques d'Ubuntu (`unattended-upgrades`), n'autoriser SSH que par clé, et tenir la liste de contrôle de la section 6.

Si le porteur préfère ne rien administrer, **l'option B (Railway)** est la plus rapide à mettre en place (un service, un volume, un modèle PostGIS) pour un coût comparable, avec deux réserves : une seule région européenne (Amsterdam) et le réglage des droits du volume. L'option C (Render) est équivalente avec une base gérée plus classique (Francfort), à condition d'en vérifier les prix. L'option E (Scaleway) s'impose si la **France** est une exigence de localisation des données. La décision revient au porteur ; elle ne devient un ADR qu'une fois prise.
