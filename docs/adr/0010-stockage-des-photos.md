# ADR 0010 — Photos stockées sur le disque du serveur, derrière une interface

- **Statut :** Accepté
- **Date :** 18/11/2026
- **Note :** accepté par l'orchestrateur, sur délégation, pour lancer le développement ; à confirmer.

## Contexte

Les profils et les chiens ont une photo. L'hébergement n'est pas choisi (spécification, section 7) ; aucun service de stockage d'objets n'est donc disponible. Les photos viennent de téléphones : JPEG, PNG, WebP et HEIC pour les iPhone.

## Décision

- Les photos sont stockées par l'interface `IPhotoStorage` ; la seule implémentation, `LocalPhotoStorage`, écrit dans un dossier local (`Storage:Local:Path`, `./data/photos` par défaut).
- Chaque fichier reçoit un nom aléatoire (128 bits) avec l'extension du format détecté ; l'ancien fichier est supprimé au remplacement et à la suppression du chien.
- Le format est reconnu sur le contenu (octets de signature), jamais sur le type déclaré ; 5 Mo au plus. Aucune transformation d'image n'est faite.
- Les photos sont servies sans authentification sur `/photos/{fichier}`, avec un cache long. La base garde le nom du fichier ; les réponses exposent `photoUrl`, chemin relatif à l'origine de l'API (`/photos/…`).

## Conséquences

- Aucun compte ni service externe pour développer et tester.
- L'API n'est pas sans état : en production, le dossier doit être sur un volume persistant et sauvegardé, et une seule instance peut écrire. Passer à un stockage d'objets revient à écrire une autre implémentation de `IPhotoStorage` et éventuellement à changer le calcul de `photoUrl`.
- Les photos sont accessibles à qui connaît l'URL. C'est un écart assumé avec « tout exige une authentification » (spécification, section 1) : les composants d'image du mobile chargent des URL simples, et les noms ne se devinent pas.
- Les photos HEIC ne s'affichent pas partout (Android ancien) ; une conversion côté mobile ou serveur pourra être ajoutée.

## Alternatives écartées

- **Stockage d'objets (S3 ou équivalent) dès maintenant.** Demande un compte et un choix d'hébergeur, hors périmètre.
- **Photos en base de données.** Alourdit les sauvegardes et les requêtes pour un gain nul à cette échelle.
- **Photos servies avec authentification.** Oblige le mobile à joindre l'en-tête `Authorization` à chaque image et empêche le cache partagé.
