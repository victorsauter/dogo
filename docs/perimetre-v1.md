# dogo — Périmètre V1 (v0.3)

**Version :** 0.3 · 18/11/2026

## Ce qui change depuis la v0.2

La v0.3 ne garde qu'un produit, l'application canine, et qu'une promesse : des balades sociales sûres dans une zone pilote. Les décisions prises le 18/11/2026 sont listées plus bas ; le reste est une proposition à valider.

- **Application équine sortie de la feuille de route.** Elle reste en note à la fin du document.
- **Espace pros réduit** à l'organisation, ses membres et ses balades réservées. Paiement, prestations et agenda sont repoussés.
- **Les pros deviennent le canal d'amorçage**, intégrés à la V1 plutôt que livrés après.
- **Évaluations et badges en V1.1.** La v0.2 les plaçait à la fois dans le MVP (2.2) et en V1.1 (§5).
- **Modération à la main** : blocage et signalement privé, sans procédure outillée dans l'application.
- **Deux ajouts** : fil de discussion par balade et balades récurrentes.

## Promesse et cible de la V1

La V1 tient en une phrase : trouver et rejoindre une balade tranquille près de chez soi, en sachant quels chiens seront là.

- **Public :** les propriétaires de chiens d'une seule zone pilote, et 1 à 3 éducateurs ou clubs partenaires de cette zone.
- **Zone pilote :** en France ; ville à choisir. Le meilleur candidat est l'endroit où tu connais déjà des éducateurs.
- **Critère de réussite :** à fixer après les entretiens, une fois la ville et le nombre de partenaires connus. Point de départ : 10 balades par semaine pendant 4 semaines, dont la moitié créées par des particuliers.
- **Gratuité :** toute la V1 est gratuite, pour les particuliers comme pour les éducateurs.

## Périmètre V1

La V1 retient douze briques, contre vingt et une dans la v0.2 (MVP et espace pros) : les dix ci-dessous, plus le blocage et le signalement.

| Module | Ce qu'il fait en V1 |
| --- | --- |
| Comptes | Un profil humain, plusieurs chiens par propriétaire |
| Profil chien | Photo, nom, gabarit, âge, sociabilité, réactivité, habitudes en laisse ; race facultative |
| Découverte | Balades proches sur carte et en liste ; filtres par date et par gabarit admis |
| Création de balade | Date, heure, point de rendez-vous, description, nombre maximum de chiens, gabarits admis, règles (laisse) |
| Récurrence | Une balade peut se répéter chaque semaine ; les inscrits sont prévenus de la suivante |
| Accès | Inscription ouverte ou sur approbation de l'organisateur |
| Participants visibles | Profils des chiens déjà inscrits consultables avant de rejoindre |
| Lieu | Point de rendez-vous exact visible par tous, sur la carte et dans la liste |
| Fil de balade | Messages entre inscrits, sans temps réel ni photos ; notifications d'inscription, d'approbation, de changement et de rappel |
| Organisations | Fiche, éducateurs rattachés, adhésion sur demande, balades réservées aux membres et marquées comme professionnelles |

Le blocage et le signalement font aussi partie de la V1 ; ils sont décrits dans la section Sécurité. Les balades professionnelles sont payées hors application.

## Hors V1

Rien n'est abandonné : chaque sujet est rangé dans une étape ultérieure, avec la raison du report.

| Sujet | Repoussé à | Raison |
| --- | --- | --- |
| Mini-évaluation après-balade, badges communautaires | V1.1 | Demande du volume, et un seuil minimal de réponses pour préserver l'anonymat |
| Favoris et affinités entre chiens | V1.1 | Utile seulement quand les gens se sont déjà croisés |
| Paiement par chien à l'inscription | Lot pros 2 | Prestataire, remboursements, annulations et commission non définis |
| Catalogue de prestations, agenda, réservation | Lot pros 2 | Un produit en soi ; à lancer quand des éducateurs utilisent déjà les balades |
| Tableau de bord pro (présence, encaissements) | Lot pros 2 | Dépend du paiement |
| Certification des éducateurs, badges éducateurs | Plus tard | Processus de vérification non défini |
| Modération outillée : restrictions graduées, contestation dans l'application | Quand le volume l'exige | Traitable à la main à l'échelle d'une zone pilote |
| Accompagnement des chiens en difficulté, IA d'assistance | Plus tard | Suppose des éducateurs certifiés et un historique d'incidents |
| Santé, garde, pensions, activités sportives | Plus tard | Hors de la promesse initiale |

## Amorçage

La carte vide se règle en recrutant les éducateurs avant les particuliers : chacun amène ses clients et organise déjà des balades.

1. **Choisir la zone pilote** : une ville ou une agglomération, pas un pays.
2. **Convaincre 1 à 3 éducateurs ou clubs.** Ce qu'ils gagnent en V1 : remplacer leur groupe Facebook ou WhatsApp, voir la liste des inscrits par balade, fixer capacité et gabarits admis.
3. **Faire entrer leurs membres.** Chaque membre crée son compte et le profil de ses chiens, ce qui constitue la première base locale.
4. **Ouvrir les balades communautaires** dans la même zone, et en organiser quelques-unes soi-même les premières semaines.

Le risque principal est qu'un éducateur refuse sans paiement intégré. Si c'est le cas en entretien, le lot pros 2 passe avant la V1.1.

## Sécurité et signalements en V1

La V1 repose sur trois mécanismes simples ; le reste se traite à la main tant que le volume le permet.

