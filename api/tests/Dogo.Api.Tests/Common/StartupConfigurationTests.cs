using Dogo.Api.Tests.Infrastructure;

namespace Dogo.Api.Tests.Common;

/// <summary>The application refuses to start with an unsafe authentication configuration.</summary>
public sealed class StartupConfigurationTests(ApiFixture fixture)
{
    [Fact]
    public async Task Dev_login_enabled_in_production_prevents_startup()
    {
        await using var factory = new DogoApiFactory(fixture.ConnectionString, new Dictionary<string, string?> { ["Auth:AllowDevLogin"] = "true" }, "Production");

        var exception = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains("AllowDevLogin", exception.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Dev_login_disabled_in_production_starts()
    {
        await using var factory = new DogoApiFactory(fixture.ConnectionString, new Dictionary<string, string?> { ["Auth:AllowDevLogin"] = "false" }, "Production");

        var response = await factory.CreateClient().GetAsync("/api/v1/health", TestContext.Current.CancellationToken);

        Assert.True(response.IsSuccessStatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("too-short")]
    public async Task Missing_or_short_signing_key_prevents_startup(string signingKey)
    {
        await using var factory = new DogoApiFactory(fixture.ConnectionString, new Dictionary<string, string?> { ["Auth:Jwt:SigningKey"] = signingKey });

        var exception = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains("SigningKey", exception.ToString(), StringComparison.Ordinal);
    }
}
