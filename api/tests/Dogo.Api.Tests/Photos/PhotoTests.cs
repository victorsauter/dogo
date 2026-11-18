using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Dogo.Api.Features.Dogs;
using Dogo.Api.Features.Users;
using Dogo.Api.Tests.Infrastructure;

namespace Dogo.Api.Tests.Photos;

public sealed class PhotoTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    public static TheoryData<string, string> AcceptedFormats => new()
    {
        { "jpeg", ".jpg" },
        { "png", ".png" },
        { "webp", ".webp" },
        { "heic", ".heic" },
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

        var served = await CreateClient().GetAsync(me.PhotoUrl, Ct);
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal(bytes, await served.Content.ReadAsByteArrayAsync(Ct));
        Assert.StartsWith("image/", served.Content.Headers.ContentType?.MediaType, StringComparison.Ordinal);
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
