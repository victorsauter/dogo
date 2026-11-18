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
    public async Task Replaying_a_replaced_token_within_the_grace_period_gives_another_session_of_the_same_family()
    {
        // The response of the first refresh was lost: the app sends the old token again.
        var session = await SignInDevAsync();
        var lost = await ReadSessionAsync(await RefreshAsync(session.RefreshToken));

        var replay = await RefreshAsync(session.RefreshToken);

        var recovered = await ReadSessionAsync(replay);
        Assert.NotEqual(lost.RefreshToken, recovered.RefreshToken);
        Assert.Equal(session.User.Id, recovered.User.Id);
        Assert.Equal(HttpStatusCode.OK, (await CreateClient(recovered.AccessToken).GetAsync("/api/v1/me", Ct)).StatusCode);

        // Both successors are live tokens of the sign-in's family.
        Assert.Single(await WithDbAsync(db => db.RefreshTokens.Select(t => t.FamilyId).Distinct().ToListAsync(Ct)));
        Assert.Equal(HttpStatusCode.OK, (await RefreshAsync(recovered.RefreshToken)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await RefreshAsync(lost.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task Two_concurrent_refreshes_with_the_same_token_both_succeed()
    {
        var session = await SignInDevAsync();

        var responses = await Task.WhenAll(RefreshAsync(session.RefreshToken), RefreshAsync(session.RefreshToken));

        var sessions = await Task.WhenAll(responses.Select(ReadSessionAsync));
        Assert.NotEqual(sessions[0].RefreshToken, sessions[1].RefreshToken);

        // Neither revoked the other: whichever response the app keeps still works.
        Assert.Equal(HttpStatusCode.OK, (await RefreshAsync(sessions[0].RefreshToken)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await RefreshAsync(sessions[1].RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task Reusing_a_replaced_token_after_the_grace_period_revokes_its_family_only()
    {
        // Two devices of the same user: two sign-ins, two families.
        var phone = await SignInDevAsync();
        var tablet = await SignInDevAsync();
        var rotated = await ReadSessionAsync(await RefreshAsync(phone.RefreshToken));
        await MoveRotationBackAsync(phone.RefreshToken, TimeSpan.FromMinutes(2));

        var reuse = await RefreshAsync(phone.RefreshToken);

        await AssertProblemAsync(reuse, HttpStatusCode.Unauthorized, "auth.invalid_token");
        await AssertProblemAsync(await RefreshAsync(rotated.RefreshToken), HttpStatusCode.Unauthorized, "auth.invalid_token");
        Assert.Equal(HttpStatusCode.OK, (await RefreshAsync(tablet.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task A_replaced_token_is_not_accepted_again_once_its_session_is_logged_out()
    {
        var session = await SignInDevAsync();
        var rotated = await ReadSessionAsync(await RefreshAsync(session.RefreshToken));
        await CreateClient().PostAsJsonAsync("/api/v1/auth/logout", new { refreshToken = rotated.RefreshToken }, Ct);

        await AssertProblemAsync(await RefreshAsync(session.RefreshToken), HttpStatusCode.Unauthorized, "auth.invalid_token");
    }

    [Fact]
    public async Task Logout_revokes_the_tokens_issued_during_a_grace_period_but_not_other_sessions()
    {
        var phone = await SignInDevAsync();
        var tablet = await SignInDevAsync();
        var first = await ReadSessionAsync(await RefreshAsync(phone.RefreshToken));
        var second = await ReadSessionAsync(await RefreshAsync(phone.RefreshToken));

        await CreateClient().PostAsJsonAsync("/api/v1/auth/logout", new { refreshToken = second.RefreshToken }, Ct);

        await AssertProblemAsync(await RefreshAsync(first.RefreshToken), HttpStatusCode.Unauthorized, "auth.invalid_token");
        Assert.Equal(HttpStatusCode.OK, (await RefreshAsync(tablet.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task Reuse_does_not_affect_other_users()
    {
        var alice = await SignInDevAsync("alice", "Alice");
        var bob = await SignInDevAsync("bob", "Bob");
        await RefreshAsync(alice.RefreshToken);
        await MoveRotationBackAsync(alice.RefreshToken, TimeSpan.FromMinutes(2));

        await AssertProblemAsync(await RefreshAsync(alice.RefreshToken), HttpStatusCode.Unauthorized, "auth.invalid_token");

        Assert.Equal(HttpStatusCode.OK, (await RefreshAsync(bob.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task A_suspended_user_gets_no_session_through_the_grace_period()
    {
        var session = await SignInDevAsync();
        await RefreshAsync(session.RefreshToken);
        await WithDbAsync(db => db.Users.ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, UserStatus.Suspended), Ct));

        await AssertProblemAsync(await RefreshAsync(session.RefreshToken), HttpStatusCode.Forbidden, "account.suspended");
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

    private static async Task<SessionResponse> ReadSessionAsync(HttpResponseMessage response)
    {
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<SessionResponse>(Json, Ct))!;
    }

    /// <summary>Makes the rotation of <paramref name="refreshToken"/> look older, e.g. past the grace period.</summary>
    private Task MoveRotationBackAsync(string refreshToken, TimeSpan age)
    {
        var hash = SessionService.Hash(refreshToken);
        var at = DateTimeOffset.UtcNow - age;
        return WithDbAsync(db => db.RefreshTokens.Where(t => t.TokenHash == hash)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, at).SetProperty(t => t.ReplacedAt, at), Ct));
    }
}
