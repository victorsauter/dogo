using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Users;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Auth;

public sealed class DevLoginTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    [Fact]
    public async Task Dev_login_creates_the_account_and_returns_the_session_shape()
    {
        var before = DateTimeOffset.UtcNow;

        var response = await CreateClient().PostAsJsonAsync("/api/v1/auth/dev", new { subject = "alice", displayName = "Alice" }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.Equal(["accessToken", "accessTokenExpiresAt", "refreshToken", "user"], body.EnumerateObject().Select(p => p.Name));
        Assert.Equal(
            ["id", "displayName", "bio", "photoUrl", "email", "status", "isAdmin", "createdAt"],
            body.GetProperty("user").EnumerateObject().Select(p => p.Name));
        Assert.Equal("Alice", body.GetProperty("user").GetProperty("displayName").GetString());
        Assert.Equal("Active", body.GetProperty("user").GetProperty("status").GetString());

        var expiresAt = body.GetProperty("accessTokenExpiresAt").GetDateTimeOffset();
        Assert.InRange(expiresAt, before.AddMinutes(15).AddSeconds(-2), DateTimeOffset.UtcNow.AddMinutes(15).AddSeconds(1));
        Assert.Equal(TimeSpan.Zero, expiresAt.Offset);

        var user = await WithDbAsync(db => db.Users.SingleAsync(Ct));
        Assert.Equal(IdentityProvider.Dev, user.Provider);
        Assert.Equal("alice", user.ProviderSubject);
    }

    [Fact]
    public async Task Access_token_from_dev_login_authenticates_requests()
    {
        var session = await SignInDevAsync();

        var response = await CreateClient(session.AccessToken).GetAsync("/api/v1/me", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(session.User.Id, (await ReadJsonAsync(response)).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Dev_login_with_the_same_subject_loads_the_same_account()
    {
        var first = await SignInDevAsync("alice", "Alice");
        var second = await SignInDevAsync("alice", "Another name");

        Assert.Equal(first.User.Id, second.User.Id);
        Assert.Equal("Alice", second.User.DisplayName);
        Assert.Equal(1, await WithDbAsync(db => db.Users.CountAsync(Ct)));
    }

    [Fact]
    public async Task Dev_login_validates_its_fields()
    {
        var response = await CreateClient().PostAsJsonAsync("/api/v1/auth/dev", new { subject = "", displayName = new string('a', 51) }, Ct);

        await AssertValidationProblemAsync(response, "subject", "displayName");
    }

    [Fact]
    public async Task Dev_login_with_an_email_stores_it_and_an_admin_email_makes_an_administrator()
    {
        var tester = await SignInDevAsync("tester", "Tester", "tester@dogo.test");
        var admin = await SignInDevAsync("admin", "Admin", " Admin@Dogo.Test ");
        var again = await SignInDevAsync("tester", "Tester");

        Assert.Equal(("tester@dogo.test", false), (tester.User.Email, tester.User.IsAdmin));
        Assert.Equal(("Admin@Dogo.Test", true), (admin.User.Email, admin.User.IsAdmin));
        Assert.Equal("tester@dogo.test", again.User.Email);
    }

    [Fact]
    public async Task Dev_login_validates_the_email()
    {
        var response = await CreateClient().PostAsJsonAsync("/api/v1/auth/dev", new { subject = "alice", displayName = "Alice", email = "not-an-email" }, Ct);

        await AssertValidationProblemAsync(response, "email");
    }

    [Fact]
    public async Task Dev_login_returns_404_when_disabled()
    {
        await using var factory = new DogoApiFactory(Fixture.ConnectionString, new Dictionary<string, string?> { ["Auth:AllowDevLogin"] = "false" });

        var response = await factory.CreateClient().PostAsJsonAsync("/api/v1/auth/dev", new { subject = "alice", displayName = "Alice" }, Ct);

        await AssertProblemAsync(response, HttpStatusCode.NotFound, "not_found");
        Assert.Equal(0, await WithDbAsync(db => db.Users.CountAsync(Ct)));
    }
}
