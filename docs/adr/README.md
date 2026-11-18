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

## Statuts

- **Proposé** : recommandation en attente de validation.
- **Accepté** : décision prise, à appliquer.
- **Remplacé** : décision révisée par un ADR plus récent, cité dans le fichier.

## Ajouter un ADR

1. Copier [le modèle](0000-modele.md) sous le numéro suivant.
2. Remplir les quatre sections en restant court.
3. Ajouter la ligne au tableau ci-dessus.

Un ADR accepté ne se réécrit pas. Pour changer d'avis, on en ajoute un nouveau qui remplace l'ancien.
