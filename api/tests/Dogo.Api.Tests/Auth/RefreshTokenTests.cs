using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Auth;
using Dogo.Api.Features.Users;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Auth;

public sealed class RefreshTokenTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    [Fact]
    public async Task Refresh_returns_a_new_session_and_rotates_the_token()
    {
        var session = await SignInDevAsync();

        var refreshed = await RefreshAsync(session.RefreshToken);

        Assert.Equal(HttpStatusCode.OK, refreshed.StatusCode);
        var newSession = (await refreshed.Content.ReadFromJsonAsync<SessionResponse>(Json, Ct))!;
        Assert.NotEqual(session.RefreshToken, newSession.RefreshToken);
        Assert.Equal(session.User.Id, newSession.User.Id);
        Assert.Equal(HttpStatusCode.OK, (await CreateClient(newSession.AccessToken).GetAsync("/api/v1/me", Ct)).StatusCode);

        // The new token works, the old one does not.
        Assert.Equal(HttpStatusCode.OK, (await RefreshAsync(newSession.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task Reusing_a_revoked_token_revokes_all_the_user_tokens()
    {
        var sessionA = await SignInDevAsync();
        var sessionB = await SignInDevAsync();
        var rotated = (await (await RefreshAsync(sessionA.RefreshToken)).Content.ReadFromJsonAsync<SessionResponse>(Json, Ct))!;

        var reuse = await RefreshAsync(sessionA.RefreshToken);

        await AssertProblemAsync(reuse, HttpStatusCode.Unauthorized, "auth.invalid_token");
        await AssertProblemAsync(await RefreshAsync(rotated.RefreshToken), HttpStatusCode.Unauthorized, "auth.invalid_token");
        await AssertProblemAsync(await RefreshAsync(sessionB.RefreshToken), HttpStatusCode.Unauthorized, "auth.invalid_token");
    }

    [Fact]
    public async Task Reuse_does_not_affect_other_users()
    {
        var alice = await SignInDevAsync("alice", "Alice");
        var bob = await SignInDevAsync("bob", "Bob");
        await RefreshAsync(alice.RefreshToken);

        await RefreshAsync(alice.RefreshToken);

        Assert.Equal(HttpStatusCode.OK, (await RefreshAsync(bob.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task Expired_refresh_token_is_rejected()
    {
        var session = await SignInDevAsync();
        await WithDbAsync(db => db.RefreshTokens.ExecuteUpdateAsync(s => s.SetProperty(t => t.ExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-1)), Ct));

        await AssertProblemAsync(await RefreshAsync(session.RefreshToken), HttpStatusCode.Unauthorized, "auth.invalid_token");
    }

    [Fact]
    public async Task Unknown_refresh_token_is_rejected()
    {
        await AssertProblemAsync(await RefreshAsync("unknown"), HttpStatusCode.Unauthorized, "auth.invalid_token");
    }

    [Fact]
    public async Task Refresh_tokens_last_30_days_and_are_stored_hashed()
    {
        var session = await SignInDevAsync();

        var stored = await WithDbAsync(db => db.RefreshTokens.SingleAsync(Ct));

        Assert.NotEqual(session.RefreshToken, stored.TokenHash);
        Assert.Equal(SessionService.Hash(session.RefreshToken), stored.TokenHash);
        Assert.InRange(stored.ExpiresAt, DateTimeOffset.UtcNow.AddDays(30).AddMinutes(-1), DateTimeOffset.UtcNow.AddDays(30).AddMinutes(1));
    }

    [Fact]
    public async Task Suspended_user_cannot_refresh()
    {
        var session = await SignInDevAsync();
        await WithDbAsync(db => db.Users.ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, UserStatus.Suspended), Ct));

        await AssertProblemAsync(await RefreshAsync(session.RefreshToken), HttpStatusCode.Forbidden, "account.suspended");
    }

    [Fact]
    public async Task Logout_revokes_the_refresh_token()
    {
        var session = await SignInDevAsync();

        var logout = await CreateClient().PostAsJsonAsync("/api/v1/auth/logout", new { refreshToken = session.RefreshToken }, Ct);

        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        await AssertProblemAsync(await RefreshAsync(session.RefreshToken), HttpStatusCode.Unauthorized, "auth.invalid_token");
    }

    [Fact]
    public async Task Logout_with_an_unknown_token_succeeds()
    {
        var logout = await CreateClient().PostAsJsonAsync("/api/v1/auth/logout", new { refreshToken = "unknown" }, Ct);

        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
    }

    private Task<HttpResponseMessage> RefreshAsync(string refreshToken) =>
        CreateClient().PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken }, Ct);
}
