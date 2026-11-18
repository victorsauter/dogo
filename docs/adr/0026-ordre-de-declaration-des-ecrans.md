# ADR 0026 — Écrans déclarés dans l'ordre de tri d'Expo Router

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** décidé par l'agent mobile M5, sur délégation ; à confirmer.

## Contexte

Au lancement en développement, une fenêtre rouge affichait « The action 'ROUTE_NAMES_CHANGED' with payload … was not handled by any navigator », une fois pour les onglets et une fois pour la pile `(app)`. Expo Router 58 construit l'état initial d'un navigateur avec les routes triées à sa façon (`index` et groupes d'abord, puis routes statiques par longueur de nom, puis routes dynamiques par ordre alphabétique). Quand les `Screen` déclarés dans la disposition sont dans un autre ordre, le navigateur monté constate que les noms de routes ont changé d'ordre, met en file une action `ROUTE_NAMES_CHANGED` et la signale comme non traitée. Rien ne casse, mais l'avertissement masque les vrais problèmes.

## Décision

- Les `Stack.Screen` et `Tabs.Screen` d'une disposition sont déclarés **dans l'ordre de tri d'Expo Router**. Un commentaire au-dessus de la disposition le rappelle.
- Pour les onglets, l'ordre déclaré est aussi l'ordre affiché : l'onglet « Mes balades » passe de `my-walks` à `mine` (4 lettres, avant `profile`) pour rester entre « Balades » et « Profil ». L'adresse interne passe de `/my-walks` à `/mine` ; aucun lien profond ni notification ne la visait.
- Un test compare, pour chaque disposition, l'ordre déclaré à l'ordre de tri calculé depuis les fichiers de `src/app/` ; il échoue aussi si un écran n'est pas déclaré. Le rendu de test ne reproduit pas l'avertissement, d'où cette vérification statique de la règle observée sur le simulateur.

## Conséquences

- Ajouter un écran demande de le placer au bon rang ; le test dit tout de suite quand ce n'est pas le cas.
- Si une version d'Expo Router traite ce changement d'ordre sans avertissement, l'ADR pourra être remplacé.

## Alternatives écartées

- **Ne pas déclarer les écrans.** Les titres et les options (modale, en-tête caché) se déclareraient dans chaque écran.
- **Réordonner les onglets pour suivre le tri.** Changerait l'ordre affiché pour une raison technique.
- **Ignorer l'avertissement.** Une erreur rouge à chaque lancement habitue à ne plus les lire.
