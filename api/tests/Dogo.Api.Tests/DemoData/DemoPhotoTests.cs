using System.Net;
using System.Text.Json;
using Dogo.Api.Features.DemoData;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.DemoData;

/// <summary>Demo photos against fake photo sources: nothing leaves the machine.</summary>
public sealed class DemoPhotoTests(ApiFixture fixture) : DemoDataTestBase(fixture)
{
    /// <summary>The breed whose photo the fake Commons describes as non-free: it must be skipped.</summary>
    private const string NonFreeTitle = "Pug";

    private static int ExpectedPeoplePhotos => 30;

    private static int ExpectedDogPhotos => TableDogCount / 2;

    [Fact]
    public async Task Photos_are_fetched_checked_and_stored_for_half_of_the_people_and_dogs()
    {
        Factory.DemoPhotos.Respond = PhotoSources();

        var result = await GenerateAsync(photos: true);

        // Every dog photo but the non-free one; people get an avatar.
        Assert.True(result.PhotosRequested);
        Assert.Equal(ExpectedPeoplePhotos + ExpectedDogPhotos - 1, result.PhotosStored);
        Assert.Equal(1, result.PhotosFailed);
        Assert.Equal(result.PhotosStored, result.Counts.Photos);
        Assert.Equal(result.PhotosStored, StoredPhotoFiles().Length);

        await WithDbAsync(async db =>
        {
            Assert.Equal(ExpectedPeoplePhotos, await db.Users.CountAsync(u => u.PhotoFileName != null, Ct));
            Assert.Equal(ExpectedDogPhotos - 1, await db.Dogs.CountAsync(d => d.PhotoFileName != null, Ct));
            Assert.Null(await db.Dogs.Where(d => d.Name == "Pruneau").Select(d => d.PhotoFileName).SingleAsync(Ct));

            // One photo per breed: no two dogs share a picture.
            var breeds = await db.Dogs.Where(d => d.PhotoFileName != null).Select(d => d.Breed).ToListAsync(Ct);
            Assert.Equal(breeds.Count, breeds.Distinct().Count());
        });

        // Served like any uploaded photo.
        var marie = (await StatusAsync()).Accounts.Single(a => a.Subject == "demo-marie-schmitt");
        var photo = await CreateClient().GetAsync(marie.PhotoUrl, Ct);
        Assert.Equal(HttpStatusCode.OK, photo.StatusCode);
        Assert.Equal("image/png", photo.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Requests_to_the_photo_sources_carry_no_user_data()
    {
        Factory.DemoPhotos.Respond = PhotoSources();

        await GenerateAsync(photos: true);

        var requests = Factory.DemoPhotos.Requests.ToList();
        Assert.All(requests, r =>
        {
            Assert.Equal(HttpMethod.Get, r.Method);
            Assert.Equal("https", r.RequestUri!.Scheme);
            Assert.Null(r.Headers.Authorization);
            Assert.False(r.Headers.Contains("Cookie"));
            Assert.Equal("dogo-demo-data/1.0 (development seed data)", string.Join(" ", r.Headers.GetValues("User-Agent")));
            Assert.Contains(r.RequestUri.Host, new[] { "api.dicebear.com", "en.wikipedia.org", "commons.wikimedia.org", "upload.wikimedia.org" });
        });

        // Avatars are seeded with the fictional demo subject only; the Wikipedia lookups take two requests.
        var avatars = requests.Where(r => r.RequestUri!.Host == "api.dicebear.com").ToList();
        Assert.Equal(ExpectedPeoplePhotos, avatars.Count);
        Assert.All(avatars, r => Assert.StartsWith("demo-", QueryHelpers.ParseQuery(r.RequestUri!.Query)["seed"].ToString(), StringComparison.Ordinal));
        Assert.Single(requests, r => r.RequestUri!.Host == "en.wikipedia.org");
        Assert.Single(requests, r => r.RequestUri!.Host == "commons.wikimedia.org");
    }

    [Fact]
    public async Task Network_errors_and_invalid_images_never_make_the_generation_fail()
    {
        var sources = PhotoSources();
        var count = 0;
        Factory.DemoPhotos.Respond = request =>
        {
            var n = Interlocked.Increment(ref count);
            return request.RequestUri!.Host switch
            {
                "en.wikipedia.org" or "commons.wikimedia.org" => sources(request),
                _ when n % 3 == 0 => throw new HttpRequestException("Connection reset"),
                _ when n % 3 == 1 => FakeDemoPhotoServer.Image(TestImages.Text(), "image/png"),
                _ => sources(request),
            };
        };

        var result = await GenerateAsync(photos: true);

        Assert.True(result.PhotosStored > 0);
        Assert.True(result.PhotosFailed > ExpectedPeoplePhotos / 2);
        Assert.Equal(ExpectedPeoplePhotos + ExpectedDogPhotos, result.PhotosStored + result.PhotosFailed);
        Assert.Equal(result.PhotosStored, StoredPhotoFiles().Length);
        Assert.Equal(60, result.Counts.Owners + result.Counts.Educators);
    }

    [Fact]
    public async Task An_unreachable_wikipedia_only_skips_the_dog_photos()
    {
        var sources = PhotoSources();
        Factory.DemoPhotos.Respond = request => request.RequestUri!.Host == "en.wikipedia.org"
            ? new HttpResponseMessage(HttpStatusCode.TooManyRequests)
            : sources(request);

        var result = await GenerateAsync(photos: true);

        Assert.Equal(ExpectedPeoplePhotos, result.PhotosStored);
        Assert.Equal(ExpectedDogPhotos, result.PhotosFailed);
    }

    [Fact]
    public async Task A_throttled_download_is_tried_once_more()
    {
        var sources = PhotoSources();
        var throttled = new System.Collections.Concurrent.ConcurrentDictionary<string, int>();
        Factory.DemoPhotos.Respond = request =>
        {
            var url = request.RequestUri!.ToString();
            if (request.RequestUri.Host == "upload.wikimedia.org" && throttled.AddOrUpdate(url, 1, (_, n) => n + 1) == 1)
            {
                return new HttpResponseMessage(HttpStatusCode.TooManyRequests) { Headers = { RetryAfter = new(TimeSpan.Zero) } };
            }

            return sources(request);
        };

        var result = await GenerateAsync(photos: true);

        Assert.Equal(ExpectedPeoplePhotos + ExpectedDogPhotos - 1, result.PhotosStored);
        Assert.All(throttled.Values, n => Assert.Equal(2, n));
    }

    [Fact]
    public async Task Removal_and_regeneration_delete_the_photo_files_of_demo_accounts()
    {
        Factory.DemoPhotos.Respond = PhotoSources();
        await GenerateAsync(photos: true);
        var first = StoredPhotoFiles();
        Assert.NotEmpty(first);

        await GenerateAsync(photos: true);
        var second = StoredPhotoFiles();
        Assert.Equal(first.Length, second.Length);
        Assert.Empty(first.Intersect(second));

        await RemoveAsync();
        Assert.Empty(StoredPhotoFiles());
    }

    [Fact]
    public async Task Removal_keeps_the_photos_of_other_accounts()
    {
        var (owner, _) = await SignedInAsync("dev-user-1", "Camille Test");
        using var content = new MultipartFormDataContent { { new ByteArrayContent(TestImages.Jpeg()), "file", "me.jpg" } };
        Assert.Equal(HttpStatusCode.OK, (await owner.PutAsync("/api/v1/me/photo", content, Ct)).StatusCode);
        Factory.DemoPhotos.Respond = PhotoSources();
        await GenerateAsync(photos: true);

        await RemoveAsync();

        var file = Assert.Single(StoredPhotoFiles());
        Assert.Equal(await WithDbAsync(db => db.Users.Select(u => u.PhotoFileName).SingleAsync(Ct)), Path.GetFileName(file));
    }

    [Theory]
    [InlineData("CC BY-SA 4.0", true)]
    [InlineData("CC BY 2.0", true)]
    [InlineData("CC0", true)]
    [InlineData("Public domain", true)]
    [InlineData("Copyrighted free use", true)]
    [InlineData("CC BY-NC 2.0", false)]
    [InlineData("CC BY-ND 3.0", false)]
    [InlineData("Fair use", false)]
    [InlineData("", false)]
    public void Only_free_licences_are_accepted(string licence, bool free) =>
        Assert.Equal(free, DemoPhotoFetcher.IsFreeLicence(licence));

    /// <summary>
    /// Fake DiceBear (PNG avatars), Wikipedia (a Commons thumbnail per article), Commons (a free
    /// licence, except for <see cref="NonFreeTitle"/>) and Commons thumbnails (JPEG photos).
    /// </summary>
    private static Func<HttpRequestMessage, HttpResponseMessage> PhotoSources() => request =>
    {
        var uri = request.RequestUri!;
        var query = QueryHelpers.ParseQuery(uri.Query);
        switch (uri.Host)
        {
            case "api.dicebear.com":
                return FakeDemoPhotoServer.Image(TestImages.Png(2048));
            case "en.wikipedia.org":
                var pages = query["titles"].ToString().Split('|').Select(title => new
                {
                    title,
                    pageimage = FileName(title),
                    thumbnail = new { source = $"https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/{FileName(title)}/500px-{FileName(title)}" },
                });
                return FakeDemoPhotoServer.Json(JsonSerializer.Serialize(new { batchcomplete = true, query = new { pages } }));
            case "commons.wikimedia.org":
                var files = query["titles"].ToString().Split('|').Select(title => new
                {
                    title = title.Replace('_', ' '),
                    imageinfo = new[]
                    {
                        new { extmetadata = new { LicenseShortName = new { value = title.Contains(FileName(NonFreeTitle), StringComparison.Ordinal) ? "Fair use" : "CC BY-SA 4.0" } } },
                    },
                });
                return FakeDemoPhotoServer.Json(JsonSerializer.Serialize(new { batchcomplete = true, query = new { pages = files } }));
            case "upload.wikimedia.org":
                return FakeDemoPhotoServer.Image(TestImages.Jpeg(4096), "image/jpeg");
            default:
                return new HttpResponseMessage(HttpStatusCode.NotFound);
        }
    };

    private static string FileName(string title) => title.Replace(' ', '_').Replace("(", "", StringComparison.Ordinal).Replace(")", "", StringComparison.Ordinal) + ".jpg";
}
