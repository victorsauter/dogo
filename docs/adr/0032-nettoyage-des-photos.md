# ADR 0032 — Nettoyage des photos : décodage et réencodage côté serveur, HEIC refusé, cache privé

- **Statut :** Proposé
- **Date :** 18/11/2026
- **Précise :** [ADR 0010](0010-stockage-des-photos.md) (« aucune transformation d'image n'est faite » et « cache long » ne sont plus vrais).

## Contexte

Les photos de profil et de chien sont servies sans authentification (ADR 0010). Une revue a relevé trois défauts :

1. Le serveur ne contrôlait que les premiers octets du fichier puis l'enregistrait tel quel. Une photo de téléphone garde ses métadonnées, dont la position GPS du lieu de prise de vue (souvent le domicile), et un fichier arbitraire peut se cacher derrière un en-tête valide. L'application mobile réencode déjà en JPEG, mais n'importe quel client peut envoyer l'original.
2. Les fichiers étaient servis avec `Cache-Control: public, max-age=31536000, immutable` : une photo supprimée (compte supprimé, photo remplacée) pouvait rester servie un an par un cache partagé. Aucun en-tête ne limitait l'interprétation du fichier par un navigateur.
3. La suppression d'un fichier après la validation en base pouvait lever une exception : le client recevait une erreur 500 alors que l'opération avait réussi, et, pour une suppression de compte, les notifications d'annulation ne partaient pas.

Contraintes : projet personnel qui peut devenir commercial (licence), API déployée plus tard dans un conteneur Linux (la CI tourne sur `ubuntu-latest`, pas encore de Dockerfile), versions stables et récentes.

## Décision

**Nettoyage.** À la réception, le serveur décode l'image puis la réécrit à partir de ses seuls pixels : aucune métadonnée ne survit (EXIF dont le GPS, XMP, IPTC, commentaires, profil de couleur d'origine) ni aucun contenu caché. Un fichier qui ne se décode pas, qui est tronqué ou dont le format réel ne correspond pas à son en-tête est refusé (415 `photo.unsupported_type`, l'erreur de format existante). Le format reste celui du fichier : JPEG (qualité 90), PNG (sans perte), WebP (qualité 85). Les couleurs sont converties en sRGB. Les images animées (WebP, APNG) ne gardent que leur première image. Le même traitement s'applique aux photos téléchargées pour les données de démonstration (`DemoPhotoFetcher`).

**Orientation.** L'orientation EXIF (valeurs 1 à 8) est appliquée aux pixels avant la suppression des métadonnées : une photo de téléphone tournée par l'EXIF reste dans le bon sens.

**Dimensions.** Au plus 40 mégapixels décodés (largeur × hauteur, lues dans l'en-tête avant toute allocation), sinon 413 `photo.too_large` (le code existant est réutilisé pour ne pas changer le contrat avec l'application). 40 Mpx pèsent 160 Mo une fois décodés ; au plus deux décodages tournent en même temps. Au-delà de 2 048 pixels sur le grand côté, l'image est réduite en gardant ses proportions (l'application affiche des photos bien plus petites et en envoie de 1 280 pixels). La limite de 5 Mo et celle de la requête sont inchangées. Réglages : `Photos:MaxPixels`, `Photos:MaxSide`, `Photos:JpegQuality`, `Photos:WebpQuality` (valeurs par défaut ci-dessus, rien à configurer).

**Bibliothèque : SkiaSharp 4.157.0** (paquet `SkiaSharp`) avec `SkiaSharp.NativeAssets.Linux.NoDependencies` 4.157.0.

| | SkiaSharp 4.157.0 | SixLabors.ImageSharp 4.1.3 | Magick.NET-Q8-AnyCPU 15.1.0 |
| --- | --- | --- | --- |
| Licence | MIT | Six Labors Split License 1.0 : Apache 2.0 pour l'open source et l'usage transitif ; usage direct dans un logiciel fermé et à but lucratif au-delà de 1 M USD de chiffre d'affaires annuel : licence commerciale (à partir de 799 USD par an) ; en dessous, licence « Community » gratuite sur demande | Apache 2.0 (ImageMagick a sa propre licence, permissive) |
| Dépendances natives sous Linux | Une bibliothèque native (`libSkiaSharp.so`, 12 Mo) ; la variante `NoDependencies` n'exige que la libc (glibc : libpthread, libdl, libm, libc ; variantes musl pour Alpine et arm64 dans le même paquet), pas de fontconfig | Aucune (code managé) | Une bibliothèque native ImageMagick embarquée ; paquet de 97 Mo |
| Formats | JPEG, PNG, WebP en lecture et en écriture ; pas de HEIC | JPEG, PNG, WebP, GIF, BMP, TIFF, TGA… ; pas de HEIC | Une centaine, dont HEIC via libheif |
| Métadonnées | Réencodage sans métadonnées par défaut ; orientation à appliquer soi-même | Conservées par défaut : il faut les effacer explicitement | À effacer explicitement (`Strip`) |
| Suivi de sécurité | Décodeurs de Chromium (libjpeg-turbo, libpng, libwebp), mis à jour avec les versions de SkiaSharp | Code managé, sans corruption de mémoire possible ; correctifs par versions | Surface d'attaque très large (beaucoup de formats), historique de failles fréquentes, politique de sécurité à régler |

