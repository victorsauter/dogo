using System.Net;
using System.Text;
using Dogo.Api.Tests.Infrastructure;

namespace Dogo.Api.Tests.Common;

/// <summary>
/// Where development tools are off (Production, any environment outside the allow list, or a
/// development environment with the option off), <c>/auth/dev</c> and <c>/dev/demo-data</c> do not
/// exist: they answer exactly like an unknown route, whatever the body (401 without a token, as every
/// unknown route behind the fallback policy, 404 with one), never a validation error that would reveal
/// them (ADR 0031).
/// </summary>
public sealed class DevToolsHiddenTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    public static TheoryData<string> Hosts() => new()
    {
        "Production",
        "Staging",
        "Testing",
        "Development",
    };

    private DogoApiFactory CreateHost(string environment)
    {
        var settings = new Dictionary<string, string?>
        {
            ["Auth:AllowDevLogin"] = "false",
            ["DemoData:Enabled"] = "false",
        };
        if (environment is not ("Testing" or "Development"))
        {
            settings["Notifications:Provider"] = "Expo";
            settings["Auth:Google:Audiences:0"] = "client-id.apps.googleusercontent.com";
        }

        return new DogoApiFactory(Fixture.ConnectionString, settings, environment);
    }

    private static StringContent Raw(string text, string contentType = "application/json") =>
        new(text, Encoding.UTF8, contentType);

    [Theory]
    [MemberData(nameof(Hosts))]
    public async Task The_dev_routes_answer_like_an_unknown_route_without_a_token(string environment)
    {
        await using var host = CreateHost(environment);
        var client = host.CreateClient();

        var unknown = (await client.GetAsync("/api/v1/does-not-exist", Ct)).StatusCode;
        Assert.Equal(HttpStatusCode.Unauthorized, unknown);

        foreach (var body in new[] { "{}", "not json", "", "{\"subject\":\"alice\",\"displayName\":\"Alice\"}" })
        {
            Assert.Equal(unknown, (await client.PostAsync("/api/v1/auth/dev", Raw(body), Ct)).StatusCode);
            Assert.Equal(unknown, (await client.PostAsync("/api/v1/dev/demo-data", Raw(body), Ct)).StatusCode);
        }

        Assert.Equal(unknown, (await client.PostAsync("/api/v1/auth/dev", Raw("x", "text/plain"), Ct)).StatusCode);
        Assert.Equal(unknown, (await client.GetAsync("/api/v1/dev/demo-data", Ct)).StatusCode);
        Assert.Equal(unknown, (await client.DeleteAsync("/api/v1/dev/demo-data", Ct)).StatusCode);
    }

    [Theory]
    [MemberData(nameof(Hosts))]
    public async Task The_dev_routes_answer_404_to_an_authenticated_caller_too(string environment)
    {
        // The token comes from the regular test host (same database, same signing key).
        var session = await SignInDevAsync();
        await using var host = CreateHost(environment);
        var client = host.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/me", Ct)).StatusCode);
        foreach (var body in new[] { "{}", "not json" })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync("/api/v1/auth/dev", Raw(body), Ct)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync("/api/v1/dev/demo-data", Raw(body), Ct)).StatusCode);
        }

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/v1/dev/demo-data", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync("/api/v1/dev/demo-data", Ct)).StatusCode);
    }

    [Fact]
    public async Task The_other_auth_routes_stay_available_when_the_dev_sign_in_is_off()
    {
        await using var host = CreateHost("Production");

        var response = await host.CreateClient().PostAsync("/api/v1/auth/refresh", Raw("{}"), Ct);

        await AssertValidationProblemAsync(response, "refreshToken");
    }
}
