using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Auth;
using Dogo.Api.Features.Users;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Auth;

public sealed class ProviderSignInTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    [Fact]
    public async Task Apple_sign_in_creates_the_account_on_first_sign_in()
    {
        var response = await CreateClient().PostAsJsonAsync("/api/v1/auth/apple", new
        {
            identityToken = FakeIdentityTokenValidator.Token("apple-sub", "alice@privaterelay.appleid.com"),
            displayName = "Alice Martin",
        }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var session = (await response.Content.ReadFromJsonAsync<SessionResponse>(Json, Ct))!;
        Assert.Equal("Alice Martin", session.User.DisplayName);
        Assert.Equal("alice@privaterelay.appleid.com", session.User.Email);
        Assert.False(string.IsNullOrEmpty(session.AccessToken));
        Assert.False(string.IsNullOrEmpty(session.RefreshToken));

        var user = await WithDbAsync(db => db.Users.SingleAsync(Ct));
        Assert.Equal(IdentityProvider.Apple, user.Provider);
        Assert.Equal("apple-sub", user.ProviderSubject);
    }

    [Fact]
    public async Task Apple_sign_in_loads_the_existing_account()
    {
        var token = FakeIdentityTokenValidator.Token("apple-sub");
        var first = await SignInAsync("apple", new { identityToken = token, displayName = "Alice" });
        var second = await SignInAsync("apple", new { identityToken = token, displayName = "Someone else" });

        Assert.Equal(first.User.Id, second.User.Id);
        Assert.Equal("Alice", second.User.DisplayName);
        Assert.Equal(1, await WithDbAsync(db => db.Users.CountAsync(Ct)));
    }

    [Fact]
    public async Task Apple_sign_in_without_a_name_uses_a_default_display_name()
    {
        var session = await SignInAsync("apple", new { identityToken = FakeIdentityTokenValidator.Token("apple-sub") });

        Assert.Equal(SessionService.DefaultDisplayName, session.User.DisplayName);
    }

    [Fact]
    public async Task Apple_sign_in_rejects_an_invalid_token()
    {
        var response = await CreateClient().PostAsJsonAsync("/api/v1/auth/apple", new { identityToken = "forged" }, Ct);

        await AssertProblemAsync(response, HttpStatusCode.Unauthorized, "auth.invalid_token");
        Assert.Equal(0, await WithDbAsync(db => db.Users.CountAsync(Ct)));
    }

    [Fact]
    public async Task Google_sign_in_creates_the_account_with_the_name_from_the_token()
    {
        var session = await SignInAsync("google", new { idToken = FakeIdentityTokenValidator.Token("google-sub", "bob@gmail.com", "Bob Durand") });

        Assert.Equal("Bob Durand", session.User.DisplayName);
        Assert.Equal("bob@gmail.com", session.User.Email);
        var user = await WithDbAsync(db => db.Users.SingleAsync(Ct));
        Assert.Equal(IdentityProvider.Google, user.Provider);
    }

    [Fact]
    public async Task Google_sign_in_rejects_an_invalid_token()
    {
        var response = await CreateClient().PostAsJsonAsync("/api/v1/auth/google", new { idToken = "forged" }, Ct);

        await AssertProblemAsync(response, HttpStatusCode.Unauthorized, "auth.invalid_token");
    }

    [Fact]
    public async Task Google_sign_in_requires_the_token()
    {
        var response = await CreateClient().PostAsJsonAsync("/api/v1/auth/google", new { idToken = "" }, Ct);

        await AssertValidationProblemAsync(response, "idToken");
    }

    [Fact]
    public async Task The_same_subject_at_two_providers_is_two_accounts()
    {
        var apple = await SignInAsync("apple", new { identityToken = FakeIdentityTokenValidator.Token("same-sub") });
        var google = await SignInAsync("google", new { idToken = FakeIdentityTokenValidator.Token("same-sub") });

        Assert.NotEqual(apple.User.Id, google.User.Id);
    }

    [Fact]
    public async Task Suspended_user_cannot_sign_in()
    {
        var token = FakeIdentityTokenValidator.Token("google-sub");
        var session = await SignInAsync("google", new { idToken = token });
        await WithDbAsync(db => db.Users.Where(u => u.Id == session.User.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, UserStatus.Suspended), Ct));

        var response = await CreateClient().PostAsJsonAsync("/api/v1/auth/google", new { idToken = token }, Ct);

        await AssertProblemAsync(response, HttpStatusCode.Forbidden, "account.suspended");
    }

    [Fact]
    public async Task Users_whose_email_is_configured_are_administrators()
    {
        var admin = await SignInAsync("google", new { idToken = FakeIdentityTokenValidator.Token("admin-sub", DogoApiFactory.AdminEmail.ToUpperInvariant()) });
        var regular = await SignInAsync("google", new { idToken = FakeIdentityTokenValidator.Token("user-sub", "someone@gmail.com") });
        var withoutEmail = await SignInAsync("google", new { idToken = FakeIdentityTokenValidator.Token("no-email-sub") });

        Assert.True(admin.User.IsAdmin);
        Assert.False(regular.User.IsAdmin);
        Assert.False(withoutEmail.User.IsAdmin);
    }

    private async Task<SessionResponse> SignInAsync(string provider, object body)
    {
        var response = await CreateClient().PostAsJsonAsync($"/api/v1/auth/{provider}", body, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SessionResponse>(Json, Ct))!;
    }
}