SkiaSharp est retenu : licence MIT sans condition (aucun risque si le projet devient commercial), les trois formats utiles, sans dépendance système sous Linux, et rapide. ImageSharp était le plus sûr côté mémoire et sans dépendance native, mais sa licence demanderait de suivre le chiffre d'affaires et une demande de licence « Community » ou un achat si le projet devient commercial. Magick.NET est surdimensionné pour trois formats, et sa seule vraie avance, le HEIC, est écartée ci-dessous. Le prix de SkiaSharp est un code natif (C++) qui lit des fichiers venant d'inconnus : c'est ce que les limites de taille, de pixels et de concurrence compensent, et il faudra suivre les versions de SkiaSharp et les mettre à jour.

**HEIC refusé.** Aucune des trois bibliothèques n'est un choix sûr pour décoder du HEIC de façon fiable sous Linux : SkiaSharp et ImageSharp ne le lisent pas du tout ; Magick.NET le lit via libheif, mais le décodage HEVC pose des questions de brevets et le comportement sous Linux n'a pas été vérifié ici. Un HEIC non nettoyé ne doit pas passer : il est refusé (415 `photo.unsupported_type`). **Écart avec l'ADR 0010**, qui acceptait le HEIC sans le convertir. L'application mobile envoie toujours du JPEG (`mobile/src/lib/photoPicker.ts` réencode en JPEG avant l'envoi), donc aucun utilisateur de l'application n'est touché. À corriger côté mobile, qui n'est pas modifié par cet ADR : le message `photo.unsupported_type` de `mobile/src/strings/fr.ts` cite encore le HEIC, et le commentaire de `schema.d.ts` sera régénéré avec `api/openapi.json`.

**Diffusion.** Les réponses de `/photos/{fichier}` portent `Cache-Control: private, max-age=86400` (un jour, cache privé : navigateur ou application, jamais un cache partagé), `X-Content-Type-Options: nosniff` et `Content-Security-Policy: default-src 'none'; sandbox`. Un nom de fichier n'étant jamais réutilisé, une durée courte coûte peu, et une photo supprimée ne reste pas servie longtemps. Les photos restent accessibles sans authentification (ADR 0010).

**Suppression de fichier.** `IPhotoStorage.DeleteAsync` ne lève plus d'exception quand le fichier ne peut pas être supprimé (droits, disque) : `LocalPhotoStorage` journalise un avertissement (nom du fichier, aléatoire, et type d'erreur ; aucune donnée personnelle) et continue. Le fichier reste sur le disque ; les appelants, qui suppriment après la validation en base, ne changent pas.

## Conséquences

- Plus aucune position GPS ni métadonnée dans les fichiers servis ; une photo ne peut plus servir à cacher un autre contenu.
- Une photo est réencodée : légère perte de qualité pour un JPEG ou un WebP (qualité 90 et 85), sans perte pour un PNG. Le coût en processeur et en mémoire est borné par les limites ci-dessus.
- Un HEIC envoyé directement à l'API est refusé. Si l'on veut un jour l'accepter (autre client, application web), il faudra le convertir côté serveur avec une bibliothèque qui le décode, ce qui demande un nouvel ADR.
- Image Docker et CI : avec `NoDependencies`, la bibliothèque native ne demande que la libc ; l'image `mcr.microsoft.com/dotnet/aspnet` (Debian) suffit, sans paquet à installer. Sous Alpine, le paquet contient aussi les binaires musl. Si l'on choisissait plutôt `SkiaSharp.NativeAssets.Linux`, il faudrait installer `libfontconfig1`. Le système de développement (macOS) reçoit sa propre bibliothèque native par le paquet `SkiaSharp`.
- Les fichiers déjà stockés avant ce changement (développement seulement) ne sont pas retraités.
- Le nettoyage lit ses réglages dans `IConfiguration` à chaque requête (aucune classe d'options enregistrée dans `Program.cs`) ; les enregistrer proprement avec `AddOptions` reste possible sans changer le comportement.
- Une suppression de compte ou de chien, ou un remplacement de photo, réussit même si le disque refuse la suppression du fichier ; les fichiers orphelins éventuels se repèrent dans le journal.

## Alternatives écartées

- **ImageSharp.** Voir le tableau : bonne technique, mais licence à surveiller si le projet devient commercial.
- **Magick.NET.** Trop lourd et trop large pour trois formats ; son atout, le HEIC, ne suffit pas à compenser (brevets HEVC, fiabilité sous Linux non vérifiée).
- **Ne supprimer que les métadonnées du fichier, sans réencoder** (édition des segments JPEG, des blocs PNG). Laisse passer un contenu arbitraire derrière un en-tête valide et ne couvre pas tous les formats ; le décodage complet est plus sûr.
- **Faire confiance à l'application mobile**, qui réencode déjà. L'API est publique : n'importe quel client peut envoyer l'original.
- **Accepter le HEIC sans le nettoyer.** Garderait justement les métadonnées visées.
- **Cache public d'un an conservé** (ADR 0010). Une photo supprimée resterait servie.
- **Rendre `DeleteAsync` fiable en réessayant ou en différant la suppression** (file de suppressions, tâche de nettoyage des orphelins). Plus complexe que le problème ; un avertissement dans le journal suffit à cette échelle.
