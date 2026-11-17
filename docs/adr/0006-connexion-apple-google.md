# ADR 0006 — Connexion par Apple ou Google uniquement

- **Statut :** Accepté
- **Date :** 18/11/2026

## Contexte

Chaque utilisateur a un compte, avec un profil et un ou plusieurs chiens. L'application est native, sur iOS et Android.

## Décision

La connexion se fait uniquement avec un compte Apple ou un compte Google. Il n'y a ni mot de passe ni lien envoyé par e-mail.

L'application obtient un jeton d'identité auprès d'Apple ou de Google ; l'API le vérifie, crée le compte au premier passage et émet son propre jeton de session. Ce mécanisme est à préciser au lot 1.

## Conséquences

- Aucun mot de passe à stocker, à réinitialiser ou à protéger.
- Une personne sans compte Apple ni Google ne peut pas s'inscrire.
- La connexion Apple demande un compte Apple Developer ; la connexion Google demande un projet Google Cloud.
- L'App Store impose de proposer la connexion Apple dès qu'une autre connexion tierce existe : c'est le cas ici.
- L'App Store impose aussi de pouvoir supprimer son compte depuis l'application ; la tâche est dans le lot 4.

## Alternatives écartées

- **Lien par e-mail en plus d'Apple et Google.** Couvre tout le monde, mais demande un envoi d'e-mails fiable dès le premier jour.
- **E-mail et mot de passe.** Familier, mais ajoute la gestion des mots de passe oubliés et de leur sécurité.
