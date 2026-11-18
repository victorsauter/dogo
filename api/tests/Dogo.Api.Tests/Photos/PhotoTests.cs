using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Dogo.Api.Features.Dogs;
using Dogo.Api.Features.Users;
using Dogo.Api.Tests.Infrastructure;
using SkiaSharp;

namespace Dogo.Api.Tests.Photos;

public sealed class PhotoTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    public static TheoryData<string, string> AcceptedFormats => new()
    {
        { "jpeg", ".jpg" },
        { "png", ".png" },
        { "webp", ".webp" },
    };

    [Theory]
    [MemberData(nameof(AcceptedFormats))]
    public async Task User_photo_is_stored_and_served_publicly(string format, string extension)
    {
        var (client, _) = await SignedInAsync();
        var bytes = Image(format);

        var response = await client.PutAsync("/api/v1/me/photo", PhotoContent(bytes, "image/whatever"), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var me = (await response.Content.ReadFromJsonAsync<MeResponse>(Json, Ct))!;
        Assert.Matches($"^/photos/[0-9a-f]{{32}}\\{extension}$", me.PhotoUrl);
        Assert.Equal(me.PhotoUrl, (await client.GetFromJsonAsync<MeResponse>("/api/v1/me", Json, Ct))!.PhotoUrl);

        // The stored file is the cleaned image, in the same format.
        var served = await CreateClient().GetAsync(me.PhotoUrl, Ct);
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        using var stored = SKBitmap.Decode(await served.Content.ReadAsByteArrayAsync(Ct));
        Assert.Equal((64, 64), (stored.Width, stored.Height));
        Assert.Equal(format == "jpeg" ? "image/jpeg" : $"image/{format}", served.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Photos_are_served_with_a_private_cache_and_hardening_headers()
    {
        var (client, _) = await SignedInAsync();
        var me = (await (await client.PutAsync("/api/v1/me/photo", PhotoContent(TestImages.Jpeg()), Ct)).Content.ReadFromJsonAsync<MeResponse>(Json, Ct))!;

        var served = await CreateClient().GetAsync(me.PhotoUrl, Ct);

        var cache = served.Headers.CacheControl!;
        Assert.True(cache.Private);
        Assert.False(cache.Public);
        Assert.Equal(TimeSpan.FromDays(1), cache.MaxAge);
        Assert.Equal("nosniff", Assert.Single(served.Headers.GetValues("X-Content-Type-Options")));
        Assert.Equal("default-src 'none'; sandbox", Assert.Single(served.Headers.GetValues("Content-Security-Policy")));
    }

    [Fact]
    public async Task Uploaded_photo_loses_its_metadata_including_the_GPS_position()
    {
        var (client, _) = await SignedInAsync();
        var original = TestImages.JpegWithMetadata();
        Assert.True(TestImages.Contains(original, TestImages.GpsMarker) && TestImages.Contains(original, TestImages.CommentMarker));
        Assert.Contains((byte)0xE1, TestImages.JpegMarkers(original));

        var response = await client.PutAsync("/api/v1/me/photo", PhotoContent(original), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var me = (await response.Content.ReadFromJsonAsync<MeResponse>(Json, Ct))!;
        var served = await (await CreateClient().GetAsync(me.PhotoUrl, Ct)).Content.ReadAsByteArrayAsync(Ct);
        Assert.Equal(new byte[] { 0xFF, 0xD8, 0xFF }, served[..3]);
        foreach (var marker in new[] { TestImages.GpsMarker, TestImages.XmpMarker, TestImages.IptcMarker, TestImages.CommentMarker, "GPS" })
        {
            Assert.False(TestImages.Contains(served, marker), marker);
        }

        // No EXIF/XMP (APP1), IPTC (APP13) or comment segment.
        Assert.Empty(TestImages.JpegMarkers(served).Intersect(new byte[] { 0xE1, 0xED, 0xFE }));
    }

    [Fact]
    public async Task Dog_photo_is_cleaned_too()
    {
        var (client, _) = await SignedInAsync();
        var dog = await CreateDogAsync(client);

        var response = await client.PutAsync($"/api/v1/dogs/{dog.Id}/photo", PhotoContent(TestImages.JpegWithMetadata()), Ct);

        var updated = (await response.Content.ReadFromJsonAsync<DogResponse>(Json, Ct))!;
        var served = await (await CreateClient().GetAsync(updated.PhotoUrl, Ct)).Content.ReadAsByteArrayAsync(Ct);
        Assert.False(TestImages.Contains(served, TestImages.GpsMarker));
        Assert.False(TestImages.Contains(served, TestImages.CommentMarker));
    }

    // Source image quadrants: red, green / blue, yellow. Expected upright result per EXIF orientation 1 to 8:
    // dimensions (the 40 x 20 source is turned for 5 to 8) and the colours of top-left, top-right, bottom-left, bottom-right.
    public static TheoryData<int, int, int, string> Orientations => new()
    {
        { 1, 40, 20, "RGBY" },
        { 2, 40, 20, "GRYB" },
        { 3, 40, 20, "YBGR" },
        { 4, 40, 20, "BYRG" },
        { 5, 20, 40, "RBGY" },
        { 6, 20, 40, "BRYG" },
        { 7, 20, 40, "YGBR" },
        { 8, 20, 40, "GYRB" },
    };

    [Theory]
    [MemberData(nameof(Orientations))]
    public async Task Orientation_is_applied_to_the_pixels_before_the_metadata_is_removed(int orientation, int width, int height, string quadrants)
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PutAsync("/api/v1/me/photo", PhotoContent(TestImages.JpegWithMetadata(orientation)), Ct);

        var me = (await response.Content.ReadFromJsonAsync<MeResponse>(Json, Ct))!;
        var served = await (await CreateClient().GetAsync(me.PhotoUrl, Ct)).Content.ReadAsByteArrayAsync(Ct);
        using var codec = SKCodec.Create(new SKMemoryStream(served));
        Assert.Equal(SKEncodedOrigin.TopLeft, codec.EncodedOrigin);
        using var bitmap = SKBitmap.Decode(served);
        Assert.Equal((width, height), (bitmap.Width, bitmap.Height));
        var names = new Dictionary<SKColor, char>
        {
            [TestImages.Red] = 'R', [TestImages.Green] = 'G', [TestImages.Blue] = 'B', [TestImages.Yellow] = 'Y',
        };
        var actual = new string(new[] { (0, 0), (1, 0), (0, 1), (1, 1) }
            .Select(q => names[TestImages.Nearest(TestImages.QuadrantColor(bitmap, q.Item1, q.Item2))]).ToArray());
        Assert.Equal(quadrants, actual);
    }

    [Fact]
    public async Task Large_photo_is_scaled_down_keeping_its_proportions()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PutAsync("/api/v1/me/photo", PhotoContent(TestImages.SolidJpeg(4000, 3000)), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var me = (await response.Content.ReadFromJsonAsync<MeResponse>(Json, Ct))!;
        using var bitmap = SKBitmap.Decode(await (await CreateClient().GetAsync(me.PhotoUrl, Ct)).Content.ReadAsByteArrayAsync(Ct));
        Assert.Equal((2048, 1536), (bitmap.Width, bitmap.Height));
    }

    [Fact]
    public async Task Image_with_too_many_pixels_is_rejected()
    {
        var (client, _) = await SignedInAsync();
        var bomb = TestImages.LargePng(7000, 6000); // 42 MP, a few dozen KB

        Assert.True(bomb.Length < 5 * 1024 * 1024);
        var response = await client.PutAsync("/api/v1/me/photo", PhotoContent(bomb, "image/png"), Ct);

        await AssertProblemAsync(response, HttpStatusCode.RequestEntityTooLarge, "photo.too_large");
        Assert.False(Directory.Exists(Factory.PhotoPath) && Directory.GetFiles(Factory.PhotoPath).Length > 0);
    }

    [Fact]
    public async Task Image_just_under_the_pixel_limit_is_accepted()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PutAsync("/api/v1/me/photo", PhotoContent(TestImages.LargePng(6000, 6000), "image/png"), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData("broken-jpeg")]
    [InlineData("broken-png")]
    [InlineData("truncated-jpeg")]
    public async Task Valid_header_with_undecodable_content_is_rejected(string kind)
    {
        var (client, _) = await SignedInAsync();
        var content = kind switch
        {
            "broken-jpeg" => TestImages.BrokenJpeg(),
            "broken-png" => TestImages.BrokenPng(),
            _ => TestImages.TruncatedJpeg(),
        };

        var response = await client.PutAsync("/api/v1/me/photo", PhotoContent(content), Ct);

        await AssertProblemAsync(response, HttpStatusCode.UnsupportedMediaType, "photo.unsupported_type");
        Assert.False(Directory.Exists(Factory.PhotoPath) && Directory.GetFiles(Factory.PhotoPath).Length > 0);
    }

    [Fact]
    public async Task A_stored_file_that_cannot_be_deleted_does_not_fail_the_replacement()
    {
        var (client, _) = await SignedInAsync();
        var first = (await (await client.PutAsync("/api/v1/me/photo", PhotoContent(TestImages.Jpeg()), Ct)).Content.ReadFromJsonAsync<MeResponse>(Json, Ct))!;
        using var stuck = StuckFile(first.PhotoUrl!);

        var response = await client.PutAsync("/api/v1/me/photo", PhotoContent(TestImages.Png()), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var second = (await response.Content.ReadFromJsonAsync<MeResponse>(Json, Ct))!;
        Assert.NotEqual(first.PhotoUrl, second.PhotoUrl);
        Assert.Equal(second.PhotoUrl, (await client.GetFromJsonAsync<MeResponse>("/api/v1/me", Json, Ct))!.PhotoUrl);
    }

    [Fact]
    public async Task A_stored_file_that_cannot_be_deleted_does_not_fail_the_deletion_of_a_dog()
    {
        var (client, _) = await SignedInAsync();
        var dog = await CreateDogAsync(client);
        var withPhoto = (await (await client.PutAsync($"/api/v1/dogs/{dog.Id}/photo", PhotoContent(TestImages.Jpeg()), Ct)).Content.ReadFromJsonAsync<DogResponse>(Json, Ct))!;
        using var stuck = StuckFile(withPhoto.PhotoUrl!);

        var response = await client.DeleteAsync($"/api/v1/dogs/{dog.Id}", Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    /// <summary>Makes deleting the stored file fail: the file is replaced by a non-empty directory of the same name.</summary>
    private IDisposable StuckFile(string photoUrl)
    {
        var path = Path.Combine(Factory.PhotoPath, photoUrl.Split('/')[^1]);
        File.Delete(path);
        Directory.CreateDirectory(path);
        File.WriteAllText(Path.Combine(path, "keep"), "x");
        return new Cleanup(() => Directory.Delete(path, recursive: true));
    }

    private sealed class Cleanup(Action action) : IDisposable
    {
        public void Dispose() => action();
    }

    [Fact]
    public async Task Replacing_a_photo_deletes_the_previous_file()
    {
        var (client, _) = await SignedInAsync();
        var first = (await (await client.PutAsync("/api/v1/me/photo", PhotoContent(TestImages.Jpeg()), Ct)).Content.ReadFromJsonAsync<MeResponse>(Json, Ct))!;

        var second = (await (await client.PutAsync("/api/v1/me/photo", PhotoContent(TestImages.Png()), Ct)).Content.ReadFromJsonAsync<MeResponse>(Json, Ct))!;

        Assert.NotEqual(first.PhotoUrl, second.PhotoUrl);
        await AssertProblemAsync(await CreateClient().GetAsync(first.PhotoUrl, Ct), HttpStatusCode.NotFound, "photo.not_found");
        Assert.Single(Directory.GetFiles(Factory.PhotoPath));
    }

    [Theory]
    [InlineData("gif")]
    [InlineData("text")]
    [InlineData("heic")]
    public async Task Photo_is_checked_by_content_not_by_declared_type(string format)
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PutAsync("/api/v1/me/photo", PhotoContent(Image(format), "image/jpeg"), Ct);

        await AssertProblemAsync(response, HttpStatusCode.UnsupportedMediaType, "photo.unsupported_type");
        Assert.False(Directory.Exists(Factory.PhotoPath) && Directory.GetFiles(Factory.PhotoPath).Length > 0);
    }

    [Fact]
    public async Task Photo_of_exactly_5_MB_is_accepted()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PutAsync("/api/v1/me/photo", PhotoContent(TestImages.Jpeg(5 * 1024 * 1024)), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Photo_over_5_MB_is_rejected()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PutAsync("/api/v1/me/photo", PhotoContent(TestImages.Jpeg((5 * 1024 * 1024) + 1)), Ct);

        await AssertProblemAsync(response, HttpStatusCode.RequestEntityTooLarge, "photo.too_large");
    }

    [Fact]
    public async Task Request_far_over_the_limit_is_rejected()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PutAsync("/api/v1/me/photo", PhotoContent(TestImages.Jpeg(8 * 1024 * 1024)), Ct);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
    }

    [Fact]
    public async Task Missing_file_is_a_validation_error()
    {
        var (client, _) = await SignedInAsync();
        using var content = new MultipartFormDataContent { { new StringContent("x"), "other" } };

        var response = await client.PutAsync("/api/v1/me/photo", content, Ct);

        await AssertValidationProblemAsync(response, "file");
    }

    [Fact]
    public async Task Photo_upload_requires_authentication()
    {
        var response = await CreateClient().PutAsync("/api/v1/me/photo", PhotoContent(TestImages.Jpeg()), Ct);

        await AssertProblemAsync(response, HttpStatusCode.Unauthorized, "auth.unauthenticated");
    }

    [Fact]
    public async Task Owner_uploads_a_dog_photo()
    {
        var (client, _) = await SignedInAsync();
        var dog = await CreateDogAsync(client);

        var response = await client.PutAsync($"/api/v1/dogs/{dog.Id}/photo", PhotoContent(TestImages.WebP()), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = (await response.Content.ReadFromJsonAsync<DogResponse>(Json, Ct))!;
        Assert.EndsWith(".webp", updated.PhotoUrl, StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.OK, (await CreateClient().GetAsync(updated.PhotoUrl, Ct)).StatusCode);
    }

    [Fact]
    public async Task Only_the_owner_uploads_a_dog_photo()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var dog = await CreateDogAsync(owner);
        var (other, _) = await SignedInAsync("other", "Other");

        var response = await other.PutAsync($"/api/v1/dogs/{dog.Id}/photo", PhotoContent(TestImages.Jpeg()), Ct);

        await AssertProblemAsync(response, HttpStatusCode.Forbidden, "dog.forbidden");
    }

    [Fact]
    public async Task Photo_of_an_unknown_dog_returns_404()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PutAsync($"/api/v1/dogs/{Guid.NewGuid()}/photo", PhotoContent(TestImages.Jpeg()), Ct);

        await AssertProblemAsync(response, HttpStatusCode.NotFound, "dog.not_found");
    }

    [Fact]
    public async Task Deleting_a_dog_deletes_its_photo()
    {
        var (client, _) = await SignedInAsync();
        var dog = await CreateDogAsync(client);
        var withPhoto = (await (await client.PutAsync($"/api/v1/dogs/{dog.Id}/photo", PhotoContent(TestImages.Jpeg()), Ct)).Content.ReadFromJsonAsync<DogResponse>(Json, Ct))!;

        await client.DeleteAsync($"/api/v1/dogs/{dog.Id}", Ct);

        await AssertProblemAsync(await CreateClient().GetAsync(withPhoto.PhotoUrl, Ct), HttpStatusCode.NotFound, "photo.not_found");
    }

    [Theory]
    [InlineData("/photos/unknown.jpg")]
    [InlineData("/photos/0123456789abcdef0123456789abcdef.jpg")]
    [InlineData("/photos/..%2Fappsettings.json")]
    public async Task Unknown_or_invalid_photo_names_return_404(string url)
    {
        var response = await CreateClient().GetAsync(url, Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private static byte[] Image(string format) => format switch
    {
        "jpeg" => TestImages.Jpeg(),
        "png" => TestImages.Png(),
        "webp" => TestImages.WebP(),
        "heic" => TestImages.Heic(),
        "gif" => TestImages.Gif(),
        _ => TestImages.Text(),
    };

    private static MultipartFormDataContent PhotoContent(byte[] bytes, string contentType = "image/jpeg")
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return new MultipartFormDataContent { { file, "file", "photo.bin" } };
    }
}
