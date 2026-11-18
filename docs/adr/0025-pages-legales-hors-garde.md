# ADR 0025 — Pages légales hors de la garde d'authentification

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** décidé par l'agent mobile M5, sur délégation ; à confirmer.

## Contexte

Les conditions d'utilisation et la politique de confidentialité doivent s'ouvrir depuis l'écran de connexion (« En continuant, tu acceptes… », personne non connectée) et depuis les réglages du profil (personne connectée). L'ADR 0012 sépare l'application en deux groupes protégés par `Stack.Protected` : `(auth)` pour les personnes déconnectées, `(app)` pour les connectées. Un écran placé dans l'un n'est pas accessible depuis l'autre.

## Décision

Les deux textes vivent dans un troisième groupe `(legal)` à la racine, déclaré dans la disposition racine **sans garde**, avec sa propre pile et son en-tête (`/terms`, `/privacy`). Chaque écran n'affiche que du texte du module de textes (`strings/legal.ts`) ; le bandeau « Version provisoire — à faire valider avant la publication » est dans le composant `LegalDocument`, donc impossible à oublier sur l'un des deux.

## Conséquences

- Le bouton retour ramène à l'écran d'où l'on vient (connexion ou profil) : la pile racine empile `(legal)` au-dessus de `(app)` ou `(auth)`.
- Les textes sont versionnés dans le code ; leur validation juridique reste à faire avant la publication, et les passages `[…]` (éditeur, adresse, contact) sont volontairement non remplis.
- Un nouveau texte public (mentions légales, par exemple) s'ajoute dans ce groupe.

## Alternatives écartées

- **Deux copies des écrans, une dans `(auth)` et une dans `(app)`.** Duplique des routes et des liens profonds pour un même contenu.
- **Ouvrir une page web externe.** Impose un site avant la publication et sort de l'application ; les textes sont encore provisoires.
