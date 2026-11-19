# ADR 0002 — Développer l'application dans le dépôt `dogo`

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Précisé par :** [ADR 0041](0041-nom-de-l-application-uzu.md) : le produit s'appelle désormais Uzu ; le dépôt garde le nom `dogo`.
- **Précisé par :** l'arborescence proposée (`api/`, `mobile/`, `docs/`) est en place depuis le 18/11/2026.

## Contexte

Un premier développement existe dans le dépôt `DogoMeet` : une API .NET avec les utilisateurs, les chiens et les balades. Le nom retenu pour l'application est dogo, plus simple à retenir.

## Décision

L'application se développe dans le dépôt `dogo`. Le dépôt `DogoMeet` est conservé tel quel, sans modification ni déplacement.

L'API, l'application mobile et la documentation partagent ce dépôt, dans les dossiers `api/`, `mobile/` et `docs/`. Cette arborescence est une proposition, détaillée dans le plan.

## Conséquences

- Le nom du dépôt, celui de l'application et celui des stores sont alignés.
- Une modification qui touche l'API et le mobile tient dans une seule demande de fusion.
- La CI doit distinguer les deux parties pour ne pas tout reconstruire à chaque fois.
- Ce qui est repris de `DogoMeet` se décide au cas par cas ; voir l'ADR 0004.

## Alternatives écartées

- **Continuer dans `DogoMeet`.** Le dépôt garderait l'ancien nom, et son code existant doit rester intact.
- **Un dépôt par partie (API, mobile).** Plus de coordination pour une seule personne, sans bénéfice à cette taille.
