# Décisions d'architecture (ADR)

Chaque fichier consigne une décision technique : son contexte, ce qui est décidé, ce que cela entraîne et ce qui a été écarté.

| N° | Décision | Statut |
| --- | --- | --- |
| [0001](0001-consigner-les-decisions.md) | Consigner les décisions d'architecture dans des ADR | Accepté |
| [0002](0002-depot-dogo.md) | Développer l'application dans le dépôt `dogo` | Accepté |
| [0003](0003-mobile-react-native-expo.md) | Application mobile native avec React Native et Expo | Accepté |
| [0004](0004-api-dotnet.md) | API en .NET 10, code organisé par fonctionnalité | Accepté |
| [0005](0005-postgresql-postgis.md) | PostgreSQL et PostGIS pour les données | Accepté |
| [0006](0006-connexion-apple-google.md) | Connexion par Apple ou Google uniquement | Accepté |
| [0007](0007-client-api-openapi.md) | Client mobile généré depuis la description OpenAPI | Accepté |
| [0008](0008-notifications-sans-temps-reel.md) | Notifications push, sans temps réel | Accepté |
| [0009](0009-jetons-de-session.md) | Jetons de session : jeton d'accès JWT court et jeton de rafraîchissement rotatif | Accepté |
| [0010](0010-stockage-des-photos.md) | Photos stockées sur le disque du serveur, derrière une interface | Accepté |
| [0011](0011-conventions-api.md) | Conventions de code de l'API : fonctionnalités, erreurs, OpenAPI et tests | Accepté |
| [0012](0012-navigation-expo-router.md) | Navigation par fichiers avec Expo Router | Accepté |
| [0013](0013-client-api-et-donnees.md) | Client d'API typé et cache des données avec TanStack Query | Accepté |
| [0014](0014-session-mobile.md) | Session mobile : stockage sécurisé et renouvellement unique du jeton | Accepté |
| [0015](0015-concurrence-des-inscriptions.md) | Capacité des balades : verrou sur la ligne de la balade et index unique partiel | Accepté |
| [0017](0017-ecrans-empiles-sur-les-onglets.md) | Écrans empilés au-dessus des onglets | Accepté |
| [0018](0018-connexion-native-chargee-a-la-demande.md) | Connexion Apple et Google : modules natifs chargés à la demande | Accepté |
| [0019](0019-notifications-et-taches-planifiees.md) | Notifications et tâches planifiées : file en mémoire, boucle périodique, rappels au plus une fois | Accepté |
| [0020](0020-administration-par-e-mails-configures.md) | Administration : comptes désignés par leur e-mail dans la configuration, points d'entrée `/admin` sans écran | Accepté |
| [0021](0021-carte-et-position-mobile.md) | Carte et position dans l'application mobile | Accepté |
| [0022](0022-notifications-push-mobile.md) | Notifications push mobile : module chargé seulement avec un projet EAS, indisponibilité silencieuse | Accepté |
| [0023](0023-suppression-de-compte.md) | Suppression de compte : suppression réelle en une transaction, balades conservées sans organisateur | Accepté |
| [0025](0025-pages-legales-hors-garde.md) | Pages légales hors de la garde d'authentification | Accepté |
| [0026](0026-ordre-de-declaration-des-ecrans.md) | Écrans déclarés dans l'ordre de tri d'Expo Router | Accepté |
| [0027](0027-donnees-de-demonstration.md) | Données de démonstration : fonctionnalité de développement, générée par l'API, photos téléchargées à la génération | Accepté |
| [0028](0028-balades-carte-et-panneau-coulissant.md) | Onglet Balades : deux vues au choix, panneau coulissant par défaut | Accepté |
| [0029](0029-menus-ancres-et-finition-native.md) | Filtres en pastilles-menus ancrées, menu natif d'iOS par `@expo/ui`, matériaux et retour haptique | Accepté |
| [0030](0030-charte-graphique-uzu.md) | Charte graphique « Uzu » : blanc cassé, fauve et noir, couleurs du pelage d'un Jack Russell | Accepté |
| [0033](0033-fin-de-session-et-delais-reseau.md) | Mobile : fin de session expliquée, persistance sûre de la session, délais réseau et configuration de distribution (précise 0014 et 0022) | Accepté |

## Statuts

- **Proposé** : recommandation en attente de validation.
- **Accepté** : décision prise, à appliquer.
- **Remplacé** : décision révisée par un ADR plus récent, cité dans le fichier.

## Ajouter un ADR

1. Copier [le modèle](0000-modele.md) sous le numéro suivant.
2. Remplir les quatre sections en restant court.
3. Ajouter la ligne au tableau ci-dessus.

Un ADR accepté ne se réécrit pas. Pour changer d'avis, on en ajoute un nouveau qui remplace l'ancien.
