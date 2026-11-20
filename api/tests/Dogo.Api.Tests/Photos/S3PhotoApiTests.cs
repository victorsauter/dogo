using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Amazon.S3.Model;
using Dogo.Api.Features.Users;
using Dogo.Api.Tests.Infrastructure;

namespace Dogo.Api.Tests.Photos;

/// <summary>
/// The photo endpoints on top of the S3 storage (<c>Storage:Provider=S3</c>, ADR 0043): the client sees no difference,
/// the bytes come from the bucket, and replacing a photo removes the previous object.
/// </summary>
public sealed class S3PhotoApiTests(ApiFixture fixture, MinioFixture minio) : ApiTestBase(fixture), IClassFixture<MinioFixture>
{
    private static MultipartFormDataContent PhotoContent(byte[] bytes)
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        return new MultipartFormDataContent { { file, "file", "photo.jpg" } };
    }

    [Fact]
    public async Task Photos_are_stored_in_the_bucket_served_by_the_api_and_replaced_cleanly()
    {
        var options = await minio.CreateBucketAsync(Ct);
        using var bucket = MinioFixture.CreateClient(options);
        // The token comes from the regular test host (same database, same signing key).
        var session = await SignInDevAsync();
        await using var host = new DogoApiFactory(Fixture.ConnectionString, new Dictionary<string, string?>
        {
            ["Storage:Provider"] = "S3",
            ["Storage:S3:ServiceUrl"] = options.ServiceUrl,
            ["Storage:S3:Bucket"] = options.Bucket,
            ["Storage:S3:Region"] = options.Region,
            ["Storage:S3:AccessKeyId"] = options.AccessKeyId,
            ["Storage:S3:SecretAccessKey"] = options.SecretAccessKey,
        });
        var client = host.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);

        var first = (await (await client.PutAsync("/api/v1/me/photo", PhotoContent(TestImages.Jpeg()), Ct)).Content.ReadFromJsonAsync<MeResponse>(Json, Ct))!;

        Assert.Matches("^/photos/[0-9a-f]{32}\\.jpg$", first.PhotoUrl);
        var served = await client.GetAsync(first.PhotoUrl, Ct);
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal("image/jpeg", served.Content.Headers.ContentType?.MediaType);
        Assert.True(served.Headers.CacheControl!.Private);
        Assert.Equal(TimeSpan.FromDays(1), served.Headers.CacheControl.MaxAge);
        Assert.Equal(new byte[] { 0xFF, 0xD8, 0xFF }, (await served.Content.ReadAsByteArrayAsync(Ct))[..3]);
        Assert.False(Directory.Exists(host.PhotoPath), "nothing is written to the local disk");
        var keys = (await bucket.ListObjectsV2Async(new ListObjectsV2Request { BucketName = options.Bucket }, Ct)).S3Objects!.Select(o => o.Key).ToList();
        Assert.Equal([first.PhotoUrl!.Split('/')[^1]], keys);

        var second = (await (await client.PutAsync("/api/v1/me/photo", PhotoContent(TestImages.Jpeg()), Ct)).Content.ReadFromJsonAsync<MeResponse>(Json, Ct))!;

        Assert.NotEqual(first.PhotoUrl, second.PhotoUrl);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(first.PhotoUrl, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(second.PhotoUrl, Ct)).StatusCode);
        var remaining = (await bucket.ListObjectsV2Async(new ListObjectsV2Request { BucketName = options.Bucket }, Ct)).S3Objects!.Select(o => o.Key).ToList();
        Assert.Equal([second.PhotoUrl!.Split('/')[^1]], remaining);
    }

    [Fact]
    public async Task An_unknown_or_invalid_photo_name_is_404()
    {
        var options = await minio.CreateBucketAsync(Ct);
        await using var host = new DogoApiFactory(Fixture.ConnectionString, new Dictionary<string, string?>
        {
            ["Storage:Provider"] = "S3",
            ["Storage:S3:ServiceUrl"] = options.ServiceUrl,
            ["Storage:S3:Bucket"] = options.Bucket,
            ["Storage:S3:Region"] = options.Region,
            ["Storage:S3:AccessKeyId"] = options.AccessKeyId,
            ["Storage:S3:SecretAccessKey"] = options.SecretAccessKey,
        });
        var client = host.CreateClient();

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/photos/{Guid.NewGuid():N}.jpg", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/photos/not-a-photo.jpg", Ct)).StatusCode);
    }
}
