using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Text.Json;
using Dogo.Api.Features.Photos;
using Dogo.Api.Infrastructure.Storage;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Features.DemoData;

/// <param name="StoredFiles">Names of the files saved in <see cref="IPhotoStorage"/>, to delete if the generation fails.</param>
internal sealed record DemoPhotoResult(IReadOnlyList<string> StoredFiles, int Failed);

/// <summary>
/// Downloads the demo photos at generation time (ADR 0027), from sources that need no account
/// or key and allow this use:
/// <list type="bullet">
/// <item>people: illustrated avatars of DiceBear's « Notionists » style (CC0 1.0), seeded with the demo subject;</item>
/// <item>dogs: the lead photo of the breed's English Wikipedia article, kept only when hosted on
/// Wikimedia Commons under a free licence (CC0, public domain, CC BY, CC BY-SA, « copyrighted free use »).</item>
/// </list>
/// Requests carry no user data. Each image goes through the checks of uploaded photos (size,
/// real format) before being stored. Any failure only skips that photo.
/// </summary>
public sealed partial class DemoPhotoFetcher(
    IHttpClientFactory httpClientFactory,
    IPhotoStorage storage,
    IOptions<DemoDataOptions> options,
    ILogger<DemoPhotoFetcher> logger)
{
    public const string HttpClientName = "DemoPhotos";

    internal const string AvatarUrl = "https://api.dicebear.com/9.x/notionists/png";
    internal const string WikipediaApiUrl = "https://en.wikipedia.org/w/api.php";
    internal const string CommonsApiUrl = "https://commons.wikimedia.org/w/api.php";

    /// <summary>The MediaWiki APIs accept up to 50 titles per request.</summary>
    private const int TitlesPerRequest = 50;

    private const int ThumbnailWidth = 500;

    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan MaxRetryDelay = TimeSpan.FromSeconds(3);

    private static readonly string[] CommonsHosts = ["upload.wikimedia.org", "thumb.wikimedia.org"];
    private static readonly string[] FreeLicences = ["CC0", "CC BY", "CC-BY", "Public domain", "PD", "Copyrighted free use", "GFDL", "Attribution"];

    internal async Task<DemoPhotoResult> FetchAsync(IReadOnlyList<DemoPhoto> photos, CancellationToken cancellationToken)
    {
        var settings = options.Value.Photos;
        var stopwatch = Stopwatch.StartNew();
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(settings.TotalTimeout);

        var titles = photos.Select(p => p.WikipediaTitle).OfType<string>().Distinct().ToList();
        var breedImages = await FindBreedImagesAsync(titles, budget.Token, cancellationToken);

        var stored = new ConcurrentBag<string>();
        var failed = 0;
        using var avatarGate = new SemaphoreSlim(1, 1);
        var lastAvatar = Stopwatch.StartNew();
        var firstAvatar = true;

        await Parallel.ForEachAsync(
            photos,
            new ParallelOptions { MaxDegreeOfParallelism = Math.Max(1, settings.MaxParallelDownloads), CancellationToken = cancellationToken },
            async (photo, _) =>
            {
                Uri? url;
                if (photo.AvatarSeed is { } seed)
                {
                    url = AvatarUri(seed);

                    // Spaced requests: DiceBear answers 429 above 10 PNG avatars per second.
                    await avatarGate.WaitAsync(cancellationToken);
                    try
                    {
                        var wait = settings.AvatarInterval - lastAvatar.Elapsed;
                        if (!firstAvatar && wait > TimeSpan.Zero)
                        {
                            await Task.Delay(wait, cancellationToken);
                        }

                        firstAvatar = false;
                        lastAvatar.Restart();
                    }
                    finally
                    {
                        avatarGate.Release();
                    }
                }
                else
                {
                    url = breedImages.GetValueOrDefault(photo.WikipediaTitle!);
                }

                var fileName = url is null ? null : await DownloadAsync(url, budget.Token, cancellationToken);
                if (fileName is null)
                {
                    Interlocked.Increment(ref failed);
                    return;
                }

                photo.Assign(fileName);
                stored.Add(fileName);
            });

        LogFetched(stored.Count, failed, stopwatch.ElapsedMilliseconds);
        return new DemoPhotoResult([.. stored], failed);
    }

    internal static Uri AvatarUri(string seed) =>
        new($"{AvatarUrl}?seed={Uri.EscapeDataString(seed)}&size=256&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf");

    /// <summary>Downloads, checks and stores one image; null when anything goes wrong.</summary>
    private async Task<string?> DownloadAsync(Uri url, CancellationToken budget, CancellationToken cancellationToken)
    {
        try
        {
            var response = await SendAsync(url, budget);
            if (response.StatusCode == HttpStatusCode.TooManyRequests)
            {
                // Throttled (Wikimedia limits anonymous clients): one more try after the advised delay.
                var delay = response.Headers.RetryAfter?.Delta ?? RetryDelay;
                response.Dispose();
                await Task.Delay(delay < MaxRetryDelay ? delay : MaxRetryDelay, budget);
                response = await SendAsync(url, budget);
            }

            using var _ = response;
            if (!response.IsSuccessStatusCode)
            {
                LogDownloadFailed(url, $"HTTP {(int)response.StatusCode}");
                return null;
            }

            if (response.Content.Headers.ContentLength > PhotoFormat.MaxSizeBytes)
            {
                LogDownloadFailed(url, "too large");
                return null;
            }

            // Same checks as an uploaded photo: 5 MB at most, a real JPEG, PNG, WebP or HEIC image.
            await using var source = await response.Content.ReadAsStreamAsync(budget);
            var content = await ReadAtMostAsync(source, PhotoFormat.MaxSizeBytes, budget);
            if (content is null || content.Length == 0)
            {
                LogDownloadFailed(url, "empty or too large");
                return null;
            }

            var format = PhotoFormat.Detect(content.GetBuffer().AsSpan(0, (int)Math.Min(content.Length, PhotoFormat.HeaderLength)));
            if (format is null)
            {
                LogDownloadFailed(url, "not a supported image");
                return null;
            }

            content.Position = 0;
            return await storage.SaveAsync(content, format.Extension, cancellationToken);
        }
        catch (Exception e) when ((e is HttpRequestException or OperationCanceledException or IOException) && !cancellationToken.IsCancellationRequested)
        {
            LogDownloadFailed(url, e.GetType().Name);
            return null;
        }
    }

    /// <summary>
    /// Breed article title → URL of its lead photo, for the photos hosted on Commons under a free
    /// licence. Two requests per 50 titles; an empty result when the APIs cannot be reached.
    /// </summary>
    private async Task<Dictionary<string, Uri>> FindBreedImagesAsync(
        IReadOnlyList<string> titles, CancellationToken budget, CancellationToken cancellationToken)
    {
        var images = new Dictionary<string, Uri>();
        try
        {
            foreach (var chunk in titles.Chunk(TitlesPerRequest))
            {
                var leads = await FindLeadImagesAsync(chunk, budget);
                var licences = await FindLicencesAsync(leads.Values.Select(l => l.File).Distinct().ToList(), budget);
                foreach (var (title, (file, url)) in leads)
                {
                    if (licences.TryGetValue(NormalizeFileName(file), out var licence) && IsFreeLicence(licence))
                    {
                        images[title] = url;
                    }
                }
            }
        }
        catch (Exception e) when ((e is HttpRequestException or OperationCanceledException or JsonException or KeyNotFoundException or InvalidOperationException)
            && !cancellationToken.IsCancellationRequested)
        {
            LogLookupFailed(e.GetType().Name);
        }

        return images;
    }

    /// <summary>Requested title → (file name, thumbnail URL) of the article's lead image, following normalisation and redirects.</summary>
    private async Task<Dictionary<string, (string File, Uri Url)>> FindLeadImagesAsync(string[] titles, CancellationToken cancellationToken)
    {
        var query = $"{WikipediaApiUrl}?action=query&format=json&formatversion=2&redirects=1&prop=pageimages&piprop=thumbnail%7Cname"
            + $"&pithumbsize={ThumbnailWidth}&titles={Uri.EscapeDataString(string.Join('|', titles))}";
        using var document = await GetJsonAsync(new Uri(query), cancellationToken);
        var root = document.RootElement.GetProperty("query");

        var renamed = new Dictionary<string, string>();
        foreach (var section in new[] { "normalized", "redirects" })
        {
            if (root.TryGetProperty(section, out var renames))
            {
                foreach (var rename in renames.EnumerateArray())
                {
                    renamed[rename.GetProperty("from").GetString()!] = rename.GetProperty("to").GetString()!;
                }
            }
        }

        var pages = new Dictionary<string, (string File, Uri Url)>();
        foreach (var page in root.GetProperty("pages").EnumerateArray())
        {
            if (page.TryGetProperty("pageimage", out var file)
                && page.TryGetProperty("thumbnail", out var thumbnail)
                && Uri.TryCreate(thumbnail.GetProperty("source").GetString(), UriKind.Absolute, out var url)
                && url.Scheme == Uri.UriSchemeHttps
                && CommonsHosts.Contains(url.Host)
                && url.AbsolutePath.StartsWith("/wikipedia/commons/", StringComparison.Ordinal))
            {
                pages[page.GetProperty("title").GetString()!] = (file.GetString()!, url);
            }
        }

        var result = new Dictionary<string, (string File, Uri Url)>();
        foreach (var title in titles)
        {
            var final = title;
            for (var hops = 0; hops < 3 && renamed.TryGetValue(final, out var next); hops++)
            {
                final = next;
            }

            if (pages.TryGetValue(final, out var image))
            {
                result[title] = image;
            }
        }

        return result;
    }

    /// <summary>Normalised file name → licence short name, as Commons states it.</summary>
    private async Task<Dictionary<string, string>> FindLicencesAsync(IReadOnlyList<string> files, CancellationToken cancellationToken)
    {
        var licences = new Dictionary<string, string>();
        if (files.Count == 0)
        {
            return licences;
        }

        var titles = string.Join('|', files.Select(f => "File:" + f));
        var query = $"{CommonsApiUrl}?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=extmetadata"
            + $"&iiextmetadatafilter=LicenseShortName&titles={Uri.EscapeDataString(titles)}";
        using var document = await GetJsonAsync(new Uri(query), cancellationToken);
        foreach (var page in document.RootElement.GetProperty("query").GetProperty("pages").EnumerateArray())
        {
            if (page.TryGetProperty("imageinfo", out var info)
                && info.GetArrayLength() > 0
                && info[0].TryGetProperty("extmetadata", out var metadata)
                && metadata.TryGetProperty("LicenseShortName", out var licence))
            {
                var title = page.GetProperty("title").GetString()!;
                licences[NormalizeFileName(title["File:".Length..])] = licence.GetProperty("value").GetString() ?? "";
            }
        }

        return licences;
    }

    private async Task<JsonDocument> GetJsonAsync(Uri url, CancellationToken cancellationToken)
    {
        using var response = await SendAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
    }

    private async Task<HttpResponseMessage> SendAsync(Uri url, CancellationToken cancellationToken)
    {
        // The bare request: a generic user agent, no cookie, nothing about the people.
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.TryAddWithoutValidation("User-Agent", options.Value.Photos.UserAgent);
        return await httpClientFactory.CreateClient(HttpClientName)
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
    }

    /// <summary>The whole content, or null as soon as it exceeds <paramref name="maxBytes"/> (a missing or wrong Content-Length is not trusted).</summary>
    private static async Task<MemoryStream?> ReadAtMostAsync(Stream source, long maxBytes, CancellationToken cancellationToken)
    {
        var content = new MemoryStream();
        var buffer = new byte[81920];
        int read;
        while ((read = await source.ReadAsync(buffer, cancellationToken)) > 0)
        {
            if (content.Length + read > maxBytes)
            {
                return null;
            }

            content.Write(buffer, 0, read);
        }

        return content;
    }

    private static string NormalizeFileName(string file) => file.Replace('_', ' ');

    internal static bool IsFreeLicence(string licence)
    {
        var value = licence.Trim();
        return FreeLicences.Any(l => value.StartsWith(l, StringComparison.OrdinalIgnoreCase))
            && !value.Contains("NC", StringComparison.Ordinal)
            && !value.Contains("ND", StringComparison.Ordinal);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Demo photos: {Stored} stored, {Failed} skipped in {ElapsedMilliseconds} ms")]
    private partial void LogFetched(int stored, int failed, long elapsedMilliseconds);

    [LoggerMessage(Level = LogLevel.Debug, Message = "Demo photo skipped ({Reason}): {Url}")]
    private partial void LogDownloadFailed(Uri url, string reason);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Breed photos unavailable: the Wikipedia lookup failed ({Reason}); dogs keep the placeholder")]
    private partial void LogLookupFailed(string reason);
}
