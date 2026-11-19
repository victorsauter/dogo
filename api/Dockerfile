# syntax=docker/dockerfile:1
#
# Image de l'API dogo (ADR 0038). Contexte de construction : le dossier api/.
#
#   docker build -t dogo-api:local api
#
# L'image contient l'API (point d'entrée) et le bundle de migrations EF Core (/app/efbundle),
# construits ensemble : une étiquette désigne toujours un code et le schéma qui va avec.

# Ubuntu 24.04 (« noble ») est la distribution par défaut des images .NET 10 ; l'étiquette la
# nomme pour qu'un changement de base ne passe pas inaperçu. Les images « chiseled » sont
# écartées : sans tzdata (le fuseau Europe/Paris est obligatoire) et sans shell.
ARG DOTNET_TAG=10.0-noble

# ---------------------------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_TAG} AS build
WORKDIR /src

# La construction du projet régénère api/openapi.json, deux dossiers au-dessus du projet (hors du
# contexte, donc hors de l'image) : on neutralise cette génération (Microsoft.Extensions.ApiDescription.Server,
# propriété OpenApiGenerateDocuments). En local et en CI, rien ne change : la propriété n'est posée qu'ici.
ENV OpenApiGenerateDocuments=false \
    DOTNET_NOLOGO=1 \
    DOTNET_CLI_TELEMETRY_OPTOUT=1

# Restauration seule d'abord : cette couche reste en cache tant que les paquets ne changent pas.
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY .config/ .config/
COPY src/Dogo.Api/Dogo.Api.csproj src/Dogo.Api/
RUN dotnet restore src/Dogo.Api/Dogo.Api.csproj && dotnet tool restore

COPY src/ src/
# Deux retouches du dossier publié :
# - les réglages de développement (dont la clé de signature versionnée) n'ont rien à faire dans l'image ;
# - le paquet SkiaSharp.NativeAssets.Linux.NoDependencies apporte les bibliothèques de tous les
#   systèmes (près de 480 Mo avec Windows, macOS et Android) : on ne garde que Linux x64 et arm64,
#   glibc, soit les deux architectures que l'image peut avoir. Le runtime ne cherche que celle de sa machine.
RUN dotnet publish src/Dogo.Api/Dogo.Api.csproj \
        --configuration Release --no-restore --output /app/publish -p:UseAppHost=false \
    && rm -f /app/publish/appsettings.Development.json \
    && find /app/publish/runtimes -mindepth 1 -maxdepth 1 ! -name linux-x64 ! -name linux-arm64 -exec rm -rf {} + \
    && ls /app/publish/runtimes

# Bundle de migrations : exécutable qui applique les migrations sans SDK ni outil EF.
# Il est construit dans l'environnement Production pour ne pas charger les réglages de développement.
# L'outil crée un DbContext, ce que Npgsql refuse sans hôte : une chaîne factice, posée pour cette
# seule commande. Elle n'est pas embarquée ; le bundle lit la vraie au lancement (--connection ou
# ConnectionStrings__Dogo).
RUN ASPNETCORE_ENVIRONMENT=Production ConnectionStrings__Dogo="Host=build-only" dotnet ef migrations bundle \
        --project src/Dogo.Api --configuration Release --no-build --force --output /app/efbundle

# ---------------------------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_TAG} AS final
WORKDIR /app

# L'image .NET fournit l'utilisateur sans privilèges « app » (uid 1654) et tzdata (Europe/Paris).
# Port 8080 : par défaut dans les images .NET 8 et suivantes, un port sans privilège.
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS=8080 \
    Storage__Local__Path=/data/photos \
    DOTNET_NOLOGO=1

# Dossier des photos (ADR 0010) : propriété de l'utilisateur « app » avant la déclaration du volume,
# pour qu'un volume nommé vide en hérite. Un dossier de l'hôte monté à cet endroit doit appartenir
# à l'uid 1654 (voir docs/deploiement.md).
RUN mkdir -p /data/photos && chown -R app:app /data
VOLUME ["/data/photos"]

# tini, un « init » minuscule (une seule vraie dépendance, 1 Mo environ). Sans lui, dotnet est le
# processus 1 du conteneur : le noyau ignore alors le SIGABRT par lequel .NET se termine sur une
# exception non gérée, et un refus de démarrer (clé absente, configuration refusée...) laisse le
# processus tourner à 100 % du processeur au lieu de quitter. Constaté ; avec tini le conteneur
# s'arrête (code 134), et la politique de redémarrage et les alertes peuvent jouer. tini transmet
# aussi SIGTERM à l'API pour un arrêt propre.
RUN apt-get update \
    && apt-get install --no-install-recommends --yes tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish ./
COPY --from=build /app/efbundle ./efbundle

USER app
EXPOSE 8080

# Ni curl ni wget dans l'image : une requête HTTP/1.0 écrite à la main avec bash. HTTP/1.0 n'envoie
# pas d'en-tête Host, ce que AllowedHosts accepte (sinon il faudrait connaître le nom public).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/${ASPNETCORE_HTTP_PORTS%%;*} && printf 'GET /api/v1/health HTTP/1.0\\r\\n\\r\\n' >&3 && head -n 1 <&3 | grep -q ' 200 '"]

ENTRYPOINT ["/usr/bin/tini", "--", "dotnet", "Dogo.Api.dll"]
