# ADR 0043 — Démo hébergée gratuitement : environnement `Demo`, photos en stockage S3, Render et Supabase

- **Statut :** Proposé
- **Date :** 20/11/2026
- **Précise :** [ADR 0010](0010-stockage-des-photos.md) (une seconde implémentation de `IPhotoStorage`), [ADR 0027](0027-donnees-de-demonstration.md) et [ADR 0031](0031-durcissement-de-l-api.md) (un troisième environnement admis pour les outils de développement), [ADR 0038](0038-image-et-migrations-en-production.md) (migrations au démarrage dans cet environnement seulement).

## Contexte

Le porteur du projet veut montrer Uzu à son entourage depuis son iPhone, avec les données de démonstration, sans que son Mac tourne : l'API doit donc être en ligne, gratuitement, avec une base PostGIS et des photos qui survivent aux redémarrages. L'hébergeur de production n'est pas choisi ([guide de déploiement](../deploiement.md)) et rien ne doit être décidé pour la production ici.

Contraintes :

- Le disque de l'hébergeur gratuit visé (Render, plan gratuit) est éphémère : perdu à chaque déploiement, redémarrage ou mise en veille. Les photos sur disque (ADR 0010) y disparaîtraient.
- Il n'y a pas d'étape avant le déploiement : le bundle de migrations de l'ADR 0038 ne peut pas être lancé entre l'arrêt de l'ancienne version et le démarrage de la nouvelle.
- La connexion de test et les données de démonstration sont refusées hors `Development` et `Testing` (ADR 0031), ce qui est voulu : elles ne doivent jamais s'ouvrir par erreur sur un serveur réel. Or la démo les exige.
- La base doit avoir PostGIS (ADR 0005) ; les photos doivent avoir un stockage durable.

## Décision

**Un environnement `Demo`.** Il s'ajoute à `Development` et `Testing` dans la liste blanche des outils de développement (`DogoEnvironments.DevToolEnvironments`). Cela ouvre, quand leurs options sont vraies, la connexion de test (`/auth/dev`), les données de démonstration (`/dev/demo-data`) et l'administration par un compte de test. Tout le reste du durcissement s'applique comme en production : la clé de signature de développement versionnée reste refusée (une vraie clé est obligatoire), la chaîne de connexion et le fuseau `Europe/Paris` sont exigés, HSTS est actif (mais n'est envoyé que si l'API sait la requête en HTTPS, ce qui demande `Proxy__*` derrière Render : non posé pour la démo, voir le guide), `AllowedHosts` et la limitation de débit jouent. Les contrôles réservés à `Production` (fournisseur de notifications, audiences Apple et Google) ne s'y appliquent pas : les notifications restent dans les journaux. Les migrations s'appliquent au démarrage dans cet environnement, comme en `Development`, sauf pendant la génération d'`openapi.json` ; ailleurs, l'ADR 0038 reste la règle. Les contrôles de démarrage sont lus avant les migrations pour qu'une chaîne de connexion vide soit nommée.

