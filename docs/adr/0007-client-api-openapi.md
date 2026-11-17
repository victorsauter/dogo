# ADR 0007 — Client mobile généré depuis la description OpenAPI

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** accepté par l'orchestrateur, sur délégation, pour lancer le développement ; à confirmer.

## Contexte

L'API est en C# et l'application mobile en TypeScript. Les modèles ne peuvent pas être partagés directement, et les recopier à la main finit par les désaccorder.

## Décision

L'API publie une description OpenAPI. Le client TypeScript de l'application mobile, avec ses types, est généré à partir de cette description. L'outil de génération est à choisir au lot 1.

## Conséquences

- Un changement de l'API qui casse le mobile se voit à la vérification des types, dans la CI.
- Le client généré est régénéré à chaque évolution de l'API.
- La description OpenAPI doit rester exacte : elle devient une partie du contrat.

## Alternatives écartées

- **Écrire le client à la main.** Simple au début, mais chaque oubli devient une erreur à l'exécution.
- **Partager du code entre serveur et mobile.** Impossible entre C# et TypeScript.
