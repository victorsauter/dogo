# ADR 0017 — Écrans empilés au-dessus des onglets

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** décidé par l'agent mobile M2, sur délégation ; à confirmer.

## Contexte

Le profil, les chiens et les profils publics demandent des écrans qui ne sont pas des onglets : modification du profil, fiche d'un chien, formulaire de chien, profil d'un autre membre. L'ADR 0012 ne prévoit que trois onglets dans `(app)`. Avec les onglets JavaScript, tout fichier ajouté à `(app)` deviendrait un onglet, à masquer un par un.

## Décision

`(app)` devient une pile (`Stack`) qui contient le groupe `(tabs)` (les trois onglets, sans en-tête) et les écrans poussés par-dessus (`edit-profile`, `users/[id]`, `dogs/new`, `dogs/[id]`, `dogs/[id]/edit`). Les adresses ne changent pas : un groupe entre parenthèses n'apparaît pas dans l'URL (`/`, `/profile`, `dogs/{id}` pour `dogo://dogs/{id}`). La modification du profil s'ouvre en modale. L'ouverture automatique de cette modale pour un nouveau membre vit dans la disposition de `(app)`.

## Conséquences

- Un écran de détail se crée en ajoutant un fichier sous `(app)/`, jamais dans `(tabs)/`.
- Les écrans poussés ont l'en-tête et le bouton retour de la pile ; les onglets gardent leur barre.
- Les liens profonds des notifications (lot 3) vers une balade suivent le même modèle.

## Alternatives écartées

- **Masquer chaque écran de détail dans les onglets** (`href: null`) : une ligne de configuration par écran, et le bouton retour n'existe pas.
- **Un `Stack` par onglet** : plus fidèle à iOS, mais multiplie les dispositions pour une dizaine d'écrans.