**Un stockage S3 des photos.** `S3PhotoStorage` (AWSSDK.S3) implémente `IPhotoStorage` à côté de `LocalPhotoStorage`. `Storage:Provider` choisit (`Local` par défaut, ou `S3`) ; `Storage:S3:{ServiceUrl, Bucket, Region, AccessKeyId, SecretAccessKey}` sont validés au démarrage (démarrage refusé avec `Provider=S3` si l'une manque). Adressage par chemin, région de signature réglable, sommes de contrôle du kit seulement quand le protocole les exige (`WHEN_REQUIRED`). Les noms de fichier et leur validation sont partagés avec le stockage local (`PhotoFileNames`). Le service des photos (`/photos/{fichier}`) et `photoUrl` ne changent pas : l'API relaie les octets, le bucket reste privé, le client ne voit aucune différence.

**Hébergement.** API : service web gratuit de Render (Docker, `api/Dockerfile`, région de Francfort, une seule instance). Base : PostgreSQL de Supabase avec PostGIS, par le pooler de session (la connexion directe n'est qu'en IPv6 sur le plan gratuit). Photos : Supabase Storage par son API S3. Un appel périodique de `GET /api/v1/health` (cron-job.org, toutes les 10 minutes) évite la mise en veille de l'API après 15 minutes sans trafic et maintient une activité sur la base. Mise en place pas à pas : [guide](../demo-hebergee.md).

**Application mobile.** Une build Release locale, installée par Xcode sur l'iPhone du porteur avec un Apple ID gratuit (équipe personnelle), sans EAS ni compte Apple Developer. Deux variables, lues à la construction :

- `EXPO_PUBLIC_DEMO_MODE=true` affiche la connexion de test et les données de démonstration hors build de développement (`config.devLogin = demo || (__DEV__ && EXPO_PUBLIC_DEV_LOGIN)`, règle désormais tenue en un seul endroit, `src/lib/config.ts`). L'adresse de l'API reste obligatoirement en `https`. Les profils EAS `preview` et `production` refusent cette variable (`assertDistributionConfig`) : une build de démo ne part jamais vers un store.
- `UZU_FREE_SIGNING=true` retire ce qu'une équipe personnelle ne peut pas signer : le droit « Sign in with Apple » (`usesAppleSignIn`, plugin `expo-apple-authentication`) et les notifications push (plugin `expo-notifications`). `extra.freeSigning` masque le bouton Apple, dont le module natif reste lié. `UZU_IOS_BUNDLE_IDENTIFIER` remplace au besoin l'identifiant de bundle.

Une telle build expire au bout de 7 jours : la réinstaller depuis le Mac. Marche à suivre : `mobile/README.md`, « Build de démo sur un iPhone avec un Apple ID gratuit ».

## Conséquences

- **L'API de démonstration est ouverte à quiconque connaît son adresse** : n'importe qui peut se connecter sous n'importe quel nom, générer ou supprimer les données de démonstration et remplir la base. Elle ne contient que des données fictives et jetables, et ne sert jamais à de vraies personnes. `Admin:Emails` doit rester vide en démo : sinon n'importe qui, par la connexion de test, aurait cet e-mail et serait administrateur.
- **Réveil et redémarrages** : sans appel, l'API s'endort après 15 minutes et met environ une minute à se réveiller ; Render peut aussi la redémarrer à tout moment. Les photos sont en lieu sûr dans le bucket, la file de notifications en mémoire est perdue (déjà vrai ailleurs, ADR 0019).
- **Pause de la base** : un projet Supabase gratuit sans activité pendant une semaine est mis en pause. L'appel périodique de santé interroge la base, ce qui devrait suffire (non vérifié). Une base en pause fait répondre 503 à `/health` ; Render redémarre alors l'API après une minute d'échecs.
- **Quotas gratuits** : 750 heures par mois pour les services gratuits de Render (un service allumé en permanence en consomme environ 744), 500 Mo de base et 1 Go de stockage chez Supabase ; Render peut suspendre un service dont le trafic sortant est inhabituellement élevé, objets compris.
- **Limite de débit** : derrière le proxy de Render, l'API ne sait pas lire l'adresse des clients tant que `Proxy:*` n'est pas configuré (réseau du proxy non vérifié) ; toutes les requêtes partagent alors une même clé de limitation. Acceptable pour quelques personnes ; le guide donne la marche à suivre.
- **Un seul code, deux modes de stockage** : les tests du stockage S3 tournent contre un MinIO dans un conteneur (image `chainguard/minio`, la seule trouvée à jour sur les registres publics), avec le conteneur générique de Testcontainers (le module `Testcontainers.Minio` ne suit pas la version 4.17 du noyau). Seul MinIO a été essayé : les particularités de Supabase Storage ne sont pas vérifiées avant la mise en ligne.
- Le plan gratuit de Render et celui de Supabase peuvent changer : le guide indique les pages officielles à relire.
- Un futur hébergeur de production gardera `Production` (clé, notifications et audiences exigées, outils de développement fermés) ; le stockage S3 pourra y servir aussi, ce qui lèverait la contrainte d'une seule instance liée au disque (ADR 0010).

## Alternatives écartées

- **Tunnel depuis le Mac** (l'API locale exposée sur Internet). Gratuit et sans code, mais le Mac doit rester allumé et connecté : c'est exactement ce que la démo veut éviter.
- **Ouvrir `Staging` ou `Production` aux outils de développement par une option.** Casserait la liste blanche de l'ADR 0031, dont la valeur est qu'aucune option ne peut les ouvrir par erreur sur un vrai serveur ; un environnement nommé `Demo` dit explicitement ce qu'est le serveur.
- **Garder les photos sur le disque de Render.** Perdues à chaque redémarrage : la démo montrerait des images cassées.
- **Photos en base de données.** Écarté par l'ADR 0010 (sauvegardes, requêtes) ; la base gratuite est de 500 Mo seulement.
- **Base PostgreSQL de Render.** Non retenue : Supabase apporte la base et le stockage d'objets dans un seul compte gratuit.
- **Connexion directe à la base Supabase.** Réservée à IPv6 sur le plan gratuit (documentation Supabase) ; le pooler de session, en IPv4, convient à une API qui garde ses connexions ouvertes.
- **Bucket public et `photoUrl` absolu vers Supabase.** Changerait le contrat (`photoUrl` relatif, ADR 0010), le calcul de l'URL côté mobile et l'accès aux photos ; l'API qui relaie les octets ne change rien pour le client.
- **Application du bundle de migrations par une machine tierce** avant chaque déploiement. Une étape manuelle de plus pour une base jetable ; les migrations au démarrage suffisent ici.
