using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Infrastructure.Hosting;
using Dogo.Api.Infrastructure.Push;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Dogo.Api.Tests.Common;

/// <summary>
/// The application refuses to start with an unsafe or incomplete configuration. Development tools
/// are allowed in Development and Testing only (allow list, ADR 0031).
/// </summary>
public sealed class StartupConfigurationTests(ApiFixture fixture)
{
    /// <summary>What a Production deployment needs to start, on top of the factory's values.</summary>
    private static Dictionary<string, string?> ProductionSettings(params (string Key, string? Value)[] overrides)
    {
        var settings = new Dictionary<string, string?>
        {
            ["Notifications:Provider"] = "Expo",
            ["Auth:Google:Audiences:0"] = "client-id.apps.googleusercontent.com",
        };
        foreach (var (key, value) in overrides)
        {
            settings[key] = value;
        }

        return settings;
    }

    private static void AssertStartupFails(DogoApiFactory factory, string expected)
    {
        var exception = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains(expected, exception.ToString(), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    [InlineData("Preview")]
    public async Task Dev_login_outside_development_and_testing_prevents_startup(string environment)
    {
        await using var factory = new DogoApiFactory(
            fixture.ConnectionString, ProductionSettings(("Auth:AllowDevLogin", "true")), environment);

        AssertStartupFails(factory, "Auth:AllowDevLogin must not be enabled");
    }

    [Theory]
    [InlineData("00:10:00")]
    [InlineData("-00:00:01")]
    public async Task A_refresh_token_grace_period_out_of_range_prevents_startup(string gracePeriod)
    {
        await using var factory = new DogoApiFactory(
            fixture.ConnectionString, new Dictionary<string, string?> { ["Auth:Jwt:RefreshTokenGracePeriod"] = gracePeriod });

        AssertStartupFails(factory, "Auth:Jwt:RefreshTokenGracePeriod must be between");
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public async Task Demo_data_outside_development_and_testing_prevents_startup(string environment)
    {
        await using var factory = new DogoApiFactory(
            fixture.ConnectionString, ProductionSettings(("DemoData:Enabled", "true")), environment);

        AssertStartupFails(factory, "DemoData:Enabled must not be enabled");
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public async Task Without_dev_tools_the_api_starts(string environment)
    {
        await using var factory = new DogoApiFactory(fixture.ConnectionString, ProductionSettings(), environment);

        var response = await factory.CreateClient().GetAsync("/api/v1/health", TestContext.Current.CancellationToken);

        Assert.True(response.IsSuccessStatusCode);
    }

    [Fact]
    public async Task Demo_data_without_the_dev_sign_in_prevents_startup()
    {
        await using var factory = new DogoApiFactory(
            fixture.ConnectionString, new Dictionary<string, string?> { ["Auth:AllowDevLogin"] = "false", ["DemoData:Enabled"] = "true" });

        AssertStartupFails(factory, "DemoData:Enabled requires Auth:AllowDevLogin");
    }

    [Theory]
    [InlineData("")]
    [InlineData("too-short")]
    public async Task Missing_or_short_signing_key_prevents_startup(string signingKey)
    {
        await using var factory = new DogoApiFactory(fixture.ConnectionString, new Dictionary<string, string?> { ["Auth:Jwt:SigningKey"] = signingKey });

        AssertStartupFails(factory, "SigningKey");
    }

    [Theory]
    [InlineData("Testing")]
    [InlineData("Staging")]
    [InlineData("Production")]
    public async Task The_committed_development_signing_key_prevents_startup_outside_development(string environment)
    {
        await using var factory = new DogoApiFactory(
            fixture.ConnectionString, ProductionSettings(("Auth:Jwt:SigningKey", JwtOptions.DevelopmentSigningKey)), environment);

        AssertStartupFails(factory, "development key");
    }

    [Fact]
    public async Task The_development_configuration_file_holds_the_known_development_key()
    {
        // Guards the constant: if the committed key changes, the check above must follow it.
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "src", "Dogo.Api", "appsettings.Development.json")))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        var path = Path.Combine(directory.FullName, "src", "Dogo.Api", "appsettings.Development.json");
        var json = await File.ReadAllTextAsync(path, TestContext.Current.CancellationToken);

        Assert.Contains($"\"{JwtOptions.DevelopmentSigningKey}\"", json, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("Staging")]
    [InlineData("Production")]
    public async Task An_empty_connection_string_prevents_startup_outside_development(string environment)
    {
        await using var factory = new DogoApiFactory("", ProductionSettings(), environment);

        AssertStartupFails(factory, "ConnectionStrings:Dogo is empty");
    }

    [Fact]
    public async Task The_log_notification_provider_prevents_startup_in_production()
    {
        await using var factory = new DogoApiFactory(
            fixture.ConnectionString, ProductionSettings(("Notifications:Provider", "Log")), "Production");

        AssertStartupFails(factory, "Notifications:Provider is Log in Production");
    }

    [Fact]
    public async Task No_apple_nor_google_audience_prevents_startup_in_production()
    {
        await using var factory = new DogoApiFactory(
            fixture.ConnectionString, ProductionSettings(("Auth:Google:Audiences:0", null)), "Production");

        AssertStartupFails(factory, "Auth:Apple:Audiences and Auth:Google:Audiences are both empty");
    }

    [Fact]
    public async Task Staging_may_use_the_log_provider_and_no_audience()
    {
        await using var factory = new DogoApiFactory(fixture.ConnectionString, environment: "Staging");

        var response = await factory.CreateClient().GetAsync("/api/v1/health", TestContext.Current.CancellationToken);

        Assert.True(response.IsSuccessStatusCode);
    }

    [Fact]
    public void A_missing_time_zone_is_a_startup_failure_outside_development()
    {
        static IReadOnlyList<string> Check(string environment, Func<string, bool> timeZoneExists) => StartupChecks.Check(
            new Environment(environment), "Host=db", PushProvider.Expo, ["com.example.app"], [], timeZoneExists);

        var failure = Assert.Single(Check("Production", _ => false));
        Assert.Contains("Europe/Paris", failure, StringComparison.Ordinal);
        Assert.Single(Check("Staging", _ => false));
        Assert.Empty(Check("Development", _ => false));
        Assert.Empty(Check("Production", id => id == "Europe/Paris"));
    }

    [Fact]
    public void Europe_paris_is_available_on_this_machine()
    {
        Assert.True(StartupChecks.TimeZoneExists(StartupChecks.RequiredTimeZone));
        Assert.False(StartupChecks.TimeZoneExists("Nowhere/Atlantis"));
    }

    private sealed class Environment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;

        public string ApplicationName { get; set; } = "Dogo.Api";

        public string ContentRootPath { get; set; } = "";

        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
