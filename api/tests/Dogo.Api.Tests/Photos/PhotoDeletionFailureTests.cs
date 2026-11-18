using System.Net;
using System.Net.Http.Headers;
using Dogo.Api.Tests.Infrastructure;
using Dogo.Api.Tests.Organizations;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Photos;

/// <summary>A photo file that cannot be removed after the commit must not turn a successful request into an error (ADR 0032).</summary>
public sealed class PhotoDeletionFailureTests(ApiFixture fixture) : OrganizationTestBase(fixture)
{
    [Fact]
    public async Task Account_deletion_succeeds_and_notifies_even_if_photo_files_cannot_be_deleted()
    {
        var (alice, aliceSession) = await SignedInAsync("alice", "Alice");
        var dog = await CreateDogAsync(alice);
        var userPhoto = await UploadAsync(alice, "/api/v1/me/photo");
        var dogPhoto = await UploadAsync(alice, $"/api/v1/dogs/{dog.Id}/photo");
        var (bob, bobId, bobDog) = await DogOwnerAsync("bob");
        await RegisterDeviceAsync(bob, "bob");
        var walk = await CreateWalkAsync(alice, ("title", "Tour du lac"));
        await RegisterOkAsync(bob, walk.Id, bobDog.Id);
        var pushesBefore = (await SentPushesAsync()).Count;
        using var stuckUser = StuckFile(userPhoto);
        using var stuckDog = StuckFile(dogPhoto);

        var response = await alice.DeleteAsync("/api/v1/me", Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.False(await WithDbAsync(db => db.Users.AnyAsync(u => u.Id == aliceSession.User.Id, Ct)));
        var pushes = (await SentPushesAsync()).Skip(pushesBefore).ToList();
        var push = Assert.Single(pushes);
        Assert.Equal(bobId, push.UserId);
        Assert.Equal("walk_cancelled", push.Data["type"]);
    }

    private static async Task<string> UploadAsync(HttpClient client, string url)
    {
        var file = new ByteArrayContent(TestImages.Jpeg());
        file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        using var content = new MultipartFormDataContent { { file, "file", "photo.jpg" } };
        var response = await client.PutAsync(url, content, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await ReadJsonAsync(response)).GetProperty("photoUrl").GetString()!.Split('/')[^1];
    }

    /// <summary>Makes deleting the stored file fail: the file is replaced by a non-empty directory of the same name.</summary>
    private IDisposable StuckFile(string fileName)
    {
        var path = Path.Combine(Factory.PhotoPath, fileName);
        File.Delete(path);
        Directory.CreateDirectory(path);
        File.WriteAllText(Path.Combine(path, "keep"), "x");
        return new Cleanup(() => Directory.Delete(path, recursive: true));
    }

    private sealed class Cleanup(Action action) : IDisposable
    {
        public void Dispose() => action();
    }
}
