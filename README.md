# dogo

Application mobile pour trouver et organiser des balades entre chiens, en sachant à l'avance quels chiens seront là.

## État

La V1 est développée : une API (`api/`) et une application iOS et Android (`mobile/`). Elle tourne en local et a été essayée dans le simulateur iOS. Elle n'est ni hébergée ni publiée ; les étapes restantes sont listées dans le [plan](docs/plan.md#ce-que-ce-plan-ne-couvre-pas).

## Essayer en local

Il faut Docker, le SDK .NET 10, Node.js avec npm, et Xcode avec un simulateur iOS.

Lancer la base de données et l'API (sur `http://localhost:5080`) :

```bash
cd api
docker compose up -d --wait
dotnet run --project src/Dogo.Api
```

Dans un autre terminal, préparer l'application :

```bash
cd mobile
npm ci
cp .env.example .env
```

Dans `mobile/.env`, retirer le `#` devant `EXPO_PUBLIC_DEV_LOGIN=true` pour afficher la connexion de test, puis lancer :

```bash
npm start
```

Appuyer sur `i` ouvre l'application dans le simulateur iOS, avec Expo Go. Si rien ne s'ouvre, démarrer le simulateur puis lancer :

```bash
xcrun simctl openurl booted "exp://127.0.0.1:8081"
```

L'écran de connexion propose alors une « Connexion de test » : chaque identifiant saisi crée un compte distinct, ce qui permet de jouer plusieurs personnes.

Pour voir l'application avec des balades, des chiens et des messages, la même carte propose des données de démonstration fictives autour de Seppois-le-Haut, à générer et à supprimer d'un geste. Elles ne sont permises qu'en développement ; voir [`mobile/README.md`](mobile/README.md#données-de-démonstration-développement) et [`api/README.md`](api/README.md#données-de-démonstration-développement).

Les organisations se valident avec un compte administrateur de test ; la marche à suivre est dans le [README de l'API](api/README.md#agir-en-administrateur-en-local).

## Vérifier

```bash
cd api && dotnet test
```

```bash
cd mobile && npm run typecheck && npm run lint && npm test
```

Les tests de l'API démarrent leur propre base PostgreSQL dans Docker.

## Documentation

| Document | Contenu |
| --- | --- |
| [Périmètre V1](docs/perimetre-v1.md) | Ce que fait la V1 et ce qui en est exclu |
| [Spécification technique](docs/specification-v1.md) | Modèle de données, règles métier, points d'entrée |
| [Plan de développement](docs/plan.md) | Les tâches, leur état, et ce qu'il reste à faire |
| [Décisions d'architecture](docs/adr/README.md) | Un fichier par décision technique |
| [Guide de déploiement](docs/deploiement.md) | Mettre l'API en ligne : image, migrations, sauvegardes, hébergeurs |
| [API](api/README.md) et [mobile](mobile/README.md) | Commandes, configuration et conventions de chaque partie |