- **Transparence avant la balade.** Profils des chiens inscrits visibles, gabarits admis et capacité maximale fixés par l'organisateur.
- **Blocage individuel.** Une personne bloquée ne peut plus s'inscrire aux balades que j'organise. Les balades où elle est inscrite me sont signalées avant que je rejoigne. Elle n'est pas prévenue.
- **Signalement privé.** Un formulaire avec le type (incident sans blessure, altercation, morsure ou blessure, comportement d'un humain) et les faits observés. Il arrive chez toi, et tu peux suspendre un compte à la main.

Les principes de la v0.2 restent : pas d'étiquette publique, pas de sanction automatique, examen humain, droit de réponse. En V1, ce droit de réponse passe par e-mail.

Trois points sont à faire cadrer par un juriste avant le lancement :

- **Responsabilité** de la plateforme si un chien déjà signalé blesse ensuite, et conditions d'utilisation correspondantes.
- **Données personnelles** : les signalements sont nominatifs. Il faut fixer leur durée de conservation et la réponse à une demande d'accès de la personne visée.
- **Règles françaises** sur les chiens de 1re et 2e catégorie (laisse et muselière dans les lieux publics), à reprendre dans les règles des balades.

## Décisions

Onze décisions sont prises ; deux restent ouvertes et dépendent des éducateurs partenaires.

| Décision prise | Choix |
| --- | --- |
| Nom et dépôt | L'application s'appelle dogo et vit dans le dépôt `dogo` ; `DogoMeet` est conservé à part |
| Paiement des balades professionnelles | Hors application en V1 |
| Pays du pilote | France |
| Forme de l'application | Application native iOS et Android |
| Technologie mobile | React Native avec Expo |
| Connexion | Apple ou Google uniquement, sans mot de passe |
| Visibilité du lieu | Point de rendez-vous exact visible par tous |
| Fil de balade | Fil simple intégré à l'application |
| Création d'une organisation | Sur demande, validée à la main par toi |
| Rythme | Seul, sur ton temps libre, avec l'aide de Claude |
| Démarrage | Le code d'abord |

| Décision ouverte | Piste | Ce qu'elle bloque |
| --- | --- | --- |
| Ville pilote | Celle des éducateurs que tu connais déjà ; à nommer | Amorçage |
| Critère de réussite du pilote | À fixer avec les éducateurs partenaires | Décision de passer à la suite |

Le natif impose une publication sur l'App Store et Google Play : comptes développeur et validation avant chaque sortie. Expo permet ensuite de corriger le code applicatif sans repasser par cette validation.

## Feuille de route révisée

Le développement commence maintenant, en quatre lots courts ; les éducateurs que tu connais voient l'application dès le lot 2.

1. **Lot 1 — Socle.** API, base de données, application Expo, connexion Apple ou Google, compte et profils chiens.
2. **Lot 2 — Balades.** Création, carte et liste, inscription ouverte ou sur approbation, participants visibles. Sortie : démonstration aux éducateurs que tu connais, dont les retours ajustent la suite.
3. **Lot 3 — Vie de la balade.** Fil simple, notifications, récurrence hebdomadaire.
4. **Lot 4 — Organisations et sécurité.** Fiche, membres, balades réservées, blocage et signalement. Sortie : publication sur les stores et ouverture du pilote.
5. **Pilote.** Dans la ville retenue, avec le critère de réussite fixé avec les éducateurs.
6. **V1.1.** Mini-évaluation après-balade, badges communautaires, affinités entre chiens.
7. **Lot pros 2.** Paiement par chien, catalogue de prestations, agenda et réservation. Il passe avant la V1.1 si les éducateurs en font une condition.
8. **Ensuite.** Certification des éducateurs, accompagnement, services, santé.

Le blocage et le signalement ne peuvent pas attendre après le lot 4 : l'App Store les exige de toute application où les utilisateurs publient du contenu.

## Technique

L'application s'appelle dogo et se développe dans le dépôt `dogo` ; le dépôt `DogoMeet` est conservé tel quel, à part.

- **Nom.** dogo, plus simple à retenir que DogoMeet.
- **Dépôt `DogoMeet`.** Premier développement en .NET (utilisateur, chien, balade). Il n'est ni modifié ni déplacé.
- **API.** .NET 10 en minimal API. La base proposée est PostgreSQL avec PostGIS, pour la recherche géographique, et des migrations EF Core.
- **Organisation du code.** Par fonctionnalité (comptes, chiens, balades, inscriptions, organisations, signalements) ; voir l'ADR 0004.
- **Tests.** Dès le départ sur les règles d'inscription : capacité, gabarits admis, approbation, blocage, réservation aux membres.
- **Client mobile.** Application native iOS et Android, connexion Apple ou Google ; développée avec React Native et Expo. L'API publie une description OpenAPI pour générer le client.
- **Pas de mutualisation.** Aucun paquet commun avec une future application équine tant qu'il n'y a qu'un produit.

Le détail est dans le [plan de développement](plan.md) et les [décisions d'architecture](adr/README.md).

## Mis de côté

L'application équine sort de la feuille de route jusqu'à ce que la V1 canine ait atteint son critère de réussite.

- **Référence.** La section 3 de la v0.2 reste le point de départ ; rien n'y est modifié.
- **Raison.** C'est un comparateur d'écuries, avec d'autres utilisateurs et d'autres parcours. Seul le socle technique serait commun.
- **Idée à conserver.** Distinguer ce qui est déclaré par l'écurie de ce qui est confirmé par les clients.

Les extensions canines de la v0.2 (section 2.6) sont réparties dans le tableau Hors V1.
