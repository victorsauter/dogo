# ADR 0027 — Données de démonstration : fonctionnalité de développement, générée par l'API, photos téléchargées à la génération

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** accepté par l'orchestrateur, sur délégation, pour lancer le développement ; à confirmer.
- **Précisé par :** [ADR 0031](0031-durcissement-de-l-api.md) (environnements autorisés).
- **Précisé par :** [ADR 0043](0043-demo-hebergee.md) (environnement `Demo` pour la démo hébergée).

## Contexte

Une base vide ne montre presque rien de l'application : ni carte remplie, ni balade complète, ni fil de discussion, ni organisation avec des membres, ni avertissement de blocage. Le responsable du produit veut pouvoir essayer l'application dans le simulateur avec une communauté réaliste autour de Seppois-le-Haut (Haut-Rhin), se connecter comme n'importe lequel de ses membres, et effacer le tout sans toucher à son propre compte de test (`dev-user-1`, avec son chien UZU). Il demande aussi des photos pour une partie des profils.

Contraintes : rien de cela ne doit exister en production ; les balades passées et les messages antidatés ne peuvent pas être créés par les points d'entrée publics ; le dépôt est public, aucune image ne doit y être versionnée ; les sources d'images doivent être utilisables sans compte ni clé, avec une licence qui le permet, et les requêtes ne doivent transporter aucune donnée d'utilisateur.

## Décision

- **Fonctionnalité de l'API, de développement seulement.** Un dossier `Features/DemoData` expose `POST`, `GET` et `DELETE /api/v1/dev/demo-data`, anonymes comme `/auth/dev`. Ils n'existent (404) que si `DemoData:Enabled` vaut vrai : vrai dans `appsettings.Development.json`, faux par défaut. L'API refuse de démarrer si cette option est vraie en Production, ou si la connexion de test est coupée (les comptes de démonstration se connectent par elle). Les routes figurent dans `openapi.json`, comme la connexion de test, pour que le mobile en ait les types.
- **Des comptes ordinaires, reconnus à leur identifiant.** Un compte de démonstration est un compte `Dev` dont le `providerSubject` commence par `demo-`. Aucune colonne ni migration. Générer supprime d'abord les données de démonstration puis recrée le jeu, en une transaction protégée par un verrou consultatif PostgreSQL. Supprimer ne touche que ces comptes et ce qui leur appartient ; ce qu'un autre compte a écrit reste (une balade de démonstration où il s'est inscrit ou a écrit est conservée comme celle d'un compte supprimé, ADR 0023). Les fichiers de photos des comptes supprimés sont effacés après la validation.
- **Écriture directe et déterministe.** Le générateur écrit par le `DbContext`, à partir de tables séparées de la logique (personnes, races, lieux, organisations, balades, fils). Graines aléatoires fixes : mêmes noms et même structure à chaque fois, dates relatives au moment de la génération. Un test vérifie sur le résultat toutes les règles de la spécification (gabarits, capacité, une inscription active par chien, balades professionnelles réservées aux membres, rôles, blocages, auteurs des messages, séries).
- **Photos téléchargées au moment de la génération**, facultatives (`{ "photos": false }`), jamais bloquantes : une erreur, un délai dépassé ou une image refusée saute la photo et la compte. Chaque image passe par les contrôles d'une photo envoyée (taille, format réel) puis par `IPhotoStorage`.
  - Personnes : avatars dessinés de DiceBear, style « Notionists », sous CC0 1.0, par son API HTTP gratuite et sans clé (usage non commercial et raisonnable), avec le `subject` fictif comme graine. Aucune photo de personne réelle.
  - Chiens : photo principale de l'article Wikipédia anglais de la race, retenue seulement si le fichier est sur Wikimedia Commons sous licence libre, vérifiée par l'API de Commons (CC0, domaine public, CC BY, CC BY-SA, « copyrighted free use »). Un chien par race, pour qu'aucune photo ne soit partagée.
  - Requêtes nues : agent utilisateur générique, ni cookie ni donnée d'utilisateur. Quatre téléchargements en parallèle, avatars espacés pour respecter la limite de DiceBear, 10 s par image, 60 s au total, une seule reprise après une réponse 429.
- **Côté mobile**, une carte « Données de démonstration » et une liste « Se connecter comme… » sous la connexion de test, affichées seulement si `EXPO_PUBLIC_DEV_LOGIN` vaut `true`, dans un module à part qui n'est pas chargé autrement.

## Conséquences

- Essayer l'application demande une commande ou un bouton ; régénérer remet les balades « à venir » dans le futur.
- Le préfixe `demo-` est réservé : un compte de test créé à la main avec ce préfixe serait supprimé avec les données de démonstration.
- Les blocages qu'un autre compte a posés sur un compte de démonstration disparaissent avec lui, comme pour toute suppression de compte. Une balade de démonstration conservée parce qu'un autre compte y participait reste visible, annulée et sans organisateur.
- Les photos sous CC BY ou CC BY-SA demandent un crédit en cas de diffusion : elles restent dans la base de développement et ne doivent pas être reprises dans des captures publiées sans crédit. L'auteur et la licence de chaque fichier sont sur sa page Commons.
- Wikimedia limite les clients anonymes ; régénérer très souvent peut faire manquer quelques photos de chiens. Un développeur peut ajouter un contact à l'agent utilisateur en local (`DemoData:Photos:UserAgent`) pour obtenir une limite plus haute.
- La génération dépend de services tiers (DiceBear, Wikipédia) qui peuvent changer ; sans eux, le jeu est créé sans photos.

## Alternatives écartées

- **Script SQL ou outil en ligne de commande séparé.** Ne profite ni des entités ni du stockage des photos, se désaccorde du modèle, et ne se lance pas depuis l'application.
- **Création par les points d'entrée publics.** Impossible pour les balades passées et les messages antidatés, et beaucoup plus lent.
- **Données de démonstration à la migration ou au démarrage.** Mélangées aux vraies données sans moyen propre de les retirer, et risquées si une configuration fuit en production.
- **Images versionnées dans le dépôt.** Le dépôt est public ; licence et poids à gérer.
- **Photos de personnes générées ou issues de banques d'images.** Les visages réels (ou réalistes) posent des questions de droit à l'image et de licence ; les avatars dessinés sous CC0 n'en posent pas.
- **Dog CEO pour les chiens.** Sans clé et bien classé par race, mais ses images viennent du Stanford Dogs Dataset (ImageNet), sans licence claire pour cet usage.
- **Unsplash, Pexels, Pixabay.** Demandent une clé d'API.
- **Une colonne `is_demo`.** Une migration pour une fonctionnalité de développement, alors que le préfixe de l'identifiant suffit.
