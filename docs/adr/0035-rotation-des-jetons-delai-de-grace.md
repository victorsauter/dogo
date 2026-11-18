# ADR 0035 — Rotation des jetons de rafraîchissement : familles, délai de grâce, révocation par famille et purge ; précise l'ADR 0009

- **Statut :** Proposé
- **Date :** 19/11/2026

## Contexte

L'ADR 0009 révoque tous les jetons d'un utilisateur dès qu'un jeton déjà révoqué est présenté, et ne laisse réussir qu'un seul de deux renouvellements simultanés. Une revue de sécurité a relevé deux effets indésirables. Sur réseau mobile, la réponse de `POST /auth/refresh` se perd parfois après que le serveur a fait la rotation : au lancement suivant, l'application renvoie l'ancien jeton, et la personne est déconnectée de tous ses appareils. Deux renouvellements partis en même temps (deux écrans, une reprise d'arrière-plan) se révoquent l'un l'autre de la même façon. Par ailleurs, aucun jeton n'est jamais supprimé : la table grossit sans fin.

Les jetons sont stockés hachés : le serveur ne peut pas renvoyer « le même successeur » sans conserver sa valeur en clair, ce qu'on refuse.

## Décision

- **Familles.** Chaque jeton porte `family_id` : l'identifiant du premier jeton émis par la connexion, recopié à chaque rotation. Une rotation marque l'ancien jeton `revoked_at` et `replaced_at` (même instant) ; une révocation pour une autre raison (déconnexion, suspension, alerte) ne remplit que `revoked_at`.
- **Délai de grâce.** Un jeton remplacé depuis moins de `Auth:Jwt:RefreshTokenGracePeriod` (60 s par défaut, entre 0 et 5 minutes, démarrage refusé sinon) donne une **nouvelle** session de la même famille, à condition que la famille ait encore un jeton vivant (ni déconnectée ni révoquée) et que le compte ne soit pas suspendu. Le successeur déjà émis reste valable : le client garde la réponse qu'il a lue, quelle qu'elle soit. Deux renouvellements simultanés réussissent donc tous les deux.
- **Alerte hors délai.** Au-delà du délai, présenter un jeton révoqué reste une alerte (journal en avertissement) mais ne révoque que **sa famille** : la session de cet appareil, pas celles des autres appareils de la personne.
- **Sérialisation.** Rotation, rejeu dans le délai, révocation de famille et déconnexion prennent un verrou consultatif PostgreSQL de transaction sur la famille (`pg_advisory_xact_lock`, clé tirée de la moitié aléatoire de l'identifiant) et relisent l'état du jeton sous ce verrou. Une révocation de famille ne peut donc pas manquer un jeton émis au même moment.
- **Déconnexion.** `POST /auth/logout` révoque toute la famille du jeton présenté, y compris les jetons émis pendant un délai de grâce.
- **Purge.** `RefreshTokenPurgeJob`, dans la boucle des tâches de fond (toutes les `BackgroundJobs:PurgeInterval`, une heure), supprime les jetons expirés ou révoqués depuis plus de `Auth:Jwt:RefreshTokenRetention` (30 jours), par lots de 1 000 pris avec `FOR UPDATE SKIP LOCKED` : plusieurs instances se partagent le travail sans s'attendre ni bloquer un renouvellement. Avec la valeur par défaut, un jeton révoqué a toujours expiré avant d'être supprimé : la détection de réutilisation n'est pas affaiblie.
- **Migration.** `AddRefreshTokenFamilies` ajoute `family_id` (les jetons existants deviennent chacun leur propre famille) et `replaced_at`, avec des index sur `family_id` et `expires_at`.

## Conséquences

- Une réponse perdue ou deux renouvellements simultanés ne déconnectent plus personne, tant que le rejeu arrive dans le délai.
- Un rejeu après le délai (application relancée des heures plus tard avec l'ancien jeton) déconnecte seulement l'appareil concerné. Le délai ne couvre pas ce cas ; la révocation par famille en limite les dégâts.
- Un voleur qui présente un jeton dans les 60 secondes qui suivent sa rotation obtient une session, au même titre que le titulaire ; elle tombe avec la famille à la prochaine alerte ou déconnexion. C'est le prix de la tolérance, borné par la durée du délai et par la limitation de débit de `/auth` (ADR 0031).
- Pendant un délai de grâce, une famille peut avoir plusieurs jetons vivants.
- Une alerte ne révoque plus les autres appareils : un vol détecté sur l'un ne coupe pas les sessions des autres, qui n'ont pas été exposées par ce jeton.
- La table des jetons reste bornée ; la purge est sans effet visible pour l'application.

## Alternatives écartées

- **Renvoyer le même successeur pendant le délai.** Demande de garder sa valeur en clair (ou chiffrée de façon réversible) : une fuite de la base redonnerait des jetons utilisables.
- **Révoquer le successeur précédent à chaque rejeu.** De deux réponses simultanées, le client peut garder celle dont le jeton vient d'être révoqué ; il serait déconnecté au renouvellement suivant.
- **Garder la révocation de tous les jetons de l'utilisateur.** Déconnecte tous les appareils pour un incident de réseau sur un seul.
- **Délai de grâce long (plusieurs heures).** Couvrirait l'application relancée tard, mais laisserait un jeton volé utilisable trop longtemps.
- **Verrou de ligne (`SELECT … FOR UPDATE`) sur les jetons vivants de la famille.** Ne voit pas les lignes insérées pendant l'attente ; le verrou consultatif couvre toute la famille.
- **Purge par une seule requête `DELETE` sans lots.** Plus simple, mais une première purge sur une grosse table tiendrait de longs verrous.
