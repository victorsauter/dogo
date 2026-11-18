using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Dogo.Api.Features.Auth;
using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Dogo.Api.Tests.Admin;

/// <summary>
/// ADR 0031: an administrator is an active account; a dev sign-in account is one only in
/// Development and Testing, where anyone may claim any e-mail through <c>/auth/dev</c>.
/// </summary>
public sealed class AdminAccountTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private async Task<User> InsertUserAsync(IdentityProvider provider, string subject)
    {
        var user = new User { Provider = provider, ProviderSubject = subject, DisplayName = subject, Email = DogoApiFactory.AdminEmail };
        await WithDbAsync(async db =>
        {
            db.Users.Add(user);
            await db.SaveChangesAsync(Ct);
        });
        return user;
    }

    private static HttpClient ClientFor(DogoApiFactory factory, Guid userId)
    {
        var client = factory.CreateClient();
        var (token, _) = factory.Services.GetRequiredService<AccessTokenIssuer>().Issue(userId);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    [Fact]
    public async Task Outside_development_and_testing_a_dev_account_is_never_an_administrator()
    {
        // E.g. a staging database where the dev sign-in was once enabled.
        var devAccount = await InsertUserAsync(IdentityProvider.Dev, "admin");
        var googleAccount = await InsertUserAsync(IdentityProvider.Google, "google-admin");
        await using var staging = new DogoApiFactory(Fixture.ConnectionString, environment: "Staging");

        await AssertProblemAsync(
            await ClientFor(staging, devAccount.Id).GetAsync("/api/v1/admin/reports", Ct), HttpStatusCode.Forbidden, "admin.forbidden");
        Assert.Equal(HttpStatusCode.OK, (await ClientFor(staging, googleAccount.Id).GetAsync("/api/v1/admin/reports", Ct)).StatusCode);
    }

    [Fact]
    public async Task In_testing_a_dev_account_with_a_listed_email_is_an_administrator()
    {
        var (admin, session) = await AdminAsync();

        Assert.True(session.User.IsAdmin);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/v1/admin/reports", Ct)).StatusCode);
    }

    [Fact]
    public async Task In_development_the_dev_administrator_keeps_working()
    {
        await using var development = new DogoApiFactory(Fixture.ConnectionString, environment: "Development");
        var signIn = await development.CreateClient().PostAsJsonAsync(
            "/api/v1/auth/dev", new { subject = "admin", displayName = "Admin", email = DogoApiFactory.AdminEmail }, Ct);
        var session = (await signIn.Content.ReadFromJsonAsync<SessionResponse>(Json, Ct))!;

        Assert.True(session.User.IsAdmin);
        Assert.Equal(HttpStatusCode.OK, (await ClientFor(development, session.User.Id).GetAsync("/api/v1/admin/reports", Ct)).StatusCode);
    }

    [Fact]
    public async Task A_suspended_administrator_is_no_longer_an_administrator()
    {
        var (admin, _) = await AdminAsync("admin");
        var (other, otherSession) = await AdminAsync("other-admin");
        Assert.Equal(HttpStatusCode.OK, (await other.GetAsync("/api/v1/admin/reports", Ct)).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/v1/admin/users/{otherSession.User.Id}/suspend", null, Ct)).StatusCode);

        // Reads stay allowed to a suspended account, but not the administration.
        await AssertProblemAsync(await other.GetAsync("/api/v1/admin/reports", Ct), HttpStatusCode.Forbidden, "admin.forbidden");
    }
}
