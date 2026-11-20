using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Dogs;
using Dogo.Api.Features.Users;
using Dogo.Api.Tests.Infrastructure;

namespace Dogo.Api.Tests.Users;

/// <summary>Spec §4.1: the public profile shows displayName, bio, photoUrl and the dogs, never the e-mail.</summary>
public sealed class PublicProfileTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    [Fact]
    public async Task Public_profile_shows_the_user_and_their_dogs_without_email()
    {
        var signIn = await CreateClient().PostAsJsonAsync("/api/v1/auth/google", new { idToken = FakeIdentityTokenValidator.Token("sub", "owner@gmail.com", "Owner") }, Ct);
        var owner = (await signIn.Content.ReadFromJsonAsync<Dogo.Api.Features.Auth.SessionResponse>(Json, Ct))!;
        var ownerClient = CreateClient(owner.AccessToken);
        await ownerClient.PatchAsJsonAsync("/api/v1/me", new { bio = "Hi" }, Ct);
        var rex = await CreateDogAsync(ownerClient, ValidDog("Rex"));
        var nala = await CreateDogAsync(ownerClient, ValidDog("Nala"));
        var (visitor, _) = await SignedInAsync("visitor", "Visitor");

        var response = await visitor.GetAsync($"/api/v1/users/{owner.User.Id}", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.Equal(["id", "displayName", "bio", "photoUrl", "dogs"], body.EnumerateObject().Select(p => p.Name));
        Assert.Equal("Owner", body.GetProperty("displayName").GetString());
        Assert.Equal("Hi", body.GetProperty("bio").GetString());
        Assert.Equal([rex.Id, nala.Id], body.GetProperty("dogs").EnumerateArray().Select(d => d.GetProperty("id").GetGuid()));
        Assert.DoesNotContain("owner@gmail.com", body.GetRawText(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Public_profile_dogs_list_the_profile_user_as_their_owner()
    {
        var (ownerClient, owner) = await SignedInAsync("owner", "Owner");
        await SetUserPhotoAsync(owner.User.Id, "owner123.jpg");
        await CreateDogAsync(ownerClient, ValidDog("Rex"));
        await CreateDogAsync(ownerClient, ValidDog("Nala"));
        var (visitor, _) = await SignedInAsync("visitor", "Visitor");

        var profile = (await visitor.GetFromJsonAsync<PublicUserResponse>($"/api/v1/users/{owner.User.Id}", Json, Ct))!;

        Assert.Equal(2, profile.Dogs.Count);
        Assert.All(profile.Dogs, d => AssertOwnedBy(d, owner.User.Id, "Owner", "/photos/owner123.jpg"));
    }

    [Fact]
    public async Task Unknown_user_returns_404()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.GetAsync($"/api/v1/users/{Guid.NewGuid()}", Ct);

        await AssertProblemAsync(response, HttpStatusCode.NotFound, "user.not_found");
    }

    [Fact]
    public async Task Public_profile_requires_authentication()
    {
        var session = await SignInDevAsync();

        var response = await CreateClient().GetAsync($"/api/v1/users/{session.User.Id}", Ct);

        await AssertProblemAsync(response, HttpStatusCode.Unauthorized, "auth.unauthenticated");
    }
}
