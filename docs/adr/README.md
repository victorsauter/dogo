# Décisions d'architecture (ADR)

Chaque fichier consigne une décision technique : son contexte, ce qui est décidé, ce que cela entraîne et ce qui a été écarté.

| N° | Décision | Statut |
| --- | --- | --- |
| [0001](0001-consigner-les-decisions.md) | Consigner les décisions d'architecture dans des ADR | Accepté |
| [0002](0002-depot-dogo.md) | Développer l'application dans le dépôt `dogo` | Accepté |
| [0003](0003-mobile-react-native-expo.md) | Application mobile native avec React Native et Expo | Accepté |
| [0004](0004-api-dotnet.md) | API en .NET 10, code organisé par fonctionnalité | Accepté |
| [0005](0005-postgresql-postgis.md) | PostgreSQL et PostGIS pour les données | Proposé |
| [0006](0006-connexion-apple-google.md) | Connexion par Apple ou Google uniquement | Accepté |
| [0007](0007-client-api-openapi.md) | Client mobile généré depuis la description OpenAPI | Proposé |
| [0008](0008-notifications-sans-temps-reel.md) | Notifications push, sans temps réel | Proposé |

## Statuts

- **Proposé** : recommandation en attente de validation.
- **Accepté** : décision prise, à appliquer.
- **Remplacé** : décision révisée par un ADR plus récent, cité dans le fichier.

## Ajouter un ADR

1. Copier [le modèle](0000-modele.md) sous le numéro suivant.
2. Remplir les quatre sections en restant court.
3. Ajouter la ligne au tableau ci-dessus.

Un ADR accepté ne se réécrit pas. Pour changer d'avis, on en ajoute un nouveau qui remplace l'ancien.
