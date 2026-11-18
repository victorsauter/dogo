using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Users;
using Dogo.Api.Tests.Infrastructure;

namespace Dogo.Api.Tests.Users;

public sealed class MeTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    [Fact]
    public async Task Get_me_returns_the_private_profile_with_the_email()
    {
        var signIn = await CreateClient().PostAsJsonAsync("/api/v1/auth/google", new { idToken = FakeIdentityTokenValidator.Token("sub", "carol@gmail.com", "Carol") }, Ct);
        var session = (await signIn.Content.ReadFromJsonAsync<Dogo.Api.Features.Auth.SessionResponse>(Json, Ct))!;

        var response = await CreateClient(session.AccessToken).GetAsync("/api/v1/me", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var me = (await response.Content.ReadFromJsonAsync<MeResponse>(Json, Ct))!;
        Assert.Equal(session.User.Id, me.Id);
        Assert.Equal("Carol", me.DisplayName);
        Assert.Equal("", me.Bio);
        Assert.Null(me.PhotoUrl);
        Assert.Equal("carol@gmail.com", me.Email);
        Assert.Equal(UserStatus.Active, me.Status);
        Assert.False(me.IsAdmin);
        Assert.InRange(me.CreatedAt, DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddSeconds(1));
    }

    [Fact]
    public async Task Patch_me_updates_the_given_fields_only()
    {
        var (client, _) = await SignedInAsync(displayName: "Alice");

        var bio = await client.PatchAsJsonAsync("/api/v1/me", new { bio = "  Two dogs, one bike.  " }, Ct);
        var name = await client.PatchAsJsonAsync("/api/v1/me", new { displayName = " Alice M. " }, Ct);

        Assert.Equal(HttpStatusCode.OK, bio.StatusCode);
        Assert.Equal(HttpStatusCode.OK, name.StatusCode);
        var me = (await client.GetFromJsonAsync<MeResponse>("/api/v1/me", Json, Ct))!;
        Assert.Equal("Alice M.", me.DisplayName);
        Assert.Equal("Two dogs, one bike.", me.Bio);
    }

    [Fact]
    public async Task Patch_me_clears_the_bio_with_an_empty_string()
    {
        var (client, _) = await SignedInAsync();
        await client.PatchAsJsonAsync("/api/v1/me", new { bio = "Hello" }, Ct);

        var response = await client.PatchAsJsonAsync("/api/v1/me", new { bio = "" }, Ct);

        Assert.Equal("", (await response.Content.ReadFromJsonAsync<MeResponse>(Json, Ct))!.Bio);
    }

    [Fact]
    public async Task Patch_me_validates_lengths_and_blank_names()
    {
        var (client, _) = await SignedInAsync();

        var tooLong = await client.PatchAsJsonAsync("/api/v1/me", new { displayName = new string('a', 51), bio = new string('b', 501) }, Ct);
        var blank = await client.PatchAsJsonAsync("/api/v1/me", new { displayName = "   " }, Ct);

        await AssertValidationProblemAsync(tooLong, "displayName", "bio");
        await AssertValidationProblemAsync(blank, "displayName");
    }

    [Fact]
    public async Task Me_requires_authentication()
    {
        await AssertProblemAsync(await CreateClient().GetAsync("/api/v1/me", Ct), HttpStatusCode.Unauthorized, "auth.unauthenticated");
        await AssertProblemAsync(await CreateClient().PatchAsJsonAsync("/api/v1/me", new { bio = "x" }, Ct), HttpStatusCode.Unauthorized, "auth.unauthenticated");
    }
}
